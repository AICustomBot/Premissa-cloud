import { z } from "zod";
import { Versioned } from "./common";
import { EntityType } from "./enums";
import { EntityId, SceneId, ScriptVersionId } from "./ids";

export const EntityMention = z.object({
  sceneId: SceneId,
  sourceRange: z.object({ start: z.number().int(), end: z.number().int() }),
  contextExcerpt: z.string().max(600),
});

export const CanonicalEntity = Versioned.extend({
  id: EntityId,
  scriptVersionId: ScriptVersionId,
  type: EntityType,
  canonicalName: z.string().min(1).max(200),
  aliases: z.array(z.string().max(200)).max(20),
  mentions: z.array(EntityMention).min(1),
  confirmed: z.boolean(),
});

export const PatchEntityRequest = z.object({
  expectedVersion: z.number().int().nonnegative(),
  type: EntityType.optional(),
  canonicalName: z.string().min(1).max(200).optional(),
  aliases: z.array(z.string().max(200)).max(20).optional(),
});

export const MergeEntitiesRequest = z.object({
  survivorId: EntityId,
  mergedIds: z.array(EntityId).min(1).max(20),
  expectedVersions: z.record(EntityId, z.number().int().nonnegative()),
});

/** Producer confirmation is the gate that permits any live research. */
export const ConfirmEntitiesRequest = z.object({
  confirmedEntityIds: z.array(EntityId).min(1).max(50),
});
