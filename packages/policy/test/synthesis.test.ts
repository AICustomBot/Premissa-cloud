import { describe, expect, it } from "vitest";
import {
  synthesizeFinding,
  evaluateLegalRisk,
  EVIDENCE_POLICY_VERSION,
  CONFIDENCE_FORMULA_VERSION,
} from "../src/index";
import type { CanonicalEntity, Citation } from "@permissa/contracts";

const createMockEntity = (overrides?: Partial<CanonicalEntity>): CanonicalEntity => ({
  id: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c3d",
  scriptVersionId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c3e",
  type: "PERSON_CHARACTER",
  canonicalName: "John Doe",
  aliases: ["Johnny"],
  version: 1,
  mentions: [
    {
      sceneId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c3d",
      sourceRange: { start: 1, end: 10 },
      contextExcerpt: "test",
    }
  ],
  confirmed: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockCitation = (overrides?: Partial<Citation>): Citation => ({
  id: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c3f",
  taskId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c40",
  originalUrl: "https://tsdr.uspto.gov/#caseNumber=12345",
  resolvedUrl: "https://tsdr.uspto.gov/#caseNumber=12345",
  resolvedDomain: "uspto.gov",
  controllingOwner: "USPTO",
  title: "USPTO Trademark Registration",
  excerpt: "Official registry entry for trademark mark in Class 025.",
  sourceTier: "TIER_1",
  claimType: "CURRENT_STATUS",
  query: "John Doe trademark status",
  publishedAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  retrievedAt: new Date().toISOString(),
  registryRecordId: "RN123456",
  contentHash: "abc123hash",
  reachable: true,
  ...overrides,
});

describe("Four-Pillar Legal Risk Evaluator", () => {
  it("Pillar 1: Extinguishes defamation causes of action for verified deceased historical figures", () => {
    const analysis = evaluateLegalRisk({
      entityType: "PERSON_CHARACTER",
      canonicalName: "Abraham Lincoln",
      isDeceasedHistorical: true,
      hasDefamatoryAllegations: true, // even if alleging crimes, US tort law extinguishes post-mortem
    });

    expect(analysis.pillar).toBe("DEFAMATION_FALSE_LIGHT");
    expect(analysis.severeContext).toBe(false);
    expect(analysis.strongConflict).toBe(false);
    expect(analysis.rationale).toContain("extinguish at death");
  });

  it("Pillar 1: Flags severe context and conflict for living person with defamatory allegations", () => {
    const analysis = evaluateLegalRisk({
      entityType: "PERSON_CHARACTER",
      canonicalName: "Living Executive",
      isLivingPerson: true,
      hasDefamatoryAllegations: true,
    });

    expect(analysis.pillar).toBe("DEFAMATION_FALSE_LIGHT");
    expect(analysis.severeContext).toBe(true);
    expect(analysis.strongConflict).toBe(true);
    expect(analysis.rewritePathSupported).toBe(true);
    expect(analysis.rewriteSuggestion).not.toBeNull();
  });

  it("Pillar 2: Evaluates nominative fair use for brands without commercial confusion", () => {
    const analysis = evaluateLegalRisk({
      entityType: "BRAND_BUSINESS_PRODUCT",
      canonicalName: "Coca-Cola",
      isNominativeFairUse: true,
      isRegisteredTrademark: true,
    });

    expect(analysis.pillar).toBe("TRADEMARK_DILUTION_CONFUSION");
    expect(analysis.severeContext).toBe(false);
    expect(analysis.licenceSignalSupported).toBe(false);
    expect(analysis.rationale).toContain("nominative fair use");
  });

  it("Pillar 2: Identifies trademark tarnishment for defective or hazardous product portrayal", () => {
    const analysis = evaluateLegalRisk({
      entityType: "BRAND_BUSINESS_PRODUCT",
      canonicalName: "Acme Brakes",
      hasTarnishingPortrayal: true,
      isRegisteredTrademark: true,
    });

    expect(analysis.pillar).toBe("TRADEMARK_DILUTION_CONFUSION");
    expect(analysis.severeContext).toBe(true);
    expect(analysis.strongConflict).toBe(true);
    expect(analysis.rewritePathSupported).toBe(true);
    expect(analysis.rewriteSuggestion).toContain("fictitious brand name");
  });

  it("Pillar 3: Identifies unauthorized Right of Publicity commercial exploitation", () => {
    const analysis = evaluateLegalRisk({
      entityType: "PERSON_CHARACTER",
      canonicalName: "Famous Athlete",
      hasCommercialExploitation: true,
    });

    expect(analysis.pillar).toBe("RIGHT_OF_PUBLICITY");
    expect(analysis.licenceSignalSupported).toBe(true);
    expect(analysis.licenceSignal).toContain("Right of Publicity waiver");
  });

  it("Pillar 4: Verifies copyright and underlying literary property option agreements", () => {
    const analysis = evaluateLegalRisk({
      entityType: "PRODUCTION_TITLE",
      canonicalName: "The Great Novel",
      isRegisteredCopyrightWork: true,
      hasOptionAgreementRequired: true,
    });

    expect(analysis.pillar).toBe("COPYRIGHT_LITERARY_OPTION");
    expect(analysis.licenceSignalSupported).toBe(true);
    expect(analysis.licenceSignal).toContain("chain of title");
  });
});

describe("Deterministic Evidence Gate & Policy Synthesis", () => {
  it("Admits RESEARCH_CLEARED with Tier 1 citation and confidence score >= 85", () => {
    const entity = createMockEntity();
    const citation = createMockCitation({ sourceTier: "TIER_1" });

    const result = synthesizeFinding({
      runId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c41",
      entity,
      citations: [citation],
    });

    expect(result.finding.proposedStatus).toBe("RESEARCH_CLEARED");
    expect(result.finding.admittedStatus).toBe("RESEARCH_CLEARED");
    expect(result.finding.confidence.finalScore).toBeGreaterThanOrEqual(85);
    expect(result.finding.confidence.formulaVersion).toBe(CONFIDENCE_FORMULA_VERSION);
    expect(result.finding.version).toBe(1);
    expect(result.finding.professionalConfirmationRequired).toBe(false);
  });

  it("Downgrades to INSUFFICIENT_EVIDENCE when confidence is below 85 threshold", () => {
    const entity = createMockEntity();
    // Single Tier 2 citation yields score 41 (Authority 16 + Independence 0 + Match 20 + Freshness 10 + Context 10 = 56 < 85)
    const citation = createMockCitation({
      sourceTier: "TIER_2",
      resolvedDomain: "variety.com",
      controllingOwner: "Penske",
    });

    const result = synthesizeFinding({
      runId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c41",
      entity,
      citations: [citation],
    });

    expect(result.finding.proposedStatus).toBe("RESEARCH_CLEARED");
    expect(result.finding.admittedStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.finding.confidence.finalScore).toBeLessThan(85);
    expect(result.finding.reasonCodes).toContain("CONFIDENCE_BELOW_CLEARED_THRESHOLD");
  });

  it("Requires professional confirmation when proposing BLOCKED status", () => {
    const entity = createMockEntity();
    const citation = createMockCitation();

    const result = synthesizeFinding({
      runId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c41",
      entity,
      citations: [citation],
      riskOverrides: {
        hasDefamatoryAllegations: true,
        isLivingPerson: true,
      },
    });

    // When severeContext and strongConflict are true, proposed is BLOCKED
    expect(result.finding.proposedStatus).toBe("BLOCKED");
    expect(result.finding.admittedStatus).toBe("BLOCKED");
    expect(result.finding.professionalConfirmationRequired).toBe(true);
    expect(result.finding.reasonCodes).toContain("PROFESSIONAL_CONFIRMATION_REQUIRED");
  });

  it("Forces confidence score to 0 upon provider failure or budget limits", () => {
    const entity = createMockEntity();
    const citation = createMockCitation();

    const failedResult = synthesizeFinding({
      runId: "018f3a5e-7a91-7d1b-8e2b-4b6a8b1a2c41",
      entity,
      citations: [citation],
      providerFailed: true,
    });

    expect(failedResult.finding.confidence.finalScore).toBe(0);
    expect(failedResult.finding.admittedStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(failedResult.finding.confidence.invalidations).toContain("PROVIDER_FAILED");
  });
});
