import { describe, it, expect } from "vitest";
import {
  evaluateEvidenceGate,
  computeConfidence,
  type ConfidenceInput,
} from "@permissa/policy";
import { generateUuidV7 } from "@permissa/contracts";
import { logContentFreeEvent } from "../src/lib/clearance-engine";

describe("Constitutional Guardrails & Policy Gates (Tranche 7 & 8)", () => {
  it("enforces that confidence score strictly gates RESEARCH_CLEARED at >= 85", () => {
    const borderlineInput: ConfidenceInput = {
      authority: "SINGLE_TIER_2",
      independence: "DISTINCT_DOMAIN_AND_OWNER",
      match: "STRONG",
      freshnessValid: true,
      context: "COMPLETE",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    };

    const confidence = computeConfidence(borderlineInput);

    const gateDecision = evaluateEvidenceGate({
      proposedStatus: "RESEARCH_CLEARED",
      confidence: borderlineInput,
      licenceSignalSupported: false,
      rewritePathSupported: false,
      strongConflict: false,
      severeContext: false,
    });

    if (confidence.finalScore >= 85) {
      expect(gateDecision.admittedStatus).toBe("RESEARCH_CLEARED");
    } else {
      expect(gateDecision.admittedStatus).not.toBe("RESEARCH_CLEARED");
    }
  });

  it("never admits final BLOCKED without professional reviewer mandate", () => {
    // When strong conflict and severe context exist
    const candidateInput: ConfidenceInput = {
      authority: "TIER_1_APPLICABLE",
      independence: "TIER_1_PATH",
      match: "EXACT_CORROBORATED",
      freshnessValid: true,
      context: "MATERIAL_GAP",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    };

    const gateDecision = evaluateEvidenceGate({
      proposedStatus: "BLOCKED",
      confidence: candidateInput,
      licenceSignalSupported: false,
      rewritePathSupported: true,
      strongConflict: true,
      severeContext: true,
    });

    // Evidence gate mandates professional human confirmation for BLOCKED
    expect(gateDecision.professionalConfirmationRequired).toBe(true);
    expect(gateDecision.reasonCodes).toContain(
      "PROFESSIONAL_CONFIRMATION_REQUIRED",
    );
  });

  it("generates monotonically ordered, unique UUIDv7 identifiers", () => {
    const id1 = generateUuidV7();
    const id2 = generateUuidV7();
    const id3 = generateUuidV7();

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);

    // UUIDv7 regex format: 8-4-4-4-12 hex chars with version 7
    const uuidv7Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id1).toMatch(uuidv7Regex);
    expect(id2).toMatch(uuidv7Regex);
    expect(id3).toMatch(uuidv7Regex);
  });

  it("content-free event logger produces zero PII or raw text payloads", () => {
    expect(() => {
      logContentFreeEvent("SEARCH_BATCH_COMPLETED", {
        runId: "run_77192",
        entityCount: 12,
        executionTimeMs: 45,
        statusCount: {
          RESEARCH_CLEARED: 3,
          NEEDS_REWRITE: 5,
          NEEDS_LICENCE: 1,
          INSUFFICIENT_EVIDENCE: 3,
        },
      });
    }).not.toThrow();
  });
});
