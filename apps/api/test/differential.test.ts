import { describe, it, expect, beforeEach } from "vitest";
import { generateUuidV7 } from "@permissa/contracts";
import { ProjectsService } from "../src/projects/projects.service.js";
import { ResearchService } from "../src/research/research.service.js";
import { ReviewsService } from "../src/reviews/reviews.service.js";
import { DifferentialService } from "../src/differential/differential.service.js";
import { FirestoreService } from "../src/storage/firestore.service.js";
import { StatutoryRegistryAdapter } from "../src/research/adapters/statutory-registry.adapter.js";
import { IndustryDatabaseAdapter } from "../src/research/adapters/industry-database.adapter.js";
import { LiveSearchAdapter } from "../src/research/adapters/live-search.adapter.js";
import { CircuitBreaker } from "../src/research/circuit/circuit-breaker.js";
import { RateLimiter } from "../src/research/circuit/rate-limiter.js";
import { UsageLedgerService } from "../src/research/ledger/usage-ledger.service.js";
import type { AuthenticatedUser } from "../src/auth/auth.types.js";

describe("Batch 8: Differential Clearance & Script Revision Delta Engine", () => {
  let firestoreService: FirestoreService;
  let projectsService: ProjectsService;
  let researchService: ResearchService;
  let reviewsService: ReviewsService;
  let differentialService: DifferentialService;

  const mockOwnerUser: AuthenticatedUser = {
    uid: "user-producer-1",
    email: "producer@apex-entertainment.com",
    roles: ["OWNER"],
  };

  const mockUnauthorizedUser: AuthenticatedUser = {
    uid: "user-outsider-99",
    email: "outsider@evilcorp.com",
    roles: ["OWNER"],
  };

  beforeEach(() => {
    firestoreService = new FirestoreService();
    projectsService = new ProjectsService(firestoreService);

    const statutory = new StatutoryRegistryAdapter();
    const industry = new IndustryDatabaseAdapter();
    const liveSearch = new LiveSearchAdapter();
    const circuitBreaker = new CircuitBreaker();
    const rateLimiter = new RateLimiter();
    const usageLedger = new UsageLedgerService(firestoreService);

    researchService = new ResearchService(
      firestoreService,
      statutory,
      industry,
      liveSearch,
      circuitBreaker,
      rateLimiter,
      usageLedger,
    );

    reviewsService = new ReviewsService(firestoreService, projectsService);

    differentialService = new DifferentialService(
      firestoreService,
      projectsService,
      researchService,
    );
  });

  it("1. Script Delta Comparison detects ADDED, MODIFIED, DELETED, and UNTOUCHED entities across revisions", async () => {
    // 1. Create Project
    const project = await projectsService.createProject(mockOwnerUser, {
      title: "Chrono Shift - Feature Film",
      organizationId: await projectsService.getPrimaryOrgIdForUser(mockOwnerUser),
      jurisdiction: "US",
    });

    // 2. Create Script Draft 1 (White Revision)
    const scriptDraft1 = await projectsService.createScriptVersion(
      mockOwnerUser,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256:
          "a111111111111111111111111111111111111111111111111111111111111111",
        pageCount: 15,
        sceneCount: 3,
      },
    );

    // Seed 3 entities for Draft 1:
    // - Entity A: Quantum Motors (will stay UNTOUCHED in draft 2)
    // - Entity B: Dr. Julian Vance (will be MODIFIED in draft 2)
    // - Entity C: Chrono Labs (will be DELETED from draft 2)
    const entA1 = await projectsService.createEntity(
      mockOwnerUser,
      project.id,
      scriptDraft1.id,
      {
        canonicalName: "Quantum Motors",
        type: "BRAND_BUSINESS_PRODUCT",
        aliases: ["Quantum Auto"],
        
        confirmed: true,
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 100, end: 150 },
            contextExcerpt: "A sleek sedan pulls up.",
          },
        ],
      },
    );

    const entB1 = await projectsService.createEntity(
      mockOwnerUser,
      project.id,
      scriptDraft1.id,
      {
        canonicalName: "Dr. Julian Vance",
        type: "PERSON_CHARACTER",
        aliases: ["Julian Vance"],
        
        confirmed: true,
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 400, end: 450 },
            contextExcerpt: "Vance checks the dial.",
          },
        ],
      },
    );

    const entC1 = await projectsService.createEntity(
      mockOwnerUser,
      project.id,
      scriptDraft1.id,
      {
        canonicalName: "Chrono Labs",
        type: "BRAND_BUSINESS_PRODUCT",
        aliases: [],
        
        confirmed: true,
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 800, end: 860 },
            contextExcerpt: "Chrono Labs facility exterior.",
          },
        ],
      },
    );

    // Execute Initial Clearance Run for Draft 1
    const run1Id = generateUuidV7();
    await researchService.conductResearchForEntity({
      projectId: project.id,
      runId: run1Id,
      entityId: entA1.id,
    });
    await researchService.conductResearchForEntity({
      projectId: project.id,
      runId: run1Id,
      entityId: entB1.id,
    });
    await researchService.conductResearchForEntity({
      projectId: project.id,
      runId: run1Id,
      entityId: entC1.id,
    });

    // Update run1 scriptVersionId so history/delta can link it
    const run1 = await firestoreService.getRun(project.id, run1Id);
    if (run1) {
      await firestoreService.saveRun({
        ...run1,
        scriptVersionId: scriptDraft1.id,
        state: "APPROVED",
      });
    }

    // 3. Create Script Draft 2 (Pink Revision)
    const scriptDraft2 = await projectsService.createScriptVersion(
      mockOwnerUser,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256:
          "b222222222222222222222222222222222222222222222222222222222222222",
        pageCount: 16,
        sceneCount: 4,
      },
    );

    // In Draft 2:
    // - Entity A2: "Quantum Motors" (exact same mentions -> UNTOUCHED)
    // - Entity B2: "Dr. Julian Vance" (extra scene mention -> MODIFIED)
    // - Entity D2: "Starlight Diner" (new entity -> ADDED)
    // - (Chrono Labs is omitted -> DELETED)
    const entA2 = await projectsService.createEntity(
      mockOwnerUser,
      project.id,
      scriptDraft2.id,
      {
        canonicalName: "Quantum Motors",
        type: "BRAND_BUSINESS_PRODUCT",
        aliases: ["Quantum Auto"],
        
        confirmed: true,
        mentions: entA1.mentions, // Identical mentions
      },
    );

    const entB2 = await projectsService.createEntity(
      mockOwnerUser,
      project.id,
      scriptDraft2.id,
      {
        canonicalName: "Dr. Julian Vance",
        type: "PERSON_CHARACTER",
        aliases: ["Julian Vance"],
        
        confirmed: true,
        mentions: [
          ...entB1.mentions,
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 1100, end: 1160 },
            contextExcerpt: "Vance enters the diner.",
          },
        ],
      },
    );

    const entD2 = await projectsService.createEntity(
      mockOwnerUser,
      project.id,
      scriptDraft2.id,
      {
        canonicalName: "Starlight Diner",
        type: "BRAND_BUSINESS_PRODUCT",
        aliases: [],
        
        confirmed: true,
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 1050, end: 1100 },
            contextExcerpt: "Neon sign of Starlight Diner.",
          },
        ],
      },
    );

    // 4. Perform Script Delta Comparison
    const delta = await differentialService.compareScriptVersions(
      mockOwnerUser,
      project.id,
      {
        baseScriptVersionId: scriptDraft1.id,
        targetScriptVersionId: scriptDraft2.id,
      },
    );

    expect(delta).toBeDefined();
    expect(delta.baseScriptVersionId).toBe(scriptDraft1.id);
    expect(delta.targetScriptVersionId).toBe(scriptDraft2.id);
    expect(delta.summary.totalBaseEntities).toBe(3);
    expect(delta.summary.totalTargetEntities).toBe(3);
    expect(delta.summary.untouchedEntitiesCount).toBe(1); // Quantum Motors
    expect(delta.summary.modifiedEntitiesCount).toBe(1); // Dr. Julian Vance
    expect(delta.summary.addedEntitiesCount).toBe(1); // Starlight Diner
    expect(delta.summary.deletedEntitiesCount).toBe(1); // Chrono Labs
    expect(delta.summary.carriedForwardFindingsCount).toBe(1); // Quantum Motors
    expect(delta.summary.researchRequiredCount).toBe(2); // Julian Vance + Starlight Diner
    expect(delta.summary.estimatedCostSavingsUsd).toBeGreaterThan(0);

    const untouchedDelta = delta.entityDeltas.find(
      (ed) => ed.canonicalName === "Quantum Motors",
    );
    expect(untouchedDelta?.changeType).toBe("UNTOUCHED");
    expect(untouchedDelta?.carryForwardAllowed).toBe(true);
    expect(untouchedDelta?.requiresResearch).toBe(false);

    const modifiedDelta = delta.entityDeltas.find(
      (ed) => ed.canonicalName === "Dr. Julian Vance",
    );
    expect(modifiedDelta?.changeType).toBe("MODIFIED");
    expect(modifiedDelta?.carryForwardAllowed).toBe(false);
    expect(modifiedDelta?.requiresResearch).toBe(true);

    const addedDelta = delta.entityDeltas.find(
      (ed) => ed.canonicalName === "Starlight Diner",
    );
    expect(addedDelta?.changeType).toBe("ADDED");
    expect(addedDelta?.requiresResearch).toBe(true);

    const deletedDelta = delta.entityDeltas.find(
      (ed) => ed.canonicalName === "Chrono Labs",
    );
    expect(deletedDelta?.changeType).toBe("DELETED");
  });

  it("2. Differential Clearance Execution carries forward cleared findings and only researches new/modified entities", async () => {
    // 1. Create Project & Drafts
    const project = await projectsService.createProject(mockOwnerUser, {
      title: "Solaris Dawn",
      organizationId: await projectsService.getPrimaryOrgIdForUser(mockOwnerUser),
      jurisdiction: "US",
    });

    const script1 = await projectsService.createScriptVersion(
      mockOwnerUser,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256:
          "c111111111111111111111111111111111111111111111111111111111111111",
        pageCount: 10,
        sceneCount: 2,
      },
    );

    const entUnchanged = await projectsService.createEntity(
      mockOwnerUser,
      project.id,
      script1.id,
      {
        canonicalName: "Apex Dynamics",
        type: "BRAND_BUSINESS_PRODUCT",
        aliases: [],
        
        confirmed: true,
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 10, end: 50 },
            contextExcerpt: "Apex Dynamics logo.",
          },
        ],
      },
    );

    // Initial Clearance Run on Script 1
    const run1Id = generateUuidV7();
    await researchService.conductResearchForEntity({
      projectId: project.id,
      runId: run1Id,
      entityId: entUnchanged.id,
    });
    const run1 = await firestoreService.getRun(project.id, run1Id);
    if (run1) {
      await firestoreService.saveRun({
        ...run1,
        scriptVersionId: script1.id,
        state: "APPROVED",
      });
    }

    // Script 2 (Revision)
    const script2 = await projectsService.createScriptVersion(
      mockOwnerUser,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256:
          "c222222222222222222222222222222222222222222222222222222222222222",
        pageCount: 12,
        sceneCount: 3,
      },
    );

    const ent2Unchanged = await projectsService.createEntity(
      mockOwnerUser,
      project.id,
      script2.id,
      {
        canonicalName: "Apex Dynamics",
        type: "BRAND_BUSINESS_PRODUCT",
        aliases: [],
        
        confirmed: true,
        mentions: entUnchanged.mentions,
      },
    );

    const ent2New = await projectsService.createEntity(
      mockOwnerUser,
      project.id,
      script2.id,
      {
        canonicalName: "Captain Sarah Connor",
        type: "PERSON_CHARACTER",
        aliases: [],
        
        confirmed: true,
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 300, end: 350 },
            contextExcerpt: "Captain Connor salutes.",
          },
        ],
      },
    );

    // 2. Execute Differential Clearance Run
    const diffRunResult =
      await differentialService.executeDifferentialClearanceRun(
        mockOwnerUser,
        {
          projectId: project.id,
          targetScriptVersionId: script2.id,
          baseScriptVersionId: script1.id,
          autoCarryForward: true,
          jurisdiction: "US",
        },
      );

    expect(diffRunResult.runId).toBeDefined();
    expect(diffRunResult.totalEntitiesInScope).toBe(2);
    expect(diffRunResult.carriedForwardFindingIds.length).toBe(1);
    expect(diffRunResult.dispatchedEntityIds.length).toBe(1);
    expect(diffRunResult.dispatchedEntityIds[0]).toBe(ent2New.id);
    expect(diffRunResult.costSavedUsd).toBeGreaterThan(0);

    // Verify carried forward finding exists with provenance notation
    const carriedFinding = await firestoreService.getFinding(
      diffRunResult.runId,
      diffRunResult.carriedForwardFindingIds[0]!,
    );
    expect(carriedFinding).toBeDefined();
    expect(carriedFinding?.entityId).toBe(ent2Unchanged.id);
    expect(carriedFinding?.rationale).toContain("DIFFERENTIAL CARRY-FORWARD");

    // Verify new entity finding was freshly generated
    const newFindings = await researchService.getFindingsForRun(
      diffRunResult.runId,
    );
    expect(newFindings.length).toBe(2);
  });

  it("3. Enforces Constitutional Producer Confirmation Gate on target entities during differential clearance", async () => {
    const project = await projectsService.createProject(mockOwnerUser, {
      title: "Gate Validation Project",
      organizationId: await projectsService.getPrimaryOrgIdForUser(mockOwnerUser),
      jurisdiction: "US",
    });

    const script = await projectsService.createScriptVersion(
      mockOwnerUser,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256:
          "d111111111111111111111111111111111111111111111111111111111111111",
        pageCount: 5,
        sceneCount: 1,
      },
    );

    // Create UNCONFIRMED entity
    await projectsService.createEntity(mockOwnerUser, project.id, script.id, {
      canonicalName: "Unconfirmed Brand",
      type: "BRAND_BUSINESS_PRODUCT",
      aliases: [],
      
      confirmed: false, // Unconfirmed!
      mentions: [
        {
          sceneId: generateUuidV7(),
          sourceRange: { start: 1, end: 20 },
          contextExcerpt: "Unconfirmed mention.",
        },
      ],
    });

    await expect(
      differentialService.executeDifferentialClearanceRun(mockOwnerUser, {
        projectId: project.id,
        targetScriptVersionId: script.id,
        jurisdiction: "US",
      }),
    ).rejects.toThrow("Producer Confirmation Gate Active");
  });

  it("4. Revision History & Audit Trail maintains chronological chain of custody with checksums and certificates", async () => {
    const project = await projectsService.createProject(mockOwnerUser, {
      title: "Neon Horizon - Franchise",
      organizationId: await projectsService.getPrimaryOrgIdForUser(mockOwnerUser),
      jurisdiction: "US",
    });

    // Revision 1
    const draft1 = await projectsService.createScriptVersion(
      mockOwnerUser,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256:
          "e111111111111111111111111111111111111111111111111111111111111111",
        pageCount: 10,
        sceneCount: 2,
      },
    );

    const ent1 = await projectsService.createEntity(
      mockOwnerUser,
      project.id,
      draft1.id,
      {
        canonicalName: "CyberCorp International",
        type: "BRAND_BUSINESS_PRODUCT",
        aliases: [],
        
        confirmed: true,
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 10, end: 50 },
            contextExcerpt: "CyberCorp tower in background.",
          },
        ],
      },
    );

    const run1Id = generateUuidV7();
    await researchService.conductResearchForEntity({
      projectId: project.id,
      runId: run1Id,
      entityId: ent1.id,
    });
    const run1 = await firestoreService.getRun(project.id, run1Id);
    if (run1) {
      await firestoreService.saveRun({
        ...run1,
        scriptVersionId: draft1.id,
        
        state: "APPROVED",
      });
    }

    // Generate Clearance Report & Certificate for Draft 1
    const report1 = await reviewsService.generateClearanceReport(
      mockOwnerUser,
      project.id,
      run1Id,
    );

    // Revision 2
    const draft2 = await projectsService.createScriptVersion(
      mockOwnerUser,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256:
          "e222222222222222222222222222222222222222222222222222222222222222",
        pageCount: 12,
        sceneCount: 3,
      },
    );

    // Get History
    const historyResp = await differentialService.getScriptDraftHistory(
      mockOwnerUser,
      project.id,
    );

    expect(historyResp.projectId).toBe(project.id);
    expect(historyResp.history.length).toBe(2);

    const draft1History = historyResp.history[0]!;
    expect(draft1History.versionNumber).toBe(1);
    expect(draft1History.checksumSha256).toBe(draft1.checksumSha256);
    expect(draft1History.clearanceReportId).toBe(report1.id);
    expect(draft1History.certificateSealSha256).toBe(
      report1.verification.contentDigestSha256,
    );

    const draft2History = historyResp.history[1]!;
    expect(draft2History.versionNumber).toBe(2);
    expect(draft2History.checksumSha256).toBe(draft2.checksumSha256);
  });

  it("5. Strict Tenant Authorization: Unauthorized user cannot perform script diffing or run execution", async () => {
    const project = await projectsService.createProject(mockOwnerUser, {
      title: "Private Production",
      organizationId: await projectsService.getPrimaryOrgIdForUser(mockOwnerUser),
      jurisdiction: "US",
    });

    const script = await projectsService.createScriptVersion(
      mockOwnerUser,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256:
          "f111111111111111111111111111111111111111111111111111111111111111",
        pageCount: 5,
        sceneCount: 1,
      },
    );

    await expect(
      differentialService.compareScriptVersions(
        mockUnauthorizedUser,
        project.id,
        {
          baseScriptVersionId: script.id,
          targetScriptVersionId: script.id,
        },
      ),
    ).rejects.toThrow("FORBIDDEN");

    await expect(
      differentialService.executeDifferentialClearanceRun(mockUnauthorizedUser, {
        projectId: project.id,
        targetScriptVersionId: script.id,
        jurisdiction: "US",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
});
