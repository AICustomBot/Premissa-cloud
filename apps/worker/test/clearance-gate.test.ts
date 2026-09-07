import { describe, expect, it } from "vitest";
import {
  CanonicalEntity,
  ClearanceRun,
  generateUuidV7,
} from "@permissa/contracts";
import { runClearanceJob } from "../src/clearance/run-job";
import { WorkerFirestoreClient } from "../src/storage/firestore";

describe("Producer Confirmation Gate & Clearance Execution (Batch 3)", () => {
  const setupTestEnvironment = async (options: {
    allConfirmed: boolean;
  }) => {
    const firestore = new WorkerFirestoreClient();
    const scriptVersionId = generateUuidV7();
    const runId = generateUuidV7();
    const now = new Date().toISOString();

    // Create 2 candidate entities
    const entity1: CanonicalEntity = {
      id: generateUuidV7(),
      scriptVersionId,
      type: "PERSON_CHARACTER",
      canonicalName: "Julian Voss",
      aliases: ["Julian", "Voss"],
      mentions: [
        {
          sceneId: generateUuidV7(),
          sourceRange: { start: 10, end: 20 },
          contextExcerpt: "Julian enters the conference room.",
        },
      ],
      confirmed: options.allConfirmed,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const entity2: CanonicalEntity = {
      id: generateUuidV7(),
      scriptVersionId,
      type: "BRAND_BUSINESS_PRODUCT",
      canonicalName: "Vision Pro",
      aliases: ["Apple Vision Pro"],
      mentions: [
        {
          sceneId: generateUuidV7(),
          sourceRange: { start: 40, end: 50 },
          contextExcerpt: "He puts on the Vision Pro headset.",
        },
      ],
      confirmed: true, // Only 1 confirmed if allConfirmed is false
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await firestore.saveEntity(entity1);
    await firestore.saveEntity(entity2);

    // Create Clearance Run
    const run: ClearanceRun = {
      id: runId,
      projectId: generateUuidV7(),
      scriptVersionId,
      state: "QUEUED",
      jurisdiction: "US",
      budget: {
        costCapUsd: 50,
        estimatedCostUsd: 0,
        parallelCallCap: 3,
        parallelCallsUsed: 0,
        entityCap: 25,
      },
      checkpoint: null,
      startedAt: null,
      endedAt: null,
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await firestore.saveRun(run);

    return { firestore, runId, scriptVersionId, entity1, entity2 };
  };

  it("STRICTLY BLOCKS research runs when candidate entities have not been confirmed by a Producer", async () => {
    const { firestore, runId } = await setupTestEnvironment({
      allConfirmed: false,
    });

    // Attempting to run clearance when entity1 is unconfirmed must throw
    await expect(
      runClearanceJob({
        runId,
        firestoreClient: firestore,
      }),
    ).rejects.toThrow(/PRODUCER_CONFIRMATION_REQUIRED/);

    // Verify run was NOT completed
    const run = await firestore.getRun(runId);
    expect(run?.state).toBe("QUEUED");
  });

  it("PERMITS research runs and completes checkpoints when all candidate entities are confirmed by Producer", async () => {
    const { firestore, runId } = await setupTestEnvironment({
      allConfirmed: true,
    });

    const result = await runClearanceJob({
      runId,
      firestoreClient: firestore,
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.completedEntities).toBe(2);

    const completedRun = await firestore.getRun(runId);
    expect(completedRun?.state).toBe("DRAFT_READY");
    expect(completedRun?.checkpoint?.completedEntityIds).toHaveLength(2);
    expect(completedRun?.checkpoint?.pendingEntityIds).toHaveLength(0);
  });
});
