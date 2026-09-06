import { z } from "zod";
import { IsoDateTime, Versioned } from "./common";
import { FindingStatus, Jurisdiction, ReasonCode, RunState } from "./enums";
import {
  EntityId,
  FindingId,
  IdempotencyKey,
  ProjectId,
  RunId,
  ScriptVersionId,
} from "./ids";
import { ConfidenceResult } from "./evidence";

export const CreateRunRequest = z.object({
  projectId: ProjectId,
  scriptVersionId: ScriptVersionId,
  jurisdiction: Jurisdiction,
  idempotencyKey: IdempotencyKey,
});

export const RunBudget = z.object({
  costCapUsd: z.number().positive(),
  estimatedCostUsd: z.number().nonnegative(),
  parallelCallCap: z.number().int().positive(),
  parallelCallsUsed: z.number().int().nonnegative(),
  entityCap: z.number().int().positive(),
});

export const RunCheckpoint = z.object({
  completedEntityIds: z.array(EntityId),
  pendingEntityIds: z.array(EntityId),
  lastCheckpointAt: IsoDateTime,
  attempt: z.number().int().positive(),
});

export const ClearanceRun = Versioned.extend({
  id: RunId,
  projectId: ProjectId,
  scriptVersionId: ScriptVersionId,
  state: RunState,
  jurisdiction: Jurisdiction,
  budget: RunBudget,
  checkpoint: RunCheckpoint.nullable(),
  startedAt: IsoDateTime.nullable(),
  endedAt: IsoDateTime.nullable(),
  deadlineAt: IsoDateTime,
});

export const Finding = Versioned.extend({
  id: FindingId,
  runId: RunId,
  entityId: EntityId,
  proposedStatus: FindingStatus,
  admittedStatus: FindingStatus,
  professionalConfirmationRequired: z.boolean(),
  confidence: ConfidenceResult,
  reasonCodes: z.array(ReasonCode),
  rationale: z.string().max(2000),
  rewriteSuggestion: z.string().max(600).nullable(),
});

export const ResumeRunRequest = z.object({
  expectedVersion: z.number().int().nonnegative(),
});

export const BudgetRequest = z.object({
  requestedCostCapUsd: z.number().positive().max(10),
  justification: z.string().min(10).max(1000),
});
