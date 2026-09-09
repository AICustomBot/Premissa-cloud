import type { GateDecision, ProposedStatus } from "./evidence-gate.js";
import { CLEARED_MIN_CONFIDENCE } from "./versions.js";

/**
 * Admission overlay: the last two status rules before a status is shown.
 *
 * These were previously implemented inside the web client
 * (apps/web/src/lib/clearance-engine.ts), which meant the cleared-confidence
 * threshold existed twice -- once here in the policy package and once in a
 * browser bundle that could drift from it. AGENTS.md allows no status decision
 * outside packages/policy, so they live here and the client consumes the
 * result.
 *
 * The overlay is deliberately separate from evaluateEvidenceGate: the gate
 * decides what the evidence supports, whereas the overlay decides what the
 * current caller may be shown. The same evidence yields a different admitted
 * status for a producer and for a professional reviewer, and that difference
 * is an authorisation concern rather than an evidentiary one.
 */
export type AdmissionContext = {
  /** True only for a caller acting in the professional reviewer role. */
  isProfessionalReviewer: boolean;
};

export type AdmissionResult = {
  /** The status that may be displayed to this caller. */
  admittedStatus: ProposedStatus;
  /** Gate reason codes plus any code the overlay itself contributed. */
  reasonCodes: string[];
  /**
   * The gate's status when the overlay changed it, else null. Callers should
   * render this as "withheld pending review" rather than silently showing the
   * downgraded status as if it were the gate's own conclusion.
   */
  downgradedFrom: ProposedStatus | null;
};

export const applyAdmissionOverlay = (
  decision: GateDecision,
  context: AdmissionContext,
): AdmissionResult => {
  const reasonCodes = [...decision.reasonCodes];
  let admittedStatus: ProposedStatus = decision.admittedStatus;
  let downgradedFrom: ProposedStatus | null = null;

  // No final BLOCKED outside professional review. A producer sees the
  // remediation path instead of a conclusion only counsel may reach.
  if (admittedStatus === "BLOCKED" && !context.isProfessionalReviewer) {
    downgradedFrom = admittedStatus;
    admittedStatus = "NEEDS_REWRITE";
    reasonCodes.push("PROFESSIONAL_CONFIRMATION_REQUIRED");
  }

  // No RESEARCH_CLEARED below the cleared-confidence threshold. The gate
  // already enforces this for a RESEARCH_CLEARED proposal; this is the
  // backstop for any future path that admits the status by another route.
  if (
    admittedStatus === "RESEARCH_CLEARED" &&
    decision.confidence.finalScore < CLEARED_MIN_CONFIDENCE
  ) {
    downgradedFrom = admittedStatus;
    admittedStatus = "INSUFFICIENT_EVIDENCE";
    reasonCodes.push("CONFIDENCE_BELOW_CLEARED_THRESHOLD");
  }

  return {
    admittedStatus,
    reasonCodes: [...new Set(reasonCodes)],
    downgradedFrom,
  };
};
