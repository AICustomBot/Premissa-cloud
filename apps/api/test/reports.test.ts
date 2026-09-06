import { describe, it, expect, beforeEach } from "vitest";
import {
  ForbiddenException,
  NotFoundException,
  PreconditionFailedException,
} from "@nestjs/common";
import { FirestoreService } from "../src/storage/firestore.service.js";
import { ProjectsService } from "../src/projects/projects.service.js";
import { ReviewsService } from "../src/reviews/reviews.service.js";
import {
  generateUuidV7,
  ClearanceRun,
  Finding,
  AuditLogEntry,
  CanonicalEntity,
} from "@permissa/contracts";
import type { AuthenticatedUser } from "../src/auth/auth.types.js";
import { computeReportDigest } from "../src/reviews/certificate.generator.js";

describe("Batch 7: Report Generation & Cryptographic PDF Clearance Certificate", () => {
  let firestoreService: FirestoreService;
  let projectsService: ProjectsService;
  let reviewsService: ReviewsService;

  const orgId = generateUuidV7();
  const projectId = generateUuidV7();
  const runId = generateUuidV7();
  const scriptVersionId = generateUuidV7();
  const findingId1 = generateUuidV7();
  const findingId2 = generateUuidV7();
  const entityId1 = generateUuidV7();
  const entityId2 = generateUuidV7();

  const ownerUser: AuthenticatedUser = {
    uid: "user-owner-test",
    email: "producer.owner@studio.com",
    defaultRole: "OWNER",
    organizationId: orgId,
  };

  const reviewerUser: AuthenticatedUser = {
    uid: "user-counsel-test",
    email: "counsel.reviewer@lawfirm.com",
    defaultRole: "REVIEWER",
  };

  const unauthorizedUser: AuthenticatedUser = {
    uid: "user-unauthorized",
    email: "outsider@otherstudio.com",
  };

  beforeEach(async () => {
    firestoreService = new FirestoreService();
    projectsService = new ProjectsService(firestoreService);
    reviewsService = new ReviewsService(firestoreService, projectsService);

    // Bootstrap test organization and project
    await firestoreService.saveOrganization({
      id: orgId,
      name: "Permissa Studio Test",
      ownerId: ownerUser.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await firestoreService.saveProject({
      id: projectId,
      organizationId: orgId,
      createdBy: ownerUser.uid,
      title: "Operation Deep Horizon",
      jurisdiction: "US",
      
      targetClearanceStandard: "E_AND_O_INSURABLE",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Save test entities
    const entity1: CanonicalEntity = {
      id: entityId1,
      scriptVersionId,
      canonicalName: "SPECTRE Global Holdings",
      type: "BRAND_BUSINESS_PRODUCT",
      aliases: ["SPECTRE"],
      mentions: [
        {
          sceneId: generateUuidV7(),
          sourceRange: { start: 10, end: 35 },
          contextExcerpt: "EXT. SKYLINE - DAY. High above the city.",
        },
      ],
      confirmed: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const entity2: CanonicalEntity = {
      id: entityId2,
      scriptVersionId,
      canonicalName: "Valhalla Energy Corp",
      type: "BRAND_BUSINESS_PRODUCT",
      aliases: [],
      mentions: [
        {
          sceneId: generateUuidV7(),
          sourceRange: { start: 40, end: 60 },
          contextExcerpt: "INT. LAB - NIGHT. A glowing screen displays the corporate crest.",
        },
      ],
      confirmed: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await firestoreService.saveEntity(entity1);
    await firestoreService.saveEntity(entity2);

    // Save test clearance run
    const run: ClearanceRun = {
      id: runId,
      projectId,
      scriptVersionId,
      state: "APPROVED",
      jurisdiction: "US",
      
      version: 2,
      scriptChecksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deadlineAt: new Date(Date.now() + 600000).toISOString(),
      checkpoint: {
        completedEntityIds: [entityId1, entityId2],
        pendingEntityIds: [],
        lastCheckpointAt: new Date().toISOString(),
        attempt: 1,
      },
      budget: {
        costCapUsd: 10.0,
        estimatedCostUsd: 0.25,
        parallelCallCap: 50,
        parallelCallsUsed: 6,
        entityCap: 12,
      },
    };
    await firestoreService.saveRun(run);

    // Save findings
    const finding1: Finding = {
      id: findingId1,
      runId,
      entityId: entityId1,
      proposedStatus: "RESEARCH_CLEARED",
      admittedStatus: "RESEARCH_CLEARED",
      professionalConfirmationRequired: false,
      confidence: {
        formulaVersion: "1.0",
        rawScore: 92,
        finalScore: 92,
        band: "HIGH",
        factors: {
          authority: 36,
          independence: 18,
          entityMatch: 20,
          freshness: 9,
          context: 9,
        },
        caps: [],
        invalidations: [],
        reasonCodes: [],
      },
      reasonCodes: [],
      rationale: "Fictional trademark with no conflicting active commercial enterprises in entertainment class.",
      rewriteSuggestion: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const finding2: Finding = {
      id: findingId2,
      runId,
      entityId: entityId2,
      proposedStatus: "NEEDS_LICENCE",
      admittedStatus: "NEEDS_LICENCE",
      professionalConfirmationRequired: false,
      confidence: {
        formulaVersion: "1.0",
        rawScore: 78,
        finalScore: 78,
        band: "MEDIUM",
        factors: {
          authority: 30,
          independence: 15,
          entityMatch: 16,
          freshness: 9,
          context: 8,
        },
        caps: [],
        invalidations: [],
        reasonCodes: ["LICENCE_SIGNAL_SUPPORTED"],
      },
      reasonCodes: ["LICENCE_SIGNAL_SUPPORTED"],
      rationale: "Active commercial registry match requires production clearance licence.",
      rewriteSuggestion: "Change corporate name to fictionalized entity.",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await firestoreService.saveFinding(finding1);
    await firestoreService.saveFinding(finding2);
  });

  it("1. Deterministic SHA-256 cryptographic digest computation", () => {
    const payload = {
      id: "rep-001",
      projectId,
      runId,
      versionNumber: 1,
      title: "Operation Deep Horizon",
      scriptChecksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      findings: [
        { findingId: findingId2, entityId: entityId2, status: "NEEDS_LICENCE", confidenceScore: 78 },
        { findingId: findingId1, entityId: entityId1, status: "RESEARCH_CLEARED", confidenceScore: 92 },
      ],
    };

    const hash1 = computeReportDigest(payload);
    // Reverse order of findings in payload to verify sort-invariance
    const hash2 = computeReportDigest({
      ...payload,
      findings: [payload.findings[1], payload.findings[0]],
    });

    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash1).toBe(hash2);
  });

  it("2. Generates Clearance Report aggregate with metrics and archival watermark", async () => {
    const report = await reviewsService.generateClearanceReport(
      ownerUser,
      projectId,
      runId,
    );

    expect(report.id).toBeDefined();
    expect(report.projectId).toBe(projectId);
    expect(report.runId).toBe(runId);
    expect(report.title).toBe("Operation Deep Horizon");
    expect(report.summary.totalEntities).toBe(2);
    expect(report.summary.clearedCount).toBe(1);
    expect(report.summary.licenceRequiredCount).toBe(1);
    expect(report.summary.overallRiskLevel).toBe("ELEVATED");

    // Cryptographic verification seal
    expect(report.verification.algorithm).toBe("SHA-256");
    expect(report.verification.contentDigestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.verification.archivalWatermark).toContain("CONFIDENTIAL & PRIVILEGED LEGAL WORK PRODUCT");
    expect(report.verification.archivalWatermark).toContain(report.verification.contentDigestSha256);
    expect(report.findings).toHaveLength(2);
  });

  it("3. Retrieves Clearance Certificate HTML with verification badges and legal signature blocks", async () => {
    const report = await reviewsService.generateClearanceReport(
      ownerUser,
      projectId,
      runId,
    );

    const html = await reviewsService.getClearanceCertificateHtml(
      ownerUser,
      projectId,
      report.id,
    );

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Official Legal Clearance Certificate");
    expect(html).toContain(report.verification.contentDigestSha256);
    expect(html).toContain("SEAL VERIFIED");
    expect(html).toContain("SPECTRE Global Holdings");
    expect(html).toContain("Valhalla Energy Corp");
    expect(html).toContain("Rewrite Path:");
    expect(html).toContain("CONFIDENTIAL &amp; PRIVILEGED LEGAL WORK PRODUCT");
  });

  it("4. Enforces RBAC on Report generation and Certificate access", async () => {
    await expect(
      reviewsService.generateClearanceReport(unauthorizedUser, projectId, runId),
    ).rejects.toThrow(ForbiddenException);

    const report = await reviewsService.generateClearanceReport(
      ownerUser,
      projectId,
      runId,
    );

    await expect(
      reviewsService.getClearanceReport(unauthorizedUser, projectId, report.id),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      reviewsService.getClearanceCertificateHtml(unauthorizedUser, projectId, report.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it("5. Throws 404 for nonexistent report retrieval", async () => {
    await expect(
      reviewsService.getClearanceReport(ownerUser, projectId, "rep-nonexistent"),
    ).rejects.toThrow(NotFoundException);
  });
});
