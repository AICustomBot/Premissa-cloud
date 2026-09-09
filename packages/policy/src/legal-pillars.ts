import { EntityType } from "@permissa/contracts";
import type { MatchQuality, ContextQuality } from "./confidence.js";

export type LegalPillarType =
  | "DEFAMATION_FALSE_LIGHT"
  | "TRADEMARK_DILUTION_CONFUSION"
  | "RIGHT_OF_PUBLICITY"
  | "COPYRIGHT_LITERARY_OPTION";

export interface LegalRiskAnalysis {
  pillar: LegalPillarType;
  severeContext: boolean;
  strongConflict: boolean;
  licenceSignalSupported: boolean;
  rewritePathSupported: boolean;
  matchQuality: MatchQuality;
  contextQuality: ContextQuality;
  rationale: string;
  rewriteSuggestion: string | null;
  licenceSignal: string | null;
}

export interface EntityRiskInput {
  entityType: typeof EntityType._type;
  canonicalName: string;
  isLivingPerson?: boolean;
  isDeceasedHistorical?: boolean;
  isRegisteredTrademark?: boolean;
  isRegisteredCopyrightWork?: boolean;
  hasDefamatoryAllegations?: boolean;
  hasTarnishingPortrayal?: boolean;
  hasCommercialExploitation?: boolean;
  hasOptionAgreementRequired?: boolean;
  isNominativeFairUse?: boolean;
  sceneContexts?: string[];
}

export function evaluateLegalRisk(input: EntityRiskInput): LegalRiskAnalysis {
  switch (input.entityType) {
    case "PERSON_CHARACTER":
      return evaluatePersonRisk(input);
    case "BRAND_BUSINESS_PRODUCT":
      return evaluateBrandRisk(input);
    case "PRODUCTION_TITLE":
      return evaluateTitleRisk(input);
    default:
      return evaluatePersonRisk(input);
  }
}

function evaluatePersonRisk(input: EntityRiskInput): LegalRiskAnalysis {
  if (input.isDeceasedHistorical) {
    return {
      pillar: "DEFAMATION_FALSE_LIGHT",
      severeContext: false,
      strongConflict: false,
      licenceSignalSupported: false,
      rewritePathSupported: false,
      matchQuality: "EXACT_CORROBORATED",
      contextQuality: "COMPLETE",
      rationale:
        "Historical figure verified as deceased. Under established jurisdiction doctrine, defamation and false light causes of action extinguish at death.",
      rewriteSuggestion: null,
      licenceSignal: null,
    };
  }

  if (input.hasCommercialExploitation) {
    return {
      pillar: "RIGHT_OF_PUBLICITY",
      severeContext: false,
      strongConflict: true,
      licenceSignalSupported: true,
      rewritePathSupported: true,
      matchQuality: "STRONG",
      contextQuality: "COMPLETE",
      rationale:
        "Commercial exploitation or endorsement tie-in identified involving living persona without documented publicity consent.",
      rewriteSuggestion:
        "Replace identifying personal attributes with fictional composite character to remove publicity claim exposure.",
      licenceSignal:
        "Obtain signed personal appearance release and Right of Publicity waiver from individual or authorized representative.",
    };
  }

  if (input.hasDefamatoryAllegations) {
    return {
      pillar: "DEFAMATION_FALSE_LIGHT",
      severeContext: true,
      strongConflict: true,
      licenceSignalSupported: false,
      rewritePathSupported: true,
      matchQuality: "STRONG",
      contextQuality: "COMPLETE",
      rationale:
        "Living person portrayed in connection with unverified criminal acts, fraud, or professional misconduct creating severe defamation and false light liability.",
      rewriteSuggestion:
        "Alter character surname, profession, and distinctive biographical identifiers to establish fictionalized composite status.",
      licenceSignal: null,
    };
  }

  return {
    pillar: "DEFAMATION_FALSE_LIGHT",
    severeContext: false,
    strongConflict: false,
    licenceSignalSupported: false,
    rewritePathSupported: false,
    matchQuality: "EXACT_CORROBORATED",
    contextQuality: "COMPLETE",
    rationale:
      "Portrayal evaluated as non-defamatory with no false light or commercial exploitation exposure detected under jurisdiction standards.",
    rewriteSuggestion: null,
    licenceSignal: null,
  };
}

function evaluateBrandRisk(input: EntityRiskInput): LegalRiskAnalysis {
  if (input.hasTarnishingPortrayal) {
    return {
      pillar: "TRADEMARK_DILUTION_CONFUSION",
      severeContext: true,
      strongConflict: true,
      licenceSignalSupported: true,
      rewritePathSupported: true,
      matchQuality: "EXACT_CORROBORATED",
      contextQuality: "COMPLETE",
      rationale:
        "Protected trademark portrayed in defective, hazardous, or derogatory context creating actionable trademark tarnishment and product disparagement exposure.",
      rewriteSuggestion:
        "Substitute registered brand with fictitious brand name or utilize generic unmarked prop.",
      licenceSignal:
        "Obtain express written commercial depiction clearance and brand integration agreement from mark owner.",
    };
  }

  if (
    input.hasCommercialExploitation ||
    (!input.isNominativeFairUse && input.isRegisteredTrademark)
  ) {
    return {
      pillar: "TRADEMARK_DILUTION_CONFUSION",
      severeContext: false,
      strongConflict: false,
      licenceSignalSupported: true,
      rewritePathSupported: true,
      matchQuality: "EXACT_CORROBORATED",
      contextQuality: "COMPLETE",
      rationale:
        "Commercial mark used prominently beyond incidental nominative dialogue. Requires licensing verification to prevent commercial confusion.",
      rewriteSuggestion:
        "Adjust dialogue to generic product terminology or conceal logo in physical prop staging.",
      licenceSignal:
        "Execute standard product placement and trademark clearance release with corporate rights holder.",
    };
  }

  return {
    pillar: "TRADEMARK_DILUTION_CONFUSION",
    severeContext: false,
    strongConflict: false,
    licenceSignalSupported: false,
    rewritePathSupported: false,
    matchQuality: "EXACT_CORROBORATED",
    contextQuality: "COMPLETE",
    rationale:
      "Incidental, truthful reference adhering to established nominative fair use doctrine with no commercial confusion or dilution risks.",
    rewriteSuggestion: null,
    licenceSignal: null,
  };
}

function evaluateTitleRisk(input: EntityRiskInput): LegalRiskAnalysis {
  if (input.hasOptionAgreementRequired || input.isRegisteredCopyrightWork) {
    return {
      pillar: "COPYRIGHT_LITERARY_OPTION",
      severeContext: false,
      strongConflict: false,
      licenceSignalSupported: true,
      rewritePathSupported: true,
      matchQuality: "EXACT_CORROBORATED",
      contextQuality: "COMPLETE",
      rationale:
        "Title or dramatic work corresponds to registered audiovisual copyright record. Verification of literary option and chain of title required.",
      rewriteSuggestion:
        "Select distinct original production title to eliminate potential unfair competition and market confusion.",
      licenceSignal:
        "Verify underlying literary option agreement, chain of title, and copyright assignment documentation.",
    };
  }

  return {
    pillar: "COPYRIGHT_LITERARY_OPTION",
    severeContext: false,
    strongConflict: false,
    licenceSignalSupported: false,
    rewritePathSupported: false,
    matchQuality: "EXACT_CORROBORATED",
    contextQuality: "COMPLETE",
    rationale:
      "Title verified as generic phrase or public domain work with no active proprietary copyright encumbrances.",
    rewriteSuggestion: null,
    licenceSignal: null,
  };
}
