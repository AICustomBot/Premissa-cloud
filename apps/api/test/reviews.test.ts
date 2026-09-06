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
  Invitation,
} from "@permissa/contracts";
import type { AuthenticatedUser } from "../src/auth/auth.types.js";

describe("Batch 6: Reviewer Clearance Workflow, Optimistic Concurrency & Overrides", () => {
  let firestoreService: FirestoreService;
  let projectsService: ProjectsService;
  let reviewsService: ReviewsService;

  const orgId = generateUuidV7();
  const projectId = generateUuidV7();
  const runId = generateUuidV7();
  const findingId = generateUuidV7();
  const entityId = generateUuidV7();

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
    email: "random.user@external.com",
    defaultRole: "PRODUCER",
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
      title: "The Final Witness",
      jurisdiction: "US",
      createdBy: ownerUser.uid,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Bootstrap Clearance Run in DRAFT_READY state
    const run: ClearanceRun = {
      id: runId,
      projectId,
      scriptVersionId: generateUuidV7(),
      state: "DRAFT_READY",
      jurisdiction: "US",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      deadlineAt: new Date(Date.now() + 600000).toISOString(),
      checkpoint: {
        completedEntityIds: [entityId],
        pendingEntityIds: [],
        lastCheckpointAt: new Date().toISOString(),
        attempt: 1,
      },
      budget: {
        costCapUsd: 10.0,
        estimatedCostUsd: 0.15,
        parallelCallCap: 50,
        parallelCallsUsed: 4,
        entityCap: 12,
      },
    };
    await firestoreService.saveRun(run);

    // Bootstrap draft finding
    const finding: Finding = {
      id: findingId,
      runId,
      entityId,
      proposedStatus: "BLOCKED",
      admittedStatus: "NEEDS_REWRITE", // Gate downgraded because no professional confirmation yet
      professionalConfirmationRequired: true,
      confidence: {
        formulaVersion: "formula_v1",
        rawScore: 88,
        finalScore: 88,
        band: "HIGH",
        factors: {
          authority: 36,
          independence: 18,
          entityMatch: 18,
          freshness: 8,
          context: 8,
        },
        caps: [],
        invalidations: [],
        reasonCodes: ["REWRITE_PATH_SUPPORTED", "PROFESSIONAL_CONFIRMATION_REQUIRED"],
      },
      reasonCodes: ["REWRITE_PATH_SUPPORTED", "PROFESSIONAL_CONFIRMATION_REQUIRED"],
      rationale: "Entity contains potential defamatory false light portrayal in scene 4.",
      rewriteSuggestion: "Change character name and remove reference to actual political office.",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await firestoreService.saveFinding(finding);
  });

  describe("1. Dual-Role Reviewer Workflow & Invitation Loop", () => {
    it("allows producer/owner to issue a reviewer invitation with 7-day expiration", async () => {
      const invitation = await reviewsService.createInvitation(
        ownerUser,
        projectId,
        { reviewerEmail: "counsel.reviewer@lawfirm.com" },
      );

      expect(invitation.id).toBeDefined();
      expect(invitation.projectId).toBe(projectId);
      expect(invitation.reviewerEmailNormalized).toBe("counsel.reviewer@lawfirm.com");
      expect(invitation.state).toBe("ISSUED");
      expect(new Date(invitation.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const stored = await firestoreService.getInvitation(projectId, invitation.id);
      expect(stored?.id).toBe(invitation.id);
    });

    it("rejects invitation creation by unauthorized users", async () => {
      await expect(
        reviewsService.createInvitation(unauthorizedUser, projectId, {
          reviewerEmail: "counsel@lawfirm.com",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows invited user to accept invitation and receive REVIEWER grant", async () => {
      const invitation = await reviewsService.createInvitation(
        ownerUser,
        projectId,
        { reviewerEmail: reviewerUser.email },
      );

      const grant = await reviewsService.acceptInvitation(
        reviewerUser,
        projectId,
        invitation.id,
      );

      expect(grant.role).toBe("REVIEWER");
      expect(grant.userId).toBe(reviewerUser.uid);

      const updatedInv = await firestoreService.getInvitation(projectId, invitation.id);
      expect(updatedInv?.state).toBe("ACCEPTED");
    });
  });

  describe("2. Clearance Run Review Submission", () => {
    it("allows producer to submit clearance run for professional review", async () => {
      const updatedRun = await reviewsService.requestReview(
        ownerUser,
        projectId,
        runId,
      );

      expect(updatedRun.state).toBe("PROFESSIONAL_REVIEW");
      expect(updatedRun.version).toBe(2);
    });
  });

  describe("3. Constitutional Reviewer Overrides & Optimistic Concurrency", () => {
    beforeEach(async () => {
      // Grant reviewerUser REVIEWER role on project
      await firestoreService.saveGrant({
        projectId,
        userId: reviewerUser.uid,
        role: "REVIEWER",
        grantedAt: new Date().toISOString(),
      });
    });

    it("enforces optimistic concurrency: rejects override when expectedVersion mismatches", async () => {
      await expect(
        reviewsService.submitReview(reviewerUser, projectId, {
          runId,
          changes: [
            {
              findingId,
              expectedVersion: 99, // STALE VERSION!
              newStatus: "BLOCKED",
              reason: "Formal legal counsel opinion: Defamation risk confirmed in live deposition.",
              addedCitationUrls: [],
            },
          ],
        }),
      ).rejects.toThrow(PreconditionFailedException);
    });

    it("allows verified Reviewer to apply formal BLOCKED override with incremented version", async () => {
      const result = await reviewsService.submitReview(reviewerUser, projectId, {
        runId,
        changes: [
          {
            findingId,
            expectedVersion: 1, // MATCHES VERSION 1
            newStatus: "BLOCKED",
            reason: "Clearance Counsel Opinion #2026-09-A: High likelihood of litigation. Script must not proceed with this portrayal.",
            addedCitationUrls: ["https://law.cornell.edu/uscode/text/17/106"],
          },
        ],
      });

      expect(result.updatedFindings.length).toBe(1);
      const updated = result.updatedFindings[0];
      expect(updated?.admittedStatus).toBe("BLOCKED");
      expect(updated?.version).toBe(2);
      expect(updated?.rationale).toContain("Clearance Counsel Opinion #2026-09-A");

      // Verify citation added
      const citations = await firestoreService.getCitations(runId);
      expect(citations.some((c) => c.originalUrl.includes("cornell.edu"))).toBe(true);

      // Verify persistence
      const persisted = await firestoreService.getFinding(runId, findingId);
      expect(persisted?.admittedStatus).toBe("BLOCKED");
      expect(persisted?.version).toBe(2);
    });

    it("allows reviewer to request producer changes or approve clearance run with formal report", async () => {
      // 1. Reviewer requests changes
      const changesRun = await reviewsService.requestChanges(
        reviewerUser,
        projectId,
        runId,
        "Please rewrite scene 4 character dialogue to avoid defamation exposure.",
      );
      expect(changesRun.state).toBe("CHANGES_REQUESTED");

      // 2. Override finding to cleared
      await reviewsService.submitReview(reviewerUser, projectId, {
        runId,
        changes: [
          {
            findingId,
            expectedVersion: 1,
            newStatus: "RESEARCH_CLEARED",
            reason: "Script revision received and verified against historical archives.",
            addedCitationUrls: [],
          },
        ],
      });

      // 3. Approve clearance run and generate formal ReportVersion
      const approval = await reviewsService.approveClearanceRun(
        reviewerUser,
        projectId,
        runId,
        "All clearance findings adjudicated. Production is clear to proceed.",
      );

      expect(approval.run.state).toBe("APPROVED");
      expect(approval.report.id).toBeDefined();
      expect(approval.report.versionNumber).toBe(1);
      expect(approval.report.pdfAvailable).toBe(true);
    });
  });

  describe("4. Content-Free Audit Logging Invariants", () => {
    it("verifies all review transitions emit strictly content-free audit records", async () => {
      await firestoreService.saveGrant({
        projectId,
        userId: reviewerUser.uid,
        role: "REVIEWER",
        grantedAt: new Date().toISOString(),
      });

      await reviewsService.requestReview(ownerUser, projectId, runId);
      await reviewsService.submitReview(reviewerUser, projectId, {
        runId,
        changes: [
          {
            findingId,
            expectedVersion: 1,
            newStatus: "NEEDS_REWRITE",
            reason: "Reviewer comments on script text that should not leak to audit logs.",
            addedCitationUrls: [],
          },
        ],
      });

      const auditLogs = await firestoreService.getAuditLogs(projectId);
      expect(auditLogs.length).toBeGreaterThan(0);

      for (const log of auditLogs) {
        const validated = AuditLogEntry.parse(log);
        expect(validated.organizationId).toBe(orgId);
        expect(validated.projectId).toBe(projectId);

        // Constitutional rule: Zero screenplay text or entity names in logs
        const serialized = JSON.stringify(validated);
        expect(serialized).not.toContain("scene 4");
        expect(serialized).not.toContain("defamatory false light");
        expect(serialized).not.toContain("Reviewer comments on script text");
      }
    });
  });
});
