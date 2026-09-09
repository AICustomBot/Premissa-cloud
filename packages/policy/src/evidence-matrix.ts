import { CanonicalEntity, Citation, ReasonCode } from "@permissa/contracts";
import type { LegalRiskAnalysis } from "./legal-pillars.js";
import type { MatchQuality } from "./confidence.js";

export type LegalClaimCategory =
  | "TRADEMARK_REGISTRY"
  | "DEFAMATION_FALSE_LIGHT_STATUS"
  | "RIGHT_OF_PUBLICITY_CONSENT"
  | "COPYRIGHT_LITERARY_OPTION"
  | "NOMINATIVE_FAIR_USE"
  | "FICTIONAL_COMPOSITE";

export interface ClaimVerificationResult {
  claimCategory: LegalClaimCategory;
  claimType: "CURRENT_STATUS" | "HISTORICAL";
  claimSummary: string;
  supportingCitationIds: string[];
  highestSourceTier: "TIER_1" | "TIER_2" | "TIER_3" | "NONE";
  status: "VERIFIED" | "UNVERIFIED" | "CONTRADICTED";
  isVerified: boolean;
  isReachableAndFresh: boolean;
  isIndependent: boolean;
  rejectionReason?: (typeof ReasonCode)["_type"] | undefined;
  notes: string;
}

export interface EvidenceMatrixInput {
  entity: CanonicalEntity;
  citations: Citation[];
  riskAnalysis: LegalRiskAnalysis;
  unresolvedConflict?: boolean | undefined;
  providerFailed?: boolean | undefined;
  budgetLimited?: boolean | undefined;
  evidenceExpired?: boolean | undefined;
}

export interface EvidenceMatrixEvaluation {
  claims: ClaimVerificationResult[];
  verifiedClaimsCount: number;
  unverifiedClaimsCount: number;
  contradictedClaimsCount: number;
  hasVerifiedTier1OrCorroboratedTier2: boolean;
  hasContradictions: boolean;
  promotableToResearchCleared: boolean;
  primaryReasonCode?: (typeof ReasonCode)["_type"] | undefined;
  evaluationNotes: string;
}

