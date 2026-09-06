import {
  CLEARED_MIN_CONFIDENCE,
  CONFIDENCE_FORMULA_VERSION,
  CONFLICT_SCORE_CAP,
} from "./versions";

export type AuthorityPattern =
  | "TIER_1_APPLICABLE"
  | "TWO_INDEPENDENT_TIER_2"
  | "SINGLE_TIER_2"
  | "TIER_3_ONLY"
  | "NONE";

export type IndependencePattern =
  | "TIER_1_PATH"
  | "DISTINCT_DOMAIN_AND_OWNER"
  | "DISTINCT_DOMAIN_SAME_OWNER"
  | "SINGLE_SOURCE"
  | "DUPLICATE";

export type MatchQuality = "EXACT_CORROBORATED" | "STRONG" | "PARTIAL" | "WEAK";

export type ContextQuality = "COMPLETE" | "MINOR_GAP" | "MATERIAL_GAP";

export type ConfidenceInput = {
  authority: AuthorityPattern;
  independence: IndependencePattern;
  match: MatchQuality;
  freshnessValid: boolean;
  context: ContextQuality;
  unresolvedConflict: boolean;
  providerFailed: boolean;
  budgetLimited: boolean;
  citationUnreachable: boolean;
  hasAdmissibleCitation: boolean;
  evidenceExpired: boolean;
};

export type ConfidenceOutput = {
  formulaVersion: string;
  rawScore: number;
  finalScore: number;
  band: "LOW" | "MEDIUM" | "HIGH";
  factors: {
    authority: number;
    independence: number;
    entityMatch: number;
    freshness: number;
    context: number;
  };
  caps: string[];
  invalidations: string[];
};

const AUTHORITY: Record<AuthorityPattern, number> = {
  TIER_1_APPLICABLE: 40,
  TWO_INDEPENDENT_TIER_2: 32,
  SINGLE_TIER_2: 16,
  TIER_3_ONLY: 0,
  NONE: 0,
};

const INDEPENDENCE: Record<IndependencePattern, number> = {
  TIER_1_PATH: 20,
  DISTINCT_DOMAIN_AND_OWNER: 20,
  DISTINCT_DOMAIN_SAME_OWNER: 8,
  SINGLE_SOURCE: 0,
  DUPLICATE: 0,
};

const MATCH: Record<MatchQuality, number> = {
  EXACT_CORROBORATED: 20,
  STRONG: 15,
  PARTIAL: 8,
  WEAK: 0,
};

const CONTEXT: Record<ContextQuality, number> = {
  COMPLETE: 10,
  MINOR_GAP: 5,
  MATERIAL_GAP: 0,
};

export const bandFor = (score: number): "LOW" | "MEDIUM" | "HIGH" =>
  score >= CLEARED_MIN_CONFIDENCE ? "HIGH" : score >= 60 ? "MEDIUM" : "LOW";

/** Deterministic. Model output never contributes a score directly. */
export const computeConfidence = (input: ConfidenceInput): ConfidenceOutput => {
  const factors = {
    authority: AUTHORITY[input.authority],
    independence: INDEPENDENCE[input.independence],
    entityMatch: MATCH[input.match],
    freshness: input.freshnessValid ? 10 : 0,
    context: CONTEXT[input.context],
  };

  const rawScore =
    factors.authority +
    factors.independence +
    factors.entityMatch +
    factors.freshness +
    factors.context;

  const caps: string[] = [];
  const invalidations: string[] = [];
  let finalScore = rawScore;

  if (input.providerFailed) invalidations.push("PROVIDER_FAILED");
  if (input.budgetLimited) invalidations.push("BUDGET_LIMIT");
  if (input.citationUnreachable) invalidations.push("CITATION_UNREACHABLE");
  if (!input.hasAdmissibleCitation) invalidations.push("EVIDENCE_MISSING");
  if (input.evidenceExpired) invalidations.push("EVIDENCE_EXPIRED");

  if (invalidations.length > 0) {
    finalScore = 0;
  } else if (input.unresolvedConflict) {
    caps.push("UNRESOLVED_CONFLICT");
    finalScore = Math.min(finalScore, CONFLICT_SCORE_CAP);
  }

  return {
    formulaVersion: CONFIDENCE_FORMULA_VERSION,
    rawScore,
    finalScore,
    band: bandFor(finalScore),
    factors,
    caps,
    invalidations,
  };
};
