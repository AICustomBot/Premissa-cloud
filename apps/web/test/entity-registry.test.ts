import { describe, expect, it } from "vitest";
import {
  extractCandidatesAndResolveAliases,
  mergeCandidateEntities,
  resolveEntityByMention,
  validateProducerConfirmationGate,
} from "../src/lib/entity-registry";
import type { SceneItem, ClearanceItem } from "../src/data/golden-data";

describe("Dynamic Entity Registry & Producer Confirmation Gate (Batch 3)", () => {
  const mockScenes: SceneItem[] = [
    {
      id: "sc-1",
      ordinal: 1,
      heading: "INT. CAIRO EDIT SUITE - NIGHT",
      location: "CAIRO EDIT SUITE",
      timeOfDay: "NIGHT",
      scriptVersionId: "v-1",
      sourceRange: { start: 0, end: 500 },
      lines: [
        {
          speaker: "NOOR",
          text: "Julian, look at this timestamp in Final Cut Pro.",
        },
        {
          speaker: "JULIAN",
          text: "Wait, is that from the Witness Protocol footage?",
        },
        {
          text: "Julian Voss adjusts his Vision Pro headset and steps closer.",
        },
      ],
      detectedEntityIds: [],
    },
    {
      id: "sc-2",
      ordinal: 2,
      heading: "EXT. DOWNTOWN CAIRO - DAY",
      location: "DOWNTOWN CAIRO",
      timeOfDay: "DAY",
      scriptVersionId: "v-1",
      sourceRange: { start: 501, end: 1000 },
      lines: [
        {
          speaker: "LAYLA",
          text: "Did Owen arrive with the Apple hardware?",
        },
        {
          speaker: "OWEN REED",
          text: "Yes, I brought the Appel One prototype as well.",
        },
      ],
      detectedEntityIds: [],
    },
  ];

  it("extracts candidates and resolves alias references into canonical entities", () => {
    const result = extractCandidatesAndResolveAliases(mockScenes, "test-script.fdx");
    expect(result.entities.length).toBeGreaterThanOrEqual(4);

    const names = result.entities.map((e) => e.canonicalName);
    expect(names).toContain("Julian Voss");
    expect(names).toContain("Noor Haddad");
    expect(names).toContain("Final Cut Pro");
    expect(names).toContain("Vision Pro");

    // Check alias resolution: "Julian" -> "Julian Voss"
    const julianEntity = result.entities.find((e) => e.canonicalName === "Julian Voss");
    expect(julianEntity).toBeDefined();
    expect(julianEntity?.aliases).toContain("Julian");

    // Check resolveEntityByMention
    const resolvedByAlias = resolveEntityByMention("Julian", result.entities);
    expect(resolvedByAlias?.canonicalName).toBe("Julian Voss");

    const resolvedByFullName = resolveEntityByMention("Julian Voss", result.entities);
    expect(resolvedByFullName?.canonicalName).toBe("Julian Voss");

    // Entities must start strictly unconfirmed
    expect(result.entities.every((e) => e.confirmedByProducer === false)).toBe(true);
  });

  it("strictly enforces the Producer Confirmation Gate on the client side", () => {
    const unconfirmedEntities: ClearanceItem[] = [
      {
        id: "ent-1",
        canonicalName: "Julian Voss",
        type: "PERSON_CHARACTER",
        aliases: ["Julian"],
        mentionsCount: 2,
        sceneIds: ["sc-1"],
        initialProposedStatus: "INSUFFICIENT_EVIDENCE",
        rationale: "Candidate entity",
        citations: [],
        confidenceInput: {} as any,
        confirmedByProducer: false,
        version: 1,
      },
    ];

    // 1. Unconfirmed entities must be blocked regardless of role
    const producerCheck = validateProducerConfirmationGate(unconfirmedEntities, "PRODUCER");
    expect(producerCheck.permitted).toBe(false);
    expect(producerCheck.unconfirmedCount).toBe(1);
    expect(producerCheck.problemDetails?.code).toBe("ENTITY_REGISTER_UNCONFIRMED");

    // 2. Non-producer role cannot authorize even if attempting
    const researcherCheck = validateProducerConfirmationGate(unconfirmedEntities, "LEGAL_RESEARCHER");
    expect(researcherCheck.permitted).toBe(false);
    expect(researcherCheck.problemDetails?.code).toBe("FORBIDDEN");

    // 3. When confirmed by Producer, authorization is granted
    const confirmedEntities = unconfirmedEntities.map((e) => ({
      ...e,
      confirmedByProducer: true,
    }));
    const authorizedCheck = validateProducerConfirmationGate(confirmedEntities, "PRODUCER");
    expect(authorizedCheck.permitted).toBe(true);
    expect(authorizedCheck.unconfirmedCount).toBe(0);
    expect(authorizedCheck.problemDetails).toBeUndefined();
  });

  it("merges candidate entity records deterministically", () => {
    const survivor: ClearanceItem = {
      id: "ent-survivor",
      canonicalName: "Julian Voss",
      type: "PERSON_CHARACTER",
      aliases: ["Julian"],
      mentionsCount: 3,
      sceneIds: ["sc-1"],
      initialProposedStatus: "INSUFFICIENT_EVIDENCE",
      rationale: "Primary character record",
      citations: [],
      confidenceInput: {} as any,
      confirmedByProducer: false,
      version: 1,
    };

    const duplicate: ClearanceItem = {
      id: "ent-duplicate",
      canonicalName: "Voss",
      type: "PERSON_CHARACTER",
      aliases: ["Dr. Voss"],
      mentionsCount: 2,
      sceneIds: ["sc-2"],
      initialProposedStatus: "INSUFFICIENT_EVIDENCE",
      rationale: "Duplicate mention",
      citations: [],
      confidenceInput: {} as any,
      confirmedByProducer: false,
      version: 1,
    };

    const merged = mergeCandidateEntities(survivor, [duplicate]);
    expect(merged.canonicalName).toBe("Julian Voss");
    expect(merged.aliases).toContain("Julian");
    expect(merged.aliases).toContain("Dr. Voss");
    expect(merged.aliases).toContain("Voss");
    expect(merged.mentionsCount).toBe(5);
    expect(merged.sceneIds).toEqual(["sc-1", "sc-2"]);
    expect(merged.version).toBe(2);
  });
});
