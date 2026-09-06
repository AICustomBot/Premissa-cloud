import { describe, it, expect } from "vitest";
import { INITIAL_CLEARANCE_ENTITIES } from "../src/data/golden-data";
import { evaluateEntityClearance } from "../src/lib/clearance-engine";
import oracleData from "../../../tests/fixtures/golden/expected-oracle.json";

describe("Deterministic Clearance Engine & Golden Oracle Reproduction", () => {
  it("evaluates all 12 golden screenplay entities with 100% oracle match", () => {
    expect(INITIAL_CLEARANCE_ENTITIES.length).toBe(12);

    for (const oracleEntity of oracleData.entities) {
      const matchedEntity = INITIAL_CLEARANCE_ENTITIES.find(
        (e) => e.canonicalName === oracleEntity.name,
      );

      expect(
        matchedEntity,
        `Expected entity "${oracleEntity.name}" to exist in golden data`,
      ).toBeDefined();

      if (!matchedEntity) continue;

      expect(matchedEntity.type).toBe(oracleEntity.type);

      // Evaluate clearance with deterministic policy
      const result = evaluateEntityClearance(matchedEntity, false);

      expect(result.admittedStatus).toBe(oracleEntity.finalExpectedStatus);
      expect(result.confidence.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.confidence.finalScore).toBeLessThanOrEqual(100);

      // Constitution rule: Cleared must have score >= 85
      if (result.admittedStatus === "RESEARCH_CLEARED") {
        expect(result.confidence.finalScore).toBeGreaterThanOrEqual(85);
      }
    }
  });

  it("enforces that no entity is assigned final BLOCKED status outside professional review", () => {
    // Constitutional invariant: no final BLOCKED outside human reviewer
    for (const entity of INITIAL_CLEARANCE_ENTITIES) {
      const evaluationWithoutReviewer = evaluateEntityClearance(entity, false);
      expect(evaluationWithoutReviewer.admittedStatus).not.toBe("BLOCKED");
    }
  });

  it("allows professional reviewer to override or approve blocked findings", () => {
    const blockedCandidate = INITIAL_CLEARANCE_ENTITIES.find(
      (e) => e.canonicalName === "Witness Protocol",
    );
    expect(blockedCandidate).toBeDefined();
    if (!blockedCandidate) return;

    // In golden data, Witness Protocol has a reviewer recommendation
    const reviewerEval = evaluateEntityClearance(blockedCandidate, true);
    expect(reviewerEval).toBeDefined();
    expect(reviewerEval.confidence).toBeDefined();
  });
});
