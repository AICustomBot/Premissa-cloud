import {
  Citation,
  CanonicalEntity,
  Finding,
  ReasonCode,
} from "@permissa/contracts";
import {
  evaluateEvidenceGate,
  type GateInput,
  type GateDecision,
  type ProposedStatus,
} from "./evidence-gate";
import {
  type AuthorityPattern,
  type IndependencePattern,
  type ConfidenceInput,
} from "./confidence";
import {
  evaluateLegalRisk,
  type EntityRiskInput,
  type LegalRiskAnalysis,
} from "./legal-pillars";
import {
  evaluateEvidenceMatrix,
  type EvidenceMatrixEvaluation,
} from "./evidence-matrix";

export interface SynthesisRequest {
  runId: string;
  entity: CanonicalEntity;
  citations: Citation[];
  riskOverrides?: Partial<EntityRiskInput>;
  providerFailed?: boolean;
  budgetLimited?: boolean;
  unresolvedConflict?: boolean;
  findingId?: string;
}

export interface SynthesisResult {
  riskAnalysis: LegalRiskAnalysis;
  authorityPattern: AuthorityPattern;
  independencePattern: IndependencePattern;
  confidenceInput: ConfidenceInput;
  matrixResult: EvidenceMatrixEvaluation;
  gateDecision: GateDecision;
  finding: Finding;
}

/**
 * Deterministic Evidence Gate & Policy Synthesis Engine.
 * Strictly adheres to constitutional invariants:
 * 1. Models NEVER assign clearance statuses or confidence scores directly.
 * 2. No RESEARCH_CLEARED status without a passing evidence gate and confidence score >= 85.
 * 3. No final BLOCKED status without professional reviewer confirmation.
 * 4. Optimistic concurrency control (version: 1) and snapshot policy versions.
 */