export function evaluateEvidenceMatrix(
  input: EvidenceMatrixInput,
): EvidenceMatrixEvaluation {
  const { entity, citations, riskAnalysis } = input;
  const claims: ClaimVerificationResult[] = [];
  const reachableCitations = citations.filter((c) => c.reachable);
  const tier1Citations = reachableCitations.filter(
    (c) => c.sourceTier === "TIER_1",
  );
  const tier2Citations = reachableCitations.filter(
    (c) => c.sourceTier === "TIER_2",
  );
  const tier3Citations = reachableCitations.filter(
    (c) => c.sourceTier === "TIER_3",
  );

  let twoIndependentTier2 = false;
  if (tier2Citations.length >= 2) {
    for (let i = 0; i < tier2Citations.length; i++) {
      for (let j = i + 1; j < tier2Citations.length; j++) {
        const cA = tier2Citations[i];
        const cB = tier2Citations[j];
        if (
          cA &&
          cB &&
          cA.resolvedDomain !== cB.resolvedDomain &&
          (!cA.controllingOwner ||
            !cB.controllingOwner ||
            cA.controllingOwner !== cB.controllingOwner)
        ) {
          twoIndependentTier2 = true;
          break;
        }
      }
      if (twoIndependentTier2) break;
    }
  }

  const hasHighTierAuthority = tier1Citations.length > 0 || twoIndependentTier2;
  let primaryClaim: ClaimVerificationResult;

  switch (entity.type) {
    case "BRAND_BUSINESS_PRODUCT": {
      const claimCategory: LegalClaimCategory = "TRADEMARK_REGISTRY";
      const claimSummary = `Active trademark and business entity registration status for "${entity.canonicalName}".`;
      if (citations.length === 0) {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: [],
          highestSourceTier: "NONE",
          status: "UNVERIFIED",
          isVerified: false,
          isReachableAndFresh: false,
          isIndependent: false,
          rejectionReason: "EVIDENCE_MISSING",
          notes: "No citations provided to substantiate trademark registration.",
        };
      } else if (tier1Citations.length > 0) {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: tier1Citations.map((c) => c.id),
          highestSourceTier: "TIER_1",
          status: "VERIFIED",
          isVerified: true,
          isReachableAndFresh: true,
          isIndependent: true,
          notes: "Verified via official registry authority (e.g. USPTO, Companies House).",
        };
      } else if (twoIndependentTier2) {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: tier2Citations.map((c) => c.id),
          highestSourceTier: "TIER_2",
          status: "VERIFIED",
          isVerified: true,
          isReachableAndFresh: true,
          isIndependent: true,
          notes: "Verified via two independent Tier 2 trade publications / business databases.",
        };
      } else if (tier2Citations.length === 1) {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: tier2Citations.map((c) => c.id),
          highestSourceTier: "TIER_2",
          status: "UNVERIFIED",
          isVerified: false,
          isReachableAndFresh: true,
          isIndependent: false,
          rejectionReason: "EVIDENCE_NOT_INDEPENDENT",
          notes: "Single Tier 2 source lacks required independent corroboration.",
        };
      } else {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: tier3Citations.map((c) => c.id),
          highestSourceTier: "TIER_3",
          status: "UNVERIFIED",
          isVerified: false,
          isReachableAndFresh: reachableCitations.length > 0,
          isIndependent: false,
          rejectionReason: "SOURCE_TIER_INSUFFICIENT",
          notes: "Tier 3 discovery sources cannot verify official trademark or corporate claims.",
        };
      }
      break;
    }

    case "PERSON_CHARACTER": {
      const claimCategory: LegalClaimCategory = "DEFAMATION_FALSE_LIGHT_STATUS";
      const claimSummary = `Identity, public figure status, and vital records verification for "${entity.canonicalName}".`;
      if (citations.length === 0) {
        primaryClaim = {
          claimCategory,
          claimType: "HISTORICAL",
          claimSummary,
          supportingCitationIds: [],
          highestSourceTier: "NONE",
          status: "UNVERIFIED",
          isVerified: false,
          isReachableAndFresh: false,
          isIndependent: false,
          rejectionReason: "EVIDENCE_MISSING",
          notes: "No citations provided to substantiate personal identity record.",
        };
      } else if (tier1Citations.length > 0) {
        primaryClaim = {
          claimCategory,
          claimType: "HISTORICAL",
          claimSummary,
          supportingCitationIds: tier1Citations.map((c) => c.id),
          highestSourceTier: "TIER_1",
          status: "VERIFIED",
          isVerified: true,
          isReachableAndFresh: true,
          isIndependent: true,
          notes: "Vital records / government gazette verified.",
        };
      } else if (twoIndependentTier2) {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: tier2Citations.map((c) => c.id),
          highestSourceTier: "TIER_2",
          status: "VERIFIED",
          isVerified: true,
          isReachableAndFresh: true,
          isIndependent: true,
          notes: "Verified via two independent journalistic / authoritative editorial sources.",
        };
      } else if (tier2Citations.length === 1) {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: tier2Citations.map((c) => c.id),
          highestSourceTier: "TIER_2",
          status: "UNVERIFIED",
          isVerified: false,
          isReachableAndFresh: true,
          isIndependent: false,
          rejectionReason: "EVIDENCE_NOT_INDEPENDENT",
          notes: "Single source requires secondary corroboration.",
        };
      } else {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: tier3Citations.map((c) => c.id),
          highestSourceTier: "TIER_3",
          status: "UNVERIFIED",
          isVerified: false,
          isReachableAndFresh: reachableCitations.length > 0,
          isIndependent: false,
          rejectionReason: "SOURCE_TIER_INSUFFICIENT",
          notes: "Tier 3 sources insufficient for personality rights clearance.",
        };
      }
      break;
    }

    case "PRODUCTION_TITLE":
    default: {
      const claimCategory: LegalClaimCategory = "COPYRIGHT_LITERARY_OPTION";
      const claimSummary = `Copyright office registration and chain of title claim for "${entity.canonicalName}".`;
      if (citations.length === 0) {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: [],
          highestSourceTier: "NONE",
          status: "UNVERIFIED",
          isVerified: false,
          isReachableAndFresh: false,
          isIndependent: false,
          rejectionReason: "EVIDENCE_MISSING",
          notes: "No citations provided for literary work or title verification.",
        };
      } else if (tier1Citations.length > 0) {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: tier1Citations.map((c) => c.id),
          highestSourceTier: "TIER_1",
          status: "VERIFIED",
          isVerified: true,
          isReachableAndFresh: true,
          isIndependent: true,
          notes: "Copyright Office / official catalog of entries verified.",
        };
      } else if (twoIndependentTier2) {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: tier2Citations.map((c) => c.id),
          highestSourceTier: "TIER_2",
          status: "VERIFIED",
          isVerified: true,
          isReachableAndFresh: true,
          isIndependent: true,
          notes: "Two independent industry trade archives verified.",
        };
      } else {
        primaryClaim = {
          claimCategory,
          claimType: "CURRENT_STATUS",
          claimSummary,
          supportingCitationIds: reachableCitations.map((c) => c.id),
          highestSourceTier: tier2Citations.length > 0 ? "TIER_2" : "TIER_3",
          status: "UNVERIFIED",
          isVerified: false,
          isReachableAndFresh: reachableCitations.length > 0,
          isIndependent: false,
          rejectionReason:
            tier2Citations.length > 0
              ? "EVIDENCE_NOT_INDEPENDENT"
              : "SOURCE_TIER_INSUFFICIENT",
          notes: "Insufficient independent authority to verify literary title rights.",
        };
      }
      break;
    }
  }

  if (input.unresolvedConflict) {
    primaryClaim.status = "CONTRADICTED";
    primaryClaim.isVerified = false;
    primaryClaim.rejectionReason = "EVIDENCE_CONFLICT";
    primaryClaim.notes = "Unresolved evidentiary conflict detected across claims.";
  }

  claims.push(primaryClaim);

  if (riskAnalysis.severeContext && riskAnalysis.strongConflict) {
    claims.push({
      claimCategory: "DEFAMATION_FALSE_LIGHT_STATUS",
      claimType: "CURRENT_STATUS",
      claimSummary: "Absence of actionable defamatory or tarnishing context.",
      supportingCitationIds: [],
      highestSourceTier: "NONE",
      status: "CONTRADICTED",
      isVerified: false,
      isReachableAndFresh: false,
      isIndependent: false,
      rejectionReason: "STRONG_CONFLICT",
      notes: "Context contains unverified criminal/moral turpitude allegations or active trademark disparagement.",
    });
  } else if (riskAnalysis.rewritePathSupported) {
    claims.push({
      claimCategory: "FICTIONAL_COMPOSITE",
      claimType: "CURRENT_STATUS",
      claimSummary: "Fictional composite or non-infringing mark rewrite path.",
      supportingCitationIds: [],
      highestSourceTier: "NONE",
      status: "UNVERIFIED",
      isVerified: false,
      isReachableAndFresh: false,
      isIndependent: false,
      rejectionReason: "REWRITE_PATH_SUPPORTED",
      notes: "Clearance path requires script dialogue or character name rewrite.",
    });
  } else if (riskAnalysis.licenceSignalSupported) {
    claims.push({
      claimCategory: "RIGHT_OF_PUBLICITY_CONSENT",
      claimType: "CURRENT_STATUS",
      claimSummary: "Commercial license or publicity waiver on file.",
      supportingCitationIds: [],
      highestSourceTier: "NONE",
      status: "UNVERIFIED",
      isVerified: false,
      isReachableAndFresh: false,
      isIndependent: false,
      rejectionReason: "LICENCE_SIGNAL_SUPPORTED",
      notes: "Requires signed commercial release or option chain of title.",
    });
  }

  const verifiedClaimsCount = claims.filter((c) => c.status === "VERIFIED").length;
  const unverifiedClaimsCount = claims.filter((c) => c.status === "UNVERIFIED").length;
  const contradictedClaimsCount = claims.filter((c) => c.status === "CONTRADICTED").length;
  const hasContradictions =
    contradictedClaimsCount > 0 || Boolean(input.unresolvedConflict);
  const hasSpecialCondition =
    riskAnalysis.severeContext ||
    riskAnalysis.strongConflict ||
    riskAnalysis.rewritePathSupported ||
    riskAnalysis.licenceSignalSupported;
  const matchWeak = riskAnalysis.matchQuality === "WEAK";

  let promotableToResearchCleared = false;
  let primaryReasonCode: (typeof ReasonCode)["_type"] | undefined;
  let evaluationNotes = "";

  if (input.providerFailed) {
    primaryReasonCode = "PROVIDER_FAILED";
    evaluationNotes = "Automated research provider failed during execution.";
  } else if (input.budgetLimited) {
    primaryReasonCode = "BUDGET_LIMIT";
    evaluationNotes = "Research cost exceeded allotted run budget limit.";
  } else if (hasContradictions) {
    primaryReasonCode = "EVIDENCE_CONFLICT";
    evaluationNotes = "Contradictory evidence detected; cannot verify clearance.";
  } else if (hasSpecialCondition) {
    if (riskAnalysis.severeContext && riskAnalysis.strongConflict) {
      primaryReasonCode = "STRONG_CONFLICT";
      evaluationNotes = "Severe legal risk context detected; professional review required.";
    } else if (riskAnalysis.rewritePathSupported) {
      primaryReasonCode = "REWRITE_PATH_SUPPORTED";
      evaluationNotes = "Requires script rewrite to eliminate exposure.";
    } else if (riskAnalysis.licenceSignalSupported) {
      primaryReasonCode = "LICENCE_SIGNAL_SUPPORTED";
      evaluationNotes = "Requires signed license or option agreement.";
    }
  } else if (matchWeak) {
    primaryReasonCode = "ENTITY_MATCH_WEAK";
    evaluationNotes = "Entity match quality too weak to substantiate legal claims.";
  } else if (citations.length === 0) {
    primaryReasonCode = "EVIDENCE_MISSING";
    evaluationNotes = "No citations provided to substantiate legal claims.";
  } else if (reachableCitations.length === 0) {
    primaryReasonCode = "CITATION_UNREACHABLE";
    evaluationNotes = "All cited evidence sources unreachable.";
  } else if (!hasHighTierAuthority) {
    primaryReasonCode =
      tier2Citations.length === 1
        ? "EVIDENCE_NOT_INDEPENDENT"
        : "SOURCE_TIER_INSUFFICIENT";
    evaluationNotes = "Evidence lacks required Tier 1 authority or independent Tier 2 corroboration.";
  } else if (verifiedClaimsCount > 0 && unverifiedClaimsCount === 0) {
    promotableToResearchCleared = true;
    evaluationNotes = "All required legal clearance claims verified by authoritative evidence.";
  } else {
    primaryReasonCode = "EVIDENCE_WEAK";
    evaluationNotes = "Incomplete evidence across required legal claims.";
  }

  return {
    claims,
    verifiedClaimsCount,
    unverifiedClaimsCount,
    contradictedClaimsCount,
    hasVerifiedTier1OrCorroboratedTier2: hasHighTierAuthority,
    hasContradictions,
    promotableToResearchCleared,
    primaryReasonCode,
    evaluationNotes,
  };
}
