import {
  computeConfidence,
  type ConfidenceInput,
  type ConfidenceOutput,
} from "./confidence";
import { CLEARED_MIN_CONFIDENCE, EVIDENCE_POLICY_VERSION } from "./versions";

export type ProposedStatus =
  | "RESEARCH_CLEARED"
  | "NEEDS_LICENCE"
  | "NEEDS_REWRITE"
  | "BLOCKED"
  | "INSUFFICIENT_EVIDENCE";

export type GateInput = {
  proposedStatus: ProposedStatus;
  confidence: ConfidenceInput;
  licenceSignalSupported: boolean;
  rewritePathSupported: boolean;
  strongConflict: boolean;
  severeContext: boolean;
};

export type GateDecision = {
  policyVersion: string;
  admittedStatus: ProposedStatus;
  professionalConfirmationRequired: boolean;
  confidence: ConfidenceOutput;
  reasonCodes: string[];
};

const INSUFFICIENT: ProposedStatus = "INSUFFICIENT_EVIDENCE";

/**
 * Deterministic admissibility. The model proposes; this function decides.
 * Downgrades are always safe: never upgrade a status here.
 */
export const evaluateEvidenceGate = (input: GateInput): GateDecision => {
  const confidence = computeConfidence(input.confidence);
  const reasonCodes: string[] = [
    ...confidence.invalidations,
    ...confidence.caps.map(() => "EVIDENCE_CONFLICT"),
  ];

  const blocked =
    confidence.invalidations.length > 0 || input.confidence.unresolvedConflict;

  if (blocked) {
    return {
      policyVersion: EVIDENCE_POLICY_VERSION,
      admittedStatus: INSUFFICIENT,
      professionalConfirmationRequired: false,
      confidence,
      reasonCodes: unique(reasonCodes),
    };
  }

  switch (input.proposedStatus) {
    case "RESEARCH_CLEARED": {
      const weakMatch = input.confidence.match === "WEAK";
      if (weakMatch) reasonCodes.push("ENTITY_MATCH_WEAK");
      if (confidence.finalScore < CLEARED_MIN_CONFIDENCE)
        reasonCodes.push("CONFIDENCE_BELOW_CLEARED_THRESHOLD");
      const admitted =
        !weakMatch && confidence.finalScore >= CLEARED_MIN_CONFIDENCE;
      return decision(
        admitted ? "RESEARCH_CLEARED" : INSUFFICIENT,
        false,
        confidence,
        reasonCodes,
      );
    }
    case "NEEDS_LICENCE": {
      if (!input.licenceSignalSupported) reasonCodes.push("EVIDENCE_WEAK");
      else reasonCodes.push("LICENCE_SIGNAL_SUPPORTED");
      return decision(
        input.licenceSignalSupported ? "NEEDS_LICENCE" : INSUFFICIENT,
        false,
        confidence,
        reasonCodes,
      );
    }
    case "NEEDS_REWRITE": {
      if (!input.rewritePathSupported) reasonCodes.push("EVIDENCE_WEAK");
      else reasonCodes.push("REWRITE_PATH_SUPPORTED");
      return decision(
        input.rewritePathSupported ? "NEEDS_REWRITE" : INSUFFICIENT,
        false,
        confidence,
        reasonCodes,
      );
    }
    case "BLOCKED": {
      const eligible = input.strongConflict && input.severeContext;
      if (eligible) {
        reasonCodes.push(
          "STRONG_CONFLICT",
          "SEVERE_CONTEXT",
          "PROFESSIONAL_CONFIRMATION_REQUIRED",
        );
      } else {
        reasonCodes.push("EVIDENCE_WEAK");
      }
      // Automation may only propose BLOCKED; a person confirms it.
      return decision(
        eligible ? "BLOCKED" : INSUFFICIENT,
        eligible,
        confidence,
        reasonCodes,
      );
    }
    default:
      return decision(INSUFFICIENT, false, confidence, reasonCodes);
  }
};

const decision = (
  admittedStatus: ProposedStatus,
  professionalConfirmationRequired: boolean,
  confidence: ConfidenceOutput,
  reasonCodes: string[],
): GateDecision => ({
  policyVersion: EVIDENCE_POLICY_VERSION,
  admittedStatus,
  professionalConfirmationRequired,
  confidence,
  reasonCodes: unique(reasonCodes),
});

const unique = (values: string[]): string[] => [...new Set(values)];
