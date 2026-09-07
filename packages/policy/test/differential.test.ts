import { describe, expect, it } from "vitest";
import {
  compareScriptRevisions,
  parseScreenplayScenesFromText,
} from "../src/differential";
import type { CanonicalEntity, Finding } from "@permissa/contracts";

const createEntity = (
  name: string,
  type = "PERSON_CHARACTER",
  mentionsCount = 1,
): CanonicalEntity => ({
  id: `ent-${name.toLowerCase().replace(/\s+/g, "-")}`,
  scriptVersionId: "script-v1",
  type: type as any,
  canonicalName: name,
  aliases: [],
  version: 1,
  mentions: Array.from({ length: mentionsCount }).map((_, i) => ({
    sceneId: `scene-${i + 1}`,
    sourceRange: { start: i * 10, end: i * 10 + 5 },
    contextExcerpt: `${name} speaks dialogue in scene ${i + 1}`,
  })),
  confirmed: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const createFinding = (
  entityId: string,
  score = 90,
  admittedStatus = "RESEARCH_CLEARED",
): Finding => ({
  id: `find-${entityId}`,
  runId: "run-001",
  entityId,
  proposedStatus: admittedStatus as any,
  admittedStatus: admittedStatus as any,
  professionalConfirmationRequired: false,
  confidence: {
    formulaVersion: "0.1",
    rawScore: score,
    finalScore: score,
    band: score >= 85 ? "HIGH" : "MEDIUM",
    factors: {
      authority: 30,
      independence: 20,
      match: 25,
      freshness: 10,
      context: 10,
    },
    caps: [],
    invalidations: [],
    reasonCodes: [],
  },
  reasonCodes: [],
  rationale: "Validated",
  rewriteSuggestion: null,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("Screenplay Revision Comparison & Differential Engine (Batch 4)", () => {
  it("Parses scenes and dialogues from raw screenplay text", () => {
    const rawText = `
INT. COFFEE SHOP - DAY
ALICE
Can I get an espresso?

BOB
Right away, Alice.

EXT. PARKING LOT - NIGHT
A black sedan speeds away.
`;
    const scenes = parseScreenplayScenesFromText(rawText);
    expect(scenes.length).toBe(2);
    expect(scenes[0]?.heading).toContain("INT. COFFEE SHOP - DAY");
    expect(scenes[0]?.lines.length).toBe(2);
    expect(scenes[0]?.lines[0]?.speaker).toBe("ALICE");
    expect(scenes[1]?.heading).toContain("EXT. PARKING LOT - NIGHT");
  });

  it("Detects modified lines between Script v1 and Script v2 within matching scenes", () => {
    const v1Text = `
INT. LAB - DAY
DR. EVAN
The formula is completely stable.
`;
    const v2Text = `
INT. LAB - DAY
DR. EVAN
The formula is highly volatile and dangerous!
`;
    const result = compareScriptRevisions(
      {
        id: "script-v1",
        versionNumber: 1,
        rawText: v1Text,
        entities: [],
      },
      {
        id: "script-v2",
        versionNumber: 2,
        rawText: v2Text,
        entities: [],
      },
    );

    expect(result.sceneDiffs.length).toBe(1);
    const scene = result.sceneDiffs[0]!;
    expect(scene.changeType).toBe("MODIFIED");
    expect(scene.modifiedLinesCount).toBe(1);
    expect(scene.lineDiffs[0]?.type).toBe("MODIFIED");
    expect(scene.lineDiffs[0]?.oldText).toBe(
      "The formula is completely stable.",
    );
    expect(scene.lineDiffs[0]?.text).toBe(
      "The formula is highly volatile and dangerous!",
    );
  });

  it("Detects newly introduced entities in Script v2 as ADDED with research required", () => {
    const entAlice = createEntity("Alice");
    const entBob = createEntity("Bob"); // Newly introduced in v2

    const result = compareScriptRevisions(
      {
        id: "script-v1",
        versionNumber: 1,
        rawText: "INT. OFFICE - DAY\nALICE\nHello.",
        entities: [entAlice],
        priorFindings: [createFinding(entAlice.id, 92, "RESEARCH_CLEARED")],
      },
      {
        id: "script-v2",
        versionNumber: 2,
        rawText: "INT. OFFICE - DAY\nALICE\nHello Bob.\nBOB\nHello Alice.",
        entities: [entAlice, entBob],
      },
    );

    expect(result.summary.addedEntitiesCount).toBe(1);
    expect(result.summary.untouchedEntitiesCount).toBe(1);

    const bobDelta = result.entityDeltas.find((d) => d.canonicalName === "Bob")!;
    expect(bobDelta.changeType).toBe("ADDED");
    expect(bobDelta.requiresResearch).toBe(true);
    expect(bobDelta.carryForwardAllowed).toBe(false);

    const aliceDelta = result.entityDeltas.find(
      (d) => d.canonicalName === "Alice",
    )!;
    expect(aliceDelta.changeType).toBe("UNTOUCHED");
    expect(aliceDelta.carryForwardAllowed).toBe(true);
    expect(aliceDelta.requiresResearch).toBe(false);
  });

  it("Flags modified entities when mention context changes between revisions", () => {
    const entAliceV1 = createEntity("Alice", "PERSON_CHARACTER", 1);
    const entAliceV2 = createEntity("Alice", "PERSON_CHARACTER", 2); // Mentioned in 2 scenes now

    const result = compareScriptRevisions(
      {
        id: "script-v1",
        versionNumber: 1,
        entities: [entAliceV1],
        priorFindings: [createFinding(entAliceV1.id, 90, "RESEARCH_CLEARED")],
      },
      {
        id: "script-v2",
        versionNumber: 2,
        entities: [entAliceV2],
      },
    );

    expect(result.summary.modifiedEntitiesCount).toBe(1);
    const delta = result.entityDeltas[0]!;
    expect(delta.changeType).toBe("MODIFIED");
    expect(delta.requiresResearch).toBe(true);
    expect(delta.carryForwardAllowed).toBe(false);
  });

  it("Identifies deleted entities omitted from Script v2", () => {
    const entAlice = createEntity("Alice");
    const entCharlie = createEntity("Charlie"); // Omitted in v2

    const result = compareScriptRevisions(
      {
        id: "script-v1",
        versionNumber: 1,
        entities: [entAlice, entCharlie],
        priorFindings: [
          createFinding(entAlice.id, 90, "RESEARCH_CLEARED"),
          createFinding(entCharlie.id, 88, "RESEARCH_CLEARED"),
        ],
      },
      {
        id: "script-v2",
        versionNumber: 2,
        entities: [entAlice],
      },
    );

    expect(result.summary.deletedEntitiesCount).toBe(1);
    const charlieDelta = result.entityDeltas.find(
      (d) => d.canonicalName === "Charlie",
    )!;
    expect(charlieDelta.changeType).toBe("DELETED");
    expect(charlieDelta.requiresResearch).toBe(false);
  });

  it("Calculates financial savings from carried-forward findings", () => {
    const ent1 = createEntity("Entity 1");
    const ent2 = createEntity("Entity 2");
    const ent3 = createEntity("Entity 3");

    const result = compareScriptRevisions(
      {
        id: "script-v1",
        versionNumber: 1,
        entities: [ent1, ent2, ent3],
        priorFindings: [
          createFinding(ent1.id, 90, "RESEARCH_CLEARED"),
          createFinding(ent2.id, 95, "RESEARCH_CLEARED"),
          createFinding(ent3.id, 40, "INSUFFICIENT_EVIDENCE"), // Insufficient -> cannot carry forward
        ],
      },
      {
        id: "script-v2",
        versionNumber: 2,
        entities: [ent1, ent2, ent3],
      },
    );

    expect(result.summary.carriedForwardFindingsCount).toBe(2);
    expect(result.summary.researchRequiredCount).toBe(1);
    expect(result.summary.estimatedCostSavingsUsd).toBe(1.5); // 2 * 0.75
  });
});
