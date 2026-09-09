import { z } from "zod";
import { IsoDateTime, Versioned } from "./common.js";
import {
  DeltaChangeType,
  EntityType,
  FindingStatus,
  Jurisdiction,
  RunState,
  SourceType,
  UploadState,
} from "./enums.js";
import {
  EntityId,
  FindingId,
  IdempotencyKey,
  ProjectId,
  RunId,
  SceneId,
  ScriptVersionId,
} from "./ids.js";

export const CreateUploadRequest = z.object({
  projectId: ProjectId.optional(),
  sourceType: SourceType,
  declaredBytes: z.number().int().positive().max(20_000_000),
  declaredPageCount: z.number().int().positive().max(20).optional(),
});

export const CreateUploadResponse = z.object({
  uploadId: z.string(),
  signedUrl: z.string().url(),
  objectKey: z.string(),
  expiresAt: IsoDateTime,
  maxBytes: z.number().int().positive(),
});

export const CompleteUploadRequest = z.object({
  checksumSha256: z.string().length(64),
});

export const CompleteUploadResponse = z.object({
  uploadId: z.string(),
  state: UploadState,
});

export const Scene = z.object({
  id: SceneId,
  scriptVersionId: ScriptVersionId,
  ordinal: z.number().int().positive(),
  heading: z.string(),
  sourceRange: z.object({ start: z.number().int(), end: z.number().int() }),
});

export type Scene = z.infer<typeof Scene>;

export const ScriptVersion = Versioned.extend({
  id: ScriptVersionId,
  projectId: ProjectId,
  sourceType: SourceType,
  checksumSha256: z.string().length(64),
  pageCount: z.number().int().positive().max(20),
  versionNumber: z.number().int().positive(),
  sceneCount: z.number().int().nonnegative(),
  rawText: z.string().optional(),
});

export type ScriptVersion = z.infer<typeof ScriptVersion>;

export const SceneDiff = z.object({
  sceneNumber: z.string().optional(),
  heading: z.string(),
  changeType: DeltaChangeType,
  baseSceneId: SceneId.nullable().optional(),
  targetSceneId: SceneId.nullable().optional(),
  addedLinesCount: z.number().int().nonnegative().default(0),
  removedLinesCount: z.number().int().nonnegative().default(0),
  modifiedLinesCount: z.number().int().nonnegative().default(0).optional(),
  diffDetails: z.string().max(1000).optional(),
});
export type SceneDiff = z.infer<typeof SceneDiff>;

export const EntityDelta = z.object({
  entityId: EntityId,
  canonicalName: z.string(),
  type: EntityType,
  changeType: DeltaChangeType,
  baseEntityId: EntityId.nullable().optional(),
  targetEntityId: EntityId.nullable().optional(),
  previousFindingId: FindingId.nullable().optional(),
  previousStatus: FindingStatus.nullable().optional(),
  requiresResearch: z.boolean(),
  carryForwardAllowed: z.boolean(),
  diffDetails: z.string().max(1000).optional(),
});
export type EntityDelta = z.infer<typeof EntityDelta>;

export const ScriptDeltaSummary = z.object({
  totalBaseEntities: z.number().int().nonnegative(),
  totalTargetEntities: z.number().int().nonnegative(),
  addedEntitiesCount: z.number().int().nonnegative(),
  modifiedEntitiesCount: z.number().int().nonnegative(),
  deletedEntitiesCount: z.number().int().nonnegative(),
  untouchedEntitiesCount: z.number().int().nonnegative(),
  carriedForwardFindingsCount: z.number().int().nonnegative(),
  researchRequiredCount: z.number().int().nonnegative(),
  estimatedCostSavingsUsd: z.number().nonnegative(),
});
export type ScriptDeltaSummary = z.infer<typeof ScriptDeltaSummary>;

export const ScriptDelta = z.object({
  id: z.string(),
  projectId: ProjectId,
  baseScriptVersionId: ScriptVersionId,
  targetScriptVersionId: ScriptVersionId,
  baseChecksumSha256: z.string().length(64),
  targetChecksumSha256: z.string().length(64),
  sceneDiffs: z.array(SceneDiff),
  entityDeltas: z.array(EntityDelta),
  summary: ScriptDeltaSummary,
  computedAt: IsoDateTime,
});
export type ScriptDelta = z.infer<typeof ScriptDelta>;

export const CompareScriptVersionsRequest = z.object({
  baseScriptVersionId: ScriptVersionId,
  targetScriptVersionId: ScriptVersionId,
});
export type CompareScriptVersionsRequest = z.infer<
  typeof CompareScriptVersionsRequest
>;

export const DifferentialClearanceRunRequest = z.object({
  projectId: ProjectId,
  targetScriptVersionId: ScriptVersionId,
  baseScriptVersionId: ScriptVersionId.optional(),
  baseRunId: RunId.optional(),
  jurisdiction: Jurisdiction.default("US"),
  autoCarryForward: z.boolean().default(true),
  idempotencyKey: IdempotencyKey.optional(),
});
export type DifferentialClearanceRunRequest = z.infer<
  typeof DifferentialClearanceRunRequest
>;

export const DifferentialClearanceRunResult = z.object({
  runId: RunId,
  projectId: ProjectId,
  baseScriptVersionId: ScriptVersionId.nullable(),
  targetScriptVersionId: ScriptVersionId,
  deltaSummary: ScriptDeltaSummary,
  carriedForwardFindingIds: z.array(FindingId),
  dispatchedEntityIds: z.array(EntityId),
  totalEntitiesInScope: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  costSavedUsd: z.number().nonnegative(),
  startedAt: IsoDateTime,
  status: RunState,
});
export type DifferentialClearanceRunResult = z.infer<
  typeof DifferentialClearanceRunResult
>;

export const ScriptDraftHistoryItem = z.object({
  scriptVersionId: ScriptVersionId,
  versionNumber: z.number().int().positive(),
  checksumSha256: z.string().length(64),
  pageCount: z.number().int().positive(),
  sceneCount: z.number().int().nonnegative(),
  sourceType: SourceType,
  createdAt: IsoDateTime,
  entitiesCount: z.number().int().nonnegative(),
  runsCount: z.number().int().nonnegative(),
  latestRunState: RunState.nullable().optional(),
  clearanceReportId: z.string().nullable().optional(),
  certificateSealSha256: z.string().nullable().optional(),
});
export type ScriptDraftHistoryItem = z.infer<typeof ScriptDraftHistoryItem>;

export const ScriptDraftHistoryResponse = z.object({
  projectId: ProjectId,
  history: z.array(ScriptDraftHistoryItem),
});
export type ScriptDraftHistoryResponse = z.infer<
  typeof ScriptDraftHistoryResponse
>;