export function synthesizeFinding(request: SynthesisRequest): SynthesisResult {
  const { entity, citations } = request;

  // 1. Analyze Citation Authority & Independence Patterns
  const tier1Citations = citations.filter((c) => c.sourceTier === "TIER_1");
  const tier2Citations = citations.filter((c) => c.sourceTier === "TIER_2");
  const hasReachable = citations.some((c) => c.reachable);

  let authorityPattern: AuthorityPattern = "NONE";
  let independencePattern: IndependencePattern = "SINGLE_SOURCE";

  if (tier1Citations.length > 0) {
    authorityPattern = "TIER_1_APPLICABLE";
    independencePattern = "TIER_1_PATH";
  } else if (tier2Citations.length >= 2) {
    // Check if at least two Tier 2 citations are independent (distinct domain and owner)
    let foundIndependent = false;
    let foundSameOwner = false;

    for (let i = 0; i < tier2Citations.length; i++) {
      for (let j = i + 1; j < tier2Citations.length; j++) {
        const a = tier2Citations[i];
        const b = tier2Citations[j];
        if (!a || !b) continue;

        if (a.resolvedDomain !== b.resolvedDomain) {
          if (
            a.controllingOwner &&
            b.controllingOwner &&
            a.controllingOwner === b.controllingOwner
          ) {
            foundSameOwner = true;
          } else {
            foundIndependent = true;
            break;
          }
        }
      }
      if (foundIndependent) break;
    }

    if (foundIndependent) {
      authorityPattern = "TWO_INDEPENDENT_TIER_2";
      independencePattern = "DISTINCT_DOMAIN_AND_OWNER";
    } else if (foundSameOwner) {
      authorityPattern = "SINGLE_TIER_2";
      independencePattern = "DISTINCT_DOMAIN_SAME_OWNER";
    } else {
      authorityPattern = "SINGLE_TIER_2";
      independencePattern = "DUPLICATE";
    }
  } else if (tier2Citations.length === 1) {
    authorityPattern = "SINGLE_TIER_2";
    independencePattern = "SINGLE_SOURCE";
  } else if (citations.length > 0) {
    authorityPattern = "TIER_3_ONLY";
    independencePattern = "SINGLE_SOURCE";
  }

  // 2. Evaluate Legal Risk across the Four Pillars
  const riskInput: EntityRiskInput = {
    entityType: entity.type,
    canonicalName: entity.canonicalName,
    isRegisteredTrademark:
      tier1Citations.length > 0 && entity.type === "BRAND_BUSINESS_PRODUCT",
    isRegisteredCopyrightWork:
      tier1Citations.length > 0 && entity.type === "PRODUCTION_TITLE",
    ...request.riskOverrides,
  };

  const riskAnalysis = evaluateLegalRisk(riskInput);

  // 3. Formulate Deterministic Confidence Input
  const hasAdmissibleCitation = citations.length > 0 && hasReachable;
  const citationUnreachable = citations.length > 0 && !hasReachable;

  const confidenceInput: ConfidenceInput = {
    authority: authorityPattern,
    independence: independencePattern,
    match: riskAnalysis.matchQuality,
    freshnessValid: true,
    context: riskAnalysis.contextQuality,
    unresolvedConflict: Boolean(request.unresolvedConflict),
    providerFailed: Boolean(request.providerFailed),
    budgetLimited: Boolean(request.budgetLimited),
    citationUnreachable,
    hasAdmissibleCitation,
    evidenceExpired: false,
  };

  // 4. Formulate Evidence Synthesis Matrix
  const matrixResult = evaluateEvidenceMatrix({
    entity,
    citations,
    riskAnalysis,
    unresolvedConflict: Boolean(request.unresolvedConflict),
    providerFailed: Boolean(request.providerFailed),
    budgetLimited: Boolean(request.budgetLimited),
  });

  // 5. Propose Status Based on Legal Pillar Findings
  let proposedStatus: ProposedStatus = "INSUFFICIENT_EVIDENCE";

  if (riskAnalysis.severeContext && riskAnalysis.strongConflict) {
    proposedStatus = "BLOCKED";
  } else if (riskAnalysis.rewritePathSupported) {
    proposedStatus = "NEEDS_REWRITE";
  } else if (riskAnalysis.licenceSignalSupported) {
    proposedStatus = "NEEDS_LICENCE";
  } else if (hasAdmissibleCitation) {
    proposedStatus = "RESEARCH_CLEARED";
  }

  // 6. Submit to Deterministic Evidence Gate
  const gateInput: GateInput = {
    proposedStatus,
    confidence: confidenceInput,
    licenceSignalSupported: riskAnalysis.licenceSignalSupported,
    rewritePathSupported: riskAnalysis.rewritePathSupported,
    strongConflict: riskAnalysis.strongConflict,
    severeContext: riskAnalysis.severeContext,
    allClaimsVerified: matrixResult.promotableToResearchCleared,
  };

  const gateDecision = evaluateEvidenceGate(gateInput);

  // 7. Map Reason Codes safely to ReasonCode enum
  const allRawReasonCodes = [...gateDecision.reasonCodes];
  if (
    matrixResult.primaryReasonCode &&
    !allRawReasonCodes.includes(matrixResult.primaryReasonCode)
  ) {
    allRawReasonCodes.push(matrixResult.primaryReasonCode);
  }

  const safeReasonCodes = allRawReasonCodes
    .map((code) => {
      const parsed = ReasonCode.safeParse(code);
      return parsed.success ? parsed.data : null;
    })
    .filter((code): code is typeof ReasonCode._type => code !== null);

  // 8. Emit Optimistically Concurrency-Controlled Finding Record
  const now = new Date().toISOString();
  const findingId = request.findingId ?? generateUuidV7Fallback();

  const finding: Finding = {
    id: findingId,
    runId: request.runId,
    entityId: entity.id,
    proposedStatus,
    admittedStatus: gateDecision.admittedStatus,
    professionalConfirmationRequired:
      gateDecision.professionalConfirmationRequired,
    confidence: {
      formulaVersion: gateDecision.confidence.formulaVersion,
      rawScore: gateDecision.confidence.rawScore,
      finalScore: gateDecision.confidence.finalScore,
      band: gateDecision.confidence.band,
      factors: gateDecision.confidence.factors,
      caps: gateDecision.confidence.caps,
      invalidations: gateDecision.confidence.invalidations,
      reasonCodes: safeReasonCodes,
    },
    reasonCodes: safeReasonCodes,
    rationale: riskAnalysis.rationale,
    rewriteSuggestion: riskAnalysis.rewriteSuggestion,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  return {
    riskAnalysis,
    authorityPattern,
    independencePattern,
    confidenceInput,
    matrixResult,
    gateDecision,
    finding,
  };
}

/**
 * Server-side UUIDv7 fallback generator for unique Finding identifiers.
 */
function generateUuidV7Fallback(): string {
  const timestamp = Date.now();
  const hexTime = timestamp.toString(16).padStart(12, "0");
  const randA = Math.floor(Math.random() * 0xfff)
    .toString(16)
    .padStart(3, "0");
  const randB = Math.floor((Math.random() * 0x3fff) | 0x8000)
    .toString(16)
    .padStart(4, "0");
  const randC = Math.floor(Math.random() * 0xffffffffffff)
    .toString(16)
    .padStart(12, "0");

  return `${hexTime.slice(0, 8)}-${hexTime.slice(8, 12)}-7${randA}-${randB}-${randC}`;
}
