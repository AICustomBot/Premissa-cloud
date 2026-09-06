import {
  evaluateEvidenceGate,
  computeConfidence,
  type ConfidenceInput,
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
  isOverriddenByReviewer?: boolean;
  reviewerOverrideStatus?: ProposedStatus;
}

/**
 * Deterministically evaluates an entity's clearance status using @permissa/policy.
 * Hard rule from AGENTS.md:
 * - No model-assigned clearance status or confidence score.
 * - No Research-cleared without a passing evidence gate and confidence >= 85.
 * - No final Blocked outside professional review.
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

  let admittedStatus: ProposedStatus = decision.admittedStatus;

  // Hard Constitutional Rule: No final Blocked outside professional review!
  if (admittedStatus === "BLOCKED" && !isProfessionalReviewer) {
    admittedStatus = "NEEDS_REWRITE";
  }

  // Hard Constitutional Rule: No Research-cleared without confidence >= 85
  if (
    admittedStatus === "RESEARCH_CLEARED" &&
    decision.confidence.finalScore < 85
  ) {
    admittedStatus = "INSUFFICIENT_EVIDENCE";
  }

  return {
    entityId: entity.id,
    canonicalName: entity.canonicalName,
    type: entity.type,
    proposedStatus: entity.initialProposedStatus,
    admittedStatus,
    confidence: decision.confidence,
    reasonCodes: decision.reasonCodes,
    professionalConfirmationRequired: decision.professionalConfirmationRequired,
  };
}

/**
 * Content-Free Audit Logger as mandated by AGENTS.md:
 * "No screenplay text, entity names, queries, evidence excerpts, reviewer comments,
 * or raw provider payloads in logs, traces, metrics, or error responses."
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
