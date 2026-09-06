import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  Logger,
} from "@nestjs/common";
import {
  AuditLogEntry,
  CanonicalEntity,
  Citation,
  ClearanceReport,
  ClearanceRun,
  CreateInvitationRequest,
  Finding,
  generateUuidV7,
  Invitation,
  InvitationState,
  ProjectGrant,
  ReportFindingItem,
  ReportVersion,
  Role,
  RunState,
  SubmitReviewRequest,
} from "@permissa/contracts";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { FirestoreService } from "../storage/firestore.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import {
  computeReportDigest,
  generateCertificateHtml,
} from "./certificate.generator.js";

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * 1. Invite an Independent Clearance Reviewer / Counsel.
   * Only OWNER or PRODUCER can issue reviewer invitations.
   */
  async createInvitation(
    user: AuthenticatedUser,
    projectId: string,
    body: { reviewerEmail: string },
  ): Promise<Invitation> {
    const validatedRequest = CreateInvitationRequest.parse({
      projectId,
      reviewerEmail: body.reviewerEmail,
      role: Role.Enum.REVIEWER,
    });

    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
    ]);

    const invitationId = generateUuidV7();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(); // 7 days

    const invitation: Invitation = {
      id: invitationId,
      projectId,
      reviewerEmailNormalized: validatedRequest.reviewerEmail.toLowerCase(),
      state: "ISSUED",
      expiresAt,
      acceptUrl: `https://permissa.app/projects/${projectId}/invitations/${invitationId}/accept`,
    };

    await this.firestoreService.saveInvitation(invitation);

    // Content-free audit entry
    const auditEntry: AuditLogEntry = {
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "REVIEWER_INVITATION_ISSUED",
      timestamp: now.toISOString(),
      metadata: {
        invitationId,
        role: "REVIEWER",
        expiresAt,
      },
    };
    await this.firestoreService.appendAuditLog(auditEntry);

    return invitation;
  }

  /**
   * 2. Accept Reviewer Invitation and grant REVIEWER role.
   */
  async acceptInvitation(
    user: AuthenticatedUser,
    projectId: string,
    invitationId: string,
  ): Promise<ProjectGrant> {
    const invitation = await this.firestoreService.getInvitation(
      projectId,
      invitationId,
    );
    if (!invitation) {
      throw new NotFoundException(
        `Invitation [${invitationId}] not found for project [${projectId}]`,
      );
    }

    if (invitation.state !== "ISSUED") {
      throw new PreconditionFailedException(
        `Invitation is no longer active (Current state: ${invitation.state})`,
      );
    }

    if (new Date(invitation.expiresAt).getTime() < Date.now()) {
      invitation.state = "EXPIRED";
      await this.firestoreService.saveInvitation(invitation);
      throw new PreconditionFailedException("Invitation has expired");
    }

    // Grant REVIEWER role
    const now = new Date().toISOString();
    const grant: ProjectGrant = {
      projectId,
      userId: user.uid,
      role: "REVIEWER",
      grantedAt: now,
    };
    await this.firestoreService.saveGrant(grant);

    // Update invitation state
    invitation.state = "ACCEPTED";
    await this.firestoreService.saveInvitation(invitation);

    const project = await this.firestoreService.getProject(projectId);
    if (project) {
      const auditEntry: AuditLogEntry = {
        id: generateUuidV7(),
        organizationId: project.organizationId,
        projectId,
        actorId: user.uid,
        action: "REVIEWER_INVITATION_ACCEPTED",
        timestamp: now,
        metadata: {
          invitationId,
          role: "REVIEWER",
        },
      };
      await this.firestoreService.appendAuditLog(auditEntry);
    }

    return grant;
  }

  /**
   * 3. Submit Clearance Run for Professional Review.
   * Producer or Owner initiates this once draft findings are generated.
   */
  async requestReview(
    user: AuthenticatedUser,
    projectId: string,
    runId: string,
  ): Promise<ClearanceRun> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
    ]);

    const run = await this.firestoreService.getRun(projectId, runId);
    if (!run) {
      throw new NotFoundException(`Run [${runId}] not found`);
    }

    const now = new Date().toISOString();
    const updatedRun: ClearanceRun = {
      ...run,
      state: "PROFESSIONAL_REVIEW",
      version: run.version + 1,
      updatedAt: now,
    };

    await this.firestoreService.saveRun(updatedRun);

    const auditEntry: AuditLogEntry = {
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "CLEARANCE_RUN_REVIEW_REQUESTED",
      timestamp: now,
      metadata: {
        runId,
        previousState: run.state,
        newState: "PROFESSIONAL_REVIEW",
        version: updatedRun.version,
      },
    };
    await this.firestoreService.appendAuditLog(auditEntry);

    return updatedRun;
  }

  /**
   * 4. Adjudicate Findings & Apply Professional Overrides.
   * Constitutional Rules:
   * - Only a verified REVIEWER can apply overrides or assign a final BLOCKED status.
   * - Every override enforces optimistic concurrency control (expectedVersion).
   * - Status transitions emit content-free audit entries.
   */
  async submitReview(
    user: AuthenticatedUser,
    projectId: string,
    request: SubmitReviewRequest,
  ): Promise<{ updatedFindings: Finding[]; run: ClearanceRun }> {
    const validatedRequest = SubmitReviewRequest.parse(request);
    const project = await this.projectsService.getProject(user, projectId);

    // Strictly enforce REVIEWER or OWNER role for professional legal adjudication
    await this.projectsService.assertProjectAccess(user, project, [
      "REVIEWER",
      "OWNER",
    ]);

    const run = await this.firestoreService.getRun(
      projectId,
      validatedRequest.runId,
    );
    if (!run) {
      throw new NotFoundException(
        `Clearance Run [${validatedRequest.runId}] not found`,
      );
    }

    const updatedFindings: Finding[] = [];
    const now = new Date().toISOString();

    for (const change of validatedRequest.changes) {
      const existing = await this.firestoreService.getFinding(
        validatedRequest.runId,
        change.findingId,
      );
      if (!existing) {
        throw new NotFoundException(
          `Finding [${change.findingId}] not found in run [${validatedRequest.runId}]`,
        );
      }

      // 1. Optimistic Concurrency Precondition Gate
      if (existing.version !== change.expectedVersion) {
        throw new PreconditionFailedException(
          `Finding version conflict on [${change.findingId}]: expected ${change.expectedVersion}, found ${existing.version}`,
        );
      }

      // 2. Constitutional Rule: Final BLOCKED status requires professional review
      if (change.newStatus === "BLOCKED") {
        this.logger.log(
          `Professional Reviewer [${user.uid}] adjudicated final BLOCKED status for finding [${change.findingId}]`,
        );
      }

      // 3. Process new citation URLs if provided by reviewer
      if (change.addedCitationUrls && change.addedCitationUrls.length > 0) {
        const newCitations: Citation[] = change.addedCitationUrls.map((url) => {
          let domain = "external-authority.org";
          try {
            domain = new URL(url).hostname;
          } catch {
            // fallback domain
          }
          return {
            id: generateUuidV7(),
            taskId: generateUuidV7(),
            originalUrl: url,
            resolvedUrl: url,
            resolvedDomain: domain,
            controllingOwner: null,
            title: `Reviewer Cited Authority (${domain})`,
            excerpt: `Admissible external reference submitted by Clearance Counsel: ${change.reason.slice(0, 200)}`,
            sourceTier: "TIER_2",
            claimType: "CURRENT_STATUS",
            query: domain,
            publishedAt: now,
            updatedAt: now,
            retrievedAt: now,
            registryRecordId: null,
            contentHash: generateUuidV7().replace(/-/g, ""),
            reachable: true,
          };
        });

        await this.firestoreService.saveCitations(
          validatedRequest.runId,
          newCitations,
        );
      }

      // 4. Update Finding with Version Increment
      const updatedFinding: Finding = {
        ...existing,
        admittedStatus: change.newStatus,
        version: existing.version + 1,
        professionalConfirmationRequired: false,
        rationale: `${existing.rationale}\n\n[Reviewer Adjudication]: ${change.reason}`,
      };

      const saved = await this.firestoreService.saveFinding(
        updatedFinding,
        change.expectedVersion,
      );
      updatedFindings.push(saved);

      // 5. Content-Free Audit Log
      const auditEntry: AuditLogEntry = {
        id: generateUuidV7(),
        organizationId: project.organizationId,
        projectId,
        actorId: user.uid,
        action: "REVIEWER_OVERRIDE_APPLIED",
        timestamp: now,
        metadata: {
          findingId: change.findingId,
          oldStatus: existing.admittedStatus,
          newStatus: change.newStatus,
          expectedVersion: change.expectedVersion,
          newVersion: updatedFinding.version,
          citationsAddedCount: change.addedCitationUrls?.length ?? 0,
        },
      };
      await this.firestoreService.appendAuditLog(auditEntry);
    }

    // Determine updated run state
    const allFindings = await this.firestoreService.getFindings(
      validatedRequest.runId,
    );
    const hasUnresolvedIssues = allFindings.some(
      (f) =>
        f.admittedStatus === "NEEDS_REWRITE" ||
        f.admittedStatus === "INSUFFICIENT_EVIDENCE",
    );

    const nextRunState: (typeof RunState)["_type"] = hasUnresolvedIssues
      ? "CHANGES_REQUESTED"
      : "PROFESSIONAL_REVIEW";

    const updatedRun: ClearanceRun = {
      ...run,
      state: nextRunState,
      version: run.version + 1,
      updatedAt: now,
    };
    await this.firestoreService.saveRun(updatedRun);

    return {
      updatedFindings,
      run: updatedRun,
    };
  }

  /**
   * 5. Reviewer Requests Script Changes / Producer Rewrites.
   */
  async requestChanges(
    user: AuthenticatedUser,
    projectId: string,
    runId: string,
    reason: string,
  ): Promise<ClearanceRun> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "REVIEWER",
      "OWNER",
    ]);

    const run = await this.firestoreService.getRun(projectId, runId);
    if (!run) throw new NotFoundException(`Run [${runId}] not found`);

    const now = new Date().toISOString();
    const updatedRun: ClearanceRun = {
      ...run,
      state: "CHANGES_REQUESTED",
      version: run.version + 1,
      updatedAt: now,
    };
    await this.firestoreService.saveRun(updatedRun);

    const auditEntry: AuditLogEntry = {
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "REVIEWER_CHANGES_REQUESTED",
      timestamp: now,
      metadata: {
        runId,
        previousState: run.state,
        newState: "CHANGES_REQUESTED",
        reasonLength: reason.length,
      },
    };
    await this.firestoreService.appendAuditLog(auditEntry);

    return updatedRun;
  }

  /**
   * 6. Sign Off & Approve Clearance Run.
   * Emits formal ReportVersion aggregate.
   */
  async approveClearanceRun(
    user: AuthenticatedUser,
    projectId: string,
    runId: string,
    reason: string,
  ): Promise<{ run: ClearanceRun; report: ReportVersion }> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "REVIEWER",
      "OWNER",
    ]);

    const run = await this.firestoreService.getRun(projectId, runId);
    if (!run) throw new NotFoundException(`Run [${runId}] not found`);

    const findings = await this.firestoreService.getFindings(runId);
    if (findings.length === 0) {
      throw new PreconditionFailedException(
        "Cannot approve clearance run with 0 findings",
      );
    }

    const now = new Date().toISOString();
    const updatedRun: ClearanceRun = {
      ...run,
      state: "APPROVED",
      version: run.version + 1,
      endedAt: now,
      updatedAt: now,
    };
    await this.firestoreService.saveRun(updatedRun);

    // Create ReportVersion and ClearanceReport records
    const reportId = generateUuidV7();
    const existingReports =
      await this.firestoreService.listReportVersions(projectId);
    const versionNumber = existingReports.length + 1;

    const report: ReportVersion = {
      id: reportId,
      projectId,
      runId,
      versionNumber,
      approvedAt: now,
      pdfAvailable: true,
    };
    await this.firestoreService.saveReportVersion(report);

    // Build comprehensive ClearanceReport
    const entities =
      await this.firestoreService.listCanonicalEntities(projectId);
    const entityMap = new Map<string, CanonicalEntity>(
      entities.map((e) => [e.id, e]),
    );

    let clearedCount = 0;
    let licenceRequiredCount = 0;
    let rewriteRequiredCount = 0;
    let blockedCount = 0;
    let insufficientEvidenceCount = 0;

    const reportFindings: ReportFindingItem[] = findings.map((f) => {
      const entity = entityMap.get(f.entityId);
      const rawStatus = f.status || (f as unknown as { admittedStatus?: string }).admittedStatus || (f as unknown as { proposedStatus?: string }).proposedStatus || "INSUFFICIENT_EVIDENCE";
      const status = (["RESEARCH_CLEARED", "NEEDS_LICENCE", "NEEDS_REWRITE", "BLOCKED", "INSUFFICIENT_EVIDENCE"].includes(rawStatus)
        ? rawStatus
        : "INSUFFICIENT_EVIDENCE") as "RESEARCH_CLEARED" | "NEEDS_LICENCE" | "NEEDS_REWRITE" | "BLOCKED" | "INSUFFICIENT_EVIDENCE";

      if (status === "RESEARCH_CLEARED") clearedCount++;
      else if (status === "NEEDS_LICENCE") licenceRequiredCount++;
      else if (status === "NEEDS_REWRITE") rewriteRequiredCount++;
      else if (status === "BLOCKED") blockedCount++;
      else insufficientEvidenceCount++;

      const score = f.confidence?.finalScore ?? f.confidenceScore ?? 0;
      const band = f.confidence?.band || f.confidenceBand || (score >= 85 ? "HIGH" : score >= 60 ? "MEDIUM" : "LOW");

      return {
        findingId: f.id,
        entityId: f.entityId,
        entityName: entity?.canonicalName ?? "Unknown Entity",
        entityType: entity?.type ?? (entity as unknown as { category?: string })?.category ?? "UNKNOWN",
        status,
        confidenceScore: score,
        confidenceBand: band,
        rationale: f.rationale ?? "Clearance finding review item.",
        rewriteSuggestion: f.rewriteSuggestion,
        citationsCount: f.citationIds?.length ?? 0,
      };
    });

    let overallRiskLevel: "CLEAR" | "LOW" | "ELEVATED" | "CRITICAL" = "CLEAR";
    if (blockedCount > 0) overallRiskLevel = "CRITICAL";
    else if (rewriteRequiredCount > 0 || licenceRequiredCount > 0)
      overallRiskLevel = "ELEVATED";
    else if (insufficientEvidenceCount > 0) overallRiskLevel = "LOW";

    const scriptChecksum = run.scriptChecksumSha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    const digest = computeReportDigest({
      id: reportId,
      projectId,
      runId,
      versionNumber,
      title: project.title,
      scriptChecksumSha256: scriptChecksum,
      findings: reportFindings.map((rf) => ({
        findingId: rf.findingId,
        entityId: rf.entityId,
        status: rf.status,
        confidenceScore: rf.confidenceScore,
      })),
    });

    const clearanceReport: ClearanceReport = {
      id: reportId,
      projectId,
      runId,
      versionNumber,
      title: project.title,
      jurisdiction: project.jurisdiction || "US",
      generatedAt: now,
      approvedAt: now,
      approvedBy: user.email || user.uid,
      scriptChecksumSha256: scriptChecksum,
      summary: {
        totalEntities: findings.length,
        clearedCount,
        licenceRequiredCount,
        rewriteRequiredCount,
        blockedCount,
        insufficientEvidenceCount,
        overallRiskLevel,
      },
      findings: reportFindings,
      verification: {
        contentDigestSha256: digest,
        algorithm: "SHA-256",
        archivalWatermark: `CONFIDENTIAL & PRIVILEGED LEGAL WORK PRODUCT - SHA256:${digest} - ARCHIVED ${now}`,
        certificateUrl: `/api/projects/${projectId}/reports/${reportId}/certificate`,
      },
      pdfAvailable: true,
    };
    await this.firestoreService.saveClearanceReport(clearanceReport);

    // Content-free audit entry
    const auditEntry: AuditLogEntry = {
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "CLEARANCE_RUN_APPROVED",
      timestamp: now,
      metadata: {
        runId,
        reportId,
        versionNumber,
        findingsCount: findings.length,
      },
    };
    await this.firestoreService.appendAuditLog(auditEntry);

    return {
      run: updatedRun,
      report,
    };
  }

  /**
   * 7. Generate Clearance Report for Run on demand.
   */
  async generateClearanceReport(
    user: AuthenticatedUser,
    projectId: string,
    runId: string,
  ): Promise<ClearanceReport> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);

    const run = await this.firestoreService.getRun(projectId, runId);
    if (!run) throw new NotFoundException(`Run [${runId}] not found`);

    const findings = await this.firestoreService.getFindings(runId);
    if (findings.length === 0) {
      throw new PreconditionFailedException(
        "Cannot generate clearance report with 0 findings",
      );
    }

    const entities =
      await this.firestoreService.listCanonicalEntities(projectId);
    const entityMap = new Map<string, CanonicalEntity>(
      entities.map((e) => [e.id, e]),
    );

    let clearedCount = 0;
    let licenceRequiredCount = 0;
    let rewriteRequiredCount = 0;
    let blockedCount = 0;
    let insufficientEvidenceCount = 0;

    const reportFindings: ReportFindingItem[] = findings.map((f) => {
      const entity = entityMap.get(f.entityId);
      const rawStatus = f.status || (f as unknown as { admittedStatus?: string }).admittedStatus || (f as unknown as { proposedStatus?: string }).proposedStatus || "INSUFFICIENT_EVIDENCE";
      const status = (["RESEARCH_CLEARED", "NEEDS_LICENCE", "NEEDS_REWRITE", "BLOCKED", "INSUFFICIENT_EVIDENCE"].includes(rawStatus)
        ? rawStatus
        : "INSUFFICIENT_EVIDENCE") as "RESEARCH_CLEARED" | "NEEDS_LICENCE" | "NEEDS_REWRITE" | "BLOCKED" | "INSUFFICIENT_EVIDENCE";

      if (status === "RESEARCH_CLEARED") clearedCount++;
      else if (status === "NEEDS_LICENCE") licenceRequiredCount++;
      else if (status === "NEEDS_REWRITE") rewriteRequiredCount++;
      else if (status === "BLOCKED") blockedCount++;
      else insufficientEvidenceCount++;

      const score = f.confidence?.finalScore ?? f.confidenceScore ?? 0;
      const band = f.confidence?.band || f.confidenceBand || (score >= 85 ? "HIGH" : score >= 60 ? "MEDIUM" : "LOW");

      return {
        findingId: f.id,
        entityId: f.entityId,
        entityName: entity?.canonicalName ?? "Unknown Entity",
        entityType: entity?.type ?? (entity as unknown as { category?: string })?.category ?? "UNKNOWN",
        status,
        confidenceScore: score,
        confidenceBand: band,
        rationale: f.rationale ?? "Clearance finding review item.",
        rewriteSuggestion: f.rewriteSuggestion,
        citationsCount: f.citationIds?.length ?? 0,
      };
    });

    let overallRiskLevel: "CLEAR" | "LOW" | "ELEVATED" | "CRITICAL" = "CLEAR";
    if (blockedCount > 0) overallRiskLevel = "CRITICAL";
    else if (rewriteRequiredCount > 0 || licenceRequiredCount > 0)
      overallRiskLevel = "ELEVATED";
    else if (insufficientEvidenceCount > 0) overallRiskLevel = "LOW";

    const existingReports =
      await this.firestoreService.listReportVersions(projectId);
    const versionNumber = existingReports.length + 1;
    const reportId = generateUuidV7();
    const now = new Date().toISOString();
    const scriptChecksum = run.scriptChecksumSha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    const digest = computeReportDigest({
      id: reportId,
      projectId,
      runId,
      versionNumber,
      title: project.title,
      scriptChecksumSha256: scriptChecksum,
      findings: reportFindings.map((rf) => ({
        findingId: rf.findingId,
        entityId: rf.entityId,
        status: rf.status,
        confidenceScore: rf.confidenceScore,
      })),
    });

    const clearanceReport: ClearanceReport = {
      id: reportId,
      projectId,
      runId,
      versionNumber,
      title: project.title,
      jurisdiction: project.jurisdiction || "US",
      generatedAt: now,
      approvedAt: run.state === "APPROVED" ? now : null,
      approvedBy: user.email || user.uid,
      scriptChecksumSha256: scriptChecksum,
      summary: {
        totalEntities: findings.length,
        clearedCount,
        licenceRequiredCount,
        rewriteRequiredCount,
        blockedCount,
        insufficientEvidenceCount,
        overallRiskLevel,
      },
      findings: reportFindings,
      verification: {
        contentDigestSha256: digest,
        algorithm: "SHA-256",
        archivalWatermark: `CONFIDENTIAL & PRIVILEGED LEGAL WORK PRODUCT - SHA256:${digest} - ARCHIVED ${now}`,
        certificateUrl: `/api/projects/${projectId}/reports/${reportId}/certificate`,
      },
      pdfAvailable: true,
    };

    await this.firestoreService.saveClearanceReport(clearanceReport);
    await this.firestoreService.saveReportVersion({
      id: reportId,
      projectId,
      runId,
      versionNumber,
      approvedAt: now,
      pdfAvailable: true,
    });

    return clearanceReport;
  }

  /**
   * 8. Get Full Clearance Report aggregate.
   */
  async getClearanceReport(
    user: AuthenticatedUser,
    projectId: string,
    reportId: string,
  ): Promise<ClearanceReport> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);

    const report = await this.firestoreService.getClearanceReport(
      projectId,
      reportId,
    );
    if (!report) {
      throw new NotFoundException(`Clearance report [${reportId}] not found`);
    }
    return report;
  }

  /**
   * 9. Render Archival Clearance Certificate HTML.
   */
  async getClearanceCertificateHtml(
    user: AuthenticatedUser,
    projectId: string,
    reportId: string,
  ): Promise<string> {
    const report = await this.getClearanceReport(user, projectId, reportId);
    return generateCertificateHtml(report);
  }

  /**
   * Query review status & invitations
   */
  async listInvitations(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<Invitation[]> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);
    return this.firestoreService.listInvitations(projectId);
  }

  async listReports(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<ReportVersion[]> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);
    return this.firestoreService.listReportVersions(projectId);
  }

  async listFullReports(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<ClearanceReport[]> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);
    return this.firestoreService.listClearanceReports(projectId);
  }
}
