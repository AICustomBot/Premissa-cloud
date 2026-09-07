import { describe, expect, it } from "vitest";
import { evaluateEvidenceMatrix, synthesizeFinding } from "../src/index";
import type { CanonicalEntity, Citation } from "@permissa/contracts";

const createMockEntity = (
  overrides?: Partial<CanonicalEntity>,
): CanonicalEntity => ({
  id: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c3d",
  scriptVersionId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c3e",
  type: "BRAND_BUSINESS_PRODUCT",
  canonicalName: "Acme Dynamics",
  aliases: ["Acme"],
  version: 1,
  mentions: [
    {
      sceneId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c3d",
      sourceRange: { start: 1, end: 10 },
      contextExcerpt: "Acme product box on table",
    },
  ],
  confirmed: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockCitation = (overrides?: Partial<Citation>): Citation => ({
  id: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c3f",
  taskId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c40",
  originalUrl: "https://tsdr.uspto.gov/#caseNumber=998877",
  resolvedUrl: "https://tsdr.uspto.gov/#caseNumber=998877",
  resolvedDomain: "uspto.gov",
  controllingOwner: "USPTO",
  title: "Official Trademark Record",
  excerpt: "Active registration for Acme Dynamics in Class 009.",
  sourceTier: "TIER_1",
  claimType: "CURRENT_STATUS",
  query: "Acme Dynamics USPTO",
  publishedAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  retrievedAt: new Date().toISOString(),
  registryRecordId: "RN998877",
  contentHash: "hash-tier1-valid",
  reachable: true,
  ...overrides,
});

describe("Evidence Synthesis Matrix Formalization (Batch 4)", () => {
  it("Verifies brand trademark claim with Tier 1 registry and promotes to RESEARCH_CLEARED", () => {
    const entity = createMockEntity({ type: "BRAND_BUSINESS_PRODUCT" });
    const citation = createMockCitation({ sourceTier: "TIER_1" });

    const matrix = evaluateEvidenceMatrix({
      entity,
      citations: [citation],
      riskAnalysis: {
        pillar: "TRADEMARK_DILUTION_CONFUSION",
        severeContext: false,
        strongConflict: false,
        licenceSignalSupported: false,
        rewritePathSupported: false,
        matchQuality: "EXACT_CORROBORATED",
        contextQuality: "COMPLETE",
        rationale: "Nominative fair use",
        rewriteSuggestion: null,
        licenceSignal: null,
      },
    });

    expect(matrix.promotableToResearchCleared).toBe(true);
    expect(matrix.verifiedClaimsCount).toBe(1);
    expect(matrix.unverifiedClaimsCount).toBe(0);
    expect(matrix.hasVerifiedTier1OrCorroboratedTier2).toBe(true);
    expect(matrix.claims[0]?.status).toBe("VERIFIED");
    expect(matrix.claims[0]?.claimCategory).toBe("TRADEMARK_REGISTRY");
  });

  it("Rejects Tier 3 discovery citations from verifying legal claims", () => {
    const entity = createMockEntity({ type: "BRAND_BUSINESS_PRODUCT" });
    const citation = createMockCitation({
      sourceTier: "TIER_3",
      resolvedDomain: "fandom.wiki.com",
      controllingOwner: "Fandom",
      title: "Fan Wiki Mention",
    });

    const matrix = evaluateEvidenceMatrix({
      entity,
      citations: [citation],
      riskAnalysis: {
        pillar: "TRADEMARK_DILUTION_CONFUSION",
        severeContext: false,
        strongConflict: false,
        licenceSignalSupported: false,
        rewritePathSupported: false,
        matchQuality: "STRONG",
        contextQuality: "COMPLETE",
        rationale: "Nominative reference",
        rewriteSuggestion: null,
        licenceSignal: null,
      },
    });

    expect(matrix.promotableToResearchCleared).toBe(false);
    expect(matrix.verifiedClaimsCount).toBe(0);
    expect(matrix.unverifiedClaimsCount).toBe(1);
    expect(matrix.primaryReasonCode).toBe("SOURCE_TIER_INSUFFICIENT");
    expect(matrix.claims[0]?.rejectionReason).toBe("SOURCE_TIER_INSUFFICIENT");
  });

  it("Corroborates claims with two independent Tier 2 sources", () => {
    const entity = createMockEntity({ type: "BRAND_BUSINESS_PRODUCT" });
    const citationA = createMockCitation({
      id: "cit-variety",
      sourceTier: "TIER_2",
      resolvedDomain: "variety.com",
      controllingOwner: "Penske Media",
    });
    const citationB = createMockCitation({
      id: "cit-hollywoodreporter",
      sourceTier: "TIER_2",
      resolvedDomain: "hollywoodreporter.com",
      controllingOwner: "Eldridge Industries",
    });

    const matrix = evaluateEvidenceMatrix({
      entity,
      citations: [citationA, citationB],
      riskAnalysis: {
        pillar: "TRADEMARK_DILUTION_CONFUSION",
        severeContext: false,
        strongConflict: false,
        licenceSignalSupported: false,
        rewritePathSupported: false,
        matchQuality: "EXACT_CORROBORATED",
        contextQuality: "COMPLETE",
        rationale: "Nominative reference",
        rewriteSuggestion: null,
        licenceSignal: null,
      },
    });

    expect(matrix.promotableToResearchCleared).toBe(true);
    expect(matrix.verifiedClaimsCount).toBe(1);
    expect(matrix.claims[0]?.isIndependent).toBe(true);
    expect(matrix.claims[0]?.status).toBe("VERIFIED");
  });

  it("Flags CONTRADICTED status when unresolved claim conflicts exist", () => {
    const entity = createMockEntity();
    const citation = createMockCitation({ sourceTier: "TIER_1" });

    const matrix = evaluateEvidenceMatrix({
      entity,
      citations: [citation],
      unresolvedConflict: true,
      riskAnalysis: {
        pillar: "TRADEMARK_DILUTION_CONFUSION",
        severeContext: false,
        strongConflict: false,
        licenceSignalSupported: false,
        rewritePathSupported: false,
        matchQuality: "STRONG",
        contextQuality: "COMPLETE",
        rationale: "Contradictory trademark entries",
        rewriteSuggestion: null,
        licenceSignal: null,
      },
    });

    expect(matrix.hasContradictions).toBe(true);
    expect(matrix.promotableToResearchCleared).toBe(false);
    expect(matrix.contradictedClaimsCount).toBe(1);
    expect(matrix.primaryReasonCode).toBe("EVIDENCE_CONFLICT");
  });

  it("Ensures synthesizeFinding returns full matrix breakdown alongside finding", () => {
    const entity = createMockEntity();
    const citation = createMockCitation({ sourceTier: "TIER_1" });

    const result = synthesizeFinding({
      runId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c41",
      entity,
      citations: [citation],
      riskOverrides: { isNominativeFairUse: true },
    });

    expect(result.matrixResult).toBeDefined();
    expect(result.matrixResult.verifiedClaimsCount).toBe(1);
    expect(result.matrixResult.claims.length).toBeGreaterThan(0);
    expect(result.finding.admittedStatus).toBe("RESEARCH_CLEARED");
  });
});
