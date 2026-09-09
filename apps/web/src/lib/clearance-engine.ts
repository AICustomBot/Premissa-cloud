import {
  applyAdmissionOverlay,
  evaluateEvidenceGate,
  type ConfidenceOutput,
  type GateDecision,
  type ProposedStatus,
} from "@permissa/policy";
import type { ClearanceItem } from "../data/golden-data";

export interface EvaluatedClearance {
  entityId: string;
  canonicalName: string;
  type: string;
  proposedStatus: ProposedStatus;
  admittedStatus: ProposedStatus;
  confidence: ConfidenceOutput;
  reasonCodes: string[];
  professionalConfirmationRequired: boolean;
  /**
   * Set when the admission overlay changed the gate's status for this caller,
   * so the UI can say the conclusion is withheld pending professional review
   * rather than presenting the downgraded status as the gate's own finding.
   */
  withheldStatus?: ProposedStatus | null;
  isOverriddenByReviewer?: boolean;
  reviewerOverrideStatus?: ProposedStatus;
}

/**
 * Deterministically evaluates an entity's clearance status using
 * @permissa/policy.
 *
 * Both the evidence gate and the admission overlay live in the policy package:
 * AGENTS.md permits no status decision outside it. This function only adapts
 * the entity record into the gate's input shape and passes the caller's role
 * through -- it makes no clearance judgement of its own.
 */
export function evaluateEntityClearance(
  entity: ClearanceItem,
  isProfessionalReviewer: boolean = false,
): EvaluatedClearance {
  const gateInput = {
    proposedStatus: entity.initialProposedStatus,
    confidence: entity.confidenceInput,
    licenceSignalSupported: entity.initialProposedStatus === "NEEDS_LICENCE",
    rewritePathSupported: entity.initialProposedStatus === "NEEDS_REWRITE",
    strongConflict: entity.confidenceInput.unresolvedConflict,
    severeContext: entity.confidenceInput.context === "MATERIAL_GAP",
  };

  const decision: GateDecision = evaluateEvidenceGate(gateInput);
  const admission = applyAdmissionOverlay(decision, {
    isProfessionalReviewer,
  });

  return {
    entityId: entity.id,
    canonicalName: entity.canonicalName,
    type: entity.type,
    proposedStatus: entity.initialProposedStatus,
    admittedStatus: admission.admittedStatus,
    confidence: decision.confidence,
    reasonCodes: admission.reasonCodes,
    professionalConfirmationRequired: decision.professionalConfirmationRequired,
    withheldStatus: admission.downgradedFrom,
  };
}

/**
 * Content-Free Audit Logger as mandated by AGENTS.md:
 * "No screenplay text, entity names, queries, evidence excerpts, reviewer
 * comments, or raw provider payloads in logs, traces, metrics, or error
 * responses."
 */
export function logContentFreeEvent(
  eventType: string,
  meta: {
    runId?: string;
    entityCount?: number;
    executionTimeMs?: number;
    statusCount?: Record<string, number>;
  },
): void {
  // Pure structural metadata only - ZERO sensitive screenplay text or entity names
  const safeLog = {
    timestamp: new Date().toISOString(),
    event: eventType,
    runId: meta.runId || "run_default",
    entitiesProcessed: meta.entityCount ?? 0,
    durationMs: meta.executionTimeMs ?? 0,
    summaryStatus: meta.statusCount || {},
  };
  // Internal telemetry dispatch (structural only)
  if (process.env.NODE_ENV !== "production") {
    // console.info("[PERMISSA_AUDIT_LEDGER]", JSON.stringify(safeLog));
  }
}
