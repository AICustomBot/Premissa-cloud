import { CanonicalEntity, Finding, generateUuidV7 } from "@permissa/contracts";

export type DeltaChangeType = "ADDED" | "MODIFIED" | "DELETED" | "UNTOUCHED";
export type LineDiffType = "ADDED" | "MODIFIED" | "REMOVED" | "UNTOUCHED";

export interface LineDiffItem {
  lineIndex: number;
  type: LineDiffType;
  text: string;
  oldText?: string | undefined;
  speaker?: string | undefined;
  oldSpeaker?: string | undefined;
}

export interface DetailedSceneDiff {
  sceneNumber: string;
  heading: string;
  changeType: DeltaChangeType;
  baseSceneId?: string | null | undefined;
  targetSceneId?: string | null | undefined;
  addedLinesCount: number;
  removedLinesCount: number;
  modifiedLinesCount: number;
  lineDiffs: LineDiffItem[];
  excerpt?: string | undefined;
}

export interface DetailedEntityDelta {
  entityId: string;
  canonicalName: string;
  type: string;
  changeType: DeltaChangeType;
  baseEntityId?: string | null | undefined;
  targetEntityId?: string | null | undefined;
  previousFindingId?: string | null | undefined;
  previousStatus?: string | null | undefined;
  confidenceScore: number;
  requiresResearch: boolean;
  carryForwardAllowed: boolean;
  diffDetails: string;
}

export interface ScreenplaySceneInput {
  sceneNumber?: string | undefined;
  heading: string;
  lines: Array<{ speaker?: string | undefined; text: string }>;
}

export interface ScriptRevisionInput {
  id: string;
  versionNumber: number;
  rawText?: string | undefined;
  scenes?: ScreenplaySceneInput[] | undefined;
  entities: CanonicalEntity[];
  priorFindings?: Finding[] | undefined;
}

export interface ScriptComparisonSummary {
  totalBaseEntities: number;
  totalTargetEntities: number;
  addedEntitiesCount: number;
  modifiedEntitiesCount: number;
  deletedEntitiesCount: number;
  untouchedEntitiesCount: number;
  carriedForwardFindingsCount: number;
  researchRequiredCount: number;
  estimatedCostSavingsUsd: number;
}

export interface ScriptComparisonResult {
  id: string;
  baseScriptId: string;
  targetScriptId: string;
  baseVersionNumber: number;
  targetVersionNumber: number;
  sceneDiffs: DetailedSceneDiff[];
  entityDeltas: DetailedEntityDelta[];
  summary: ScriptComparisonSummary;
  computedAt: string;
}

/**
 * Deterministic Screenplay Revision Comparison Engine.
 * Detects modified lines within matching scenes and identifies newly introduced,
 * modified, deleted, and untouched entities across revisions.
 */
export function compareScriptRevisions(
  base: ScriptRevisionInput,
  target: ScriptRevisionInput,
): ScriptComparisonResult {
  // 1. Extract Parsed Scenes
  const baseScenes =
    base.scenes ?? parseScreenplayScenesFromText(base.rawText ?? "");
  const targetScenes =
    target.scenes ?? parseScreenplayScenesFromText(target.rawText ?? "");

  // 2. Compute Scene and Line Diffs
  const sceneDiffs = computeDetailedSceneDiffs(baseScenes, targetScenes);

  // Map of which scenes were modified or added
  const modifiedSceneHeadings = new Set<string>();
  const addedSceneHeadings = new Set<string>();

  for (const sd of sceneDiffs) {
    const norm = normalizeHeading(sd.heading);
    if (sd.changeType === "MODIFIED") {
      modifiedSceneHeadings.add(norm);
    } else if (sd.changeType === "ADDED") {
      addedSceneHeadings.add(norm);
    }
  }

  // 3. Entity Dictionaries & Finding Lookup
  const baseFindingByEntityId = new Map<string, Finding>(
    (base.priorFindings ?? []).map((f) => [f.entityId, f]),
  );

  const matchedBaseEntityIds = new Set<string>();
  const entityDeltas: DetailedEntityDelta[] = [];

  let addedCount = 0;
  let modifiedCount = 0;
  let untouchedCount = 0;
  let carriedForwardCount = 0;
  let researchRequiredCount = 0;

  for (const targetEnt of target.entities) {
    // Match base entity by canonical name or alias (case-insensitive)
    const matchingBase = findMatchingEntity(targetEnt, base.entities);

    if (!matchingBase) {
      // ADDED Entity: newly introduced in target revision
      addedCount++;
      researchRequiredCount++;
      entityDeltas.push({
        entityId: targetEnt.id,
        canonicalName: targetEnt.canonicalName,
        type: targetEnt.type,
        changeType: "ADDED",
        baseEntityId: null,
        targetEntityId: targetEnt.id,
        previousFindingId: null,
        previousStatus: null,
        confidenceScore: 0,
        requiresResearch: true,
        carryForwardAllowed: false,
        diffDetails: `New entity introduced in Script v${target.versionNumber}`,
      });
    } else {
      matchedBaseEntityIds.add(matchingBase.id);

      const priorFinding = baseFindingByEntityId.get(matchingBase.id);
      const priorScore = priorFinding?.confidence.finalScore ?? 0;
      const priorStatus = priorFinding?.admittedStatus ?? null;

      // Check if entity mentions or contexts were modified
      const entityModified = isEntityModified(
        matchingBase,
        targetEnt,
        modifiedSceneHeadings,
        addedSceneHeadings,
      );

      if (entityModified) {
        modifiedCount++;
        researchRequiredCount++;
        entityDeltas.push({
          entityId: targetEnt.id,
          canonicalName: targetEnt.canonicalName,
          type: targetEnt.type,
          changeType: "MODIFIED",
          baseEntityId: matchingBase.id,
          targetEntityId: targetEnt.id,
          previousFindingId: priorFinding?.id ?? null,
          previousStatus: priorStatus,
          confidenceScore: priorScore,
          requiresResearch: true,
          carryForwardAllowed: false,
          diffDetails:
            "Entity context, scene occurrences, or dialogue modified between revisions",
        });
      } else {
        untouchedCount++;
        // Check carry-forward eligibility: prior finding must exist, status not insufficient, and confidence >= 85
        const canCarryForward =
          priorFinding !== undefined &&
          priorFinding.admittedStatus !== "INSUFFICIENT_EVIDENCE" &&
          priorScore >= 85;

        if (canCarryForward) {
          carriedForwardCount++;
        } else {
          researchRequiredCount++;
        }

        entityDeltas.push({
          entityId: targetEnt.id,
          canonicalName: targetEnt.canonicalName,
          type: targetEnt.type,
          changeType: "UNTOUCHED",
          baseEntityId: matchingBase.id,
          targetEntityId: targetEnt.id,
          previousFindingId: priorFinding?.id ?? null,
          previousStatus: priorStatus,
          confidenceScore: priorScore,
          requiresResearch: !canCarryForward,
          carryForwardAllowed: canCarryForward,
          diffDetails: canCarryForward
            ? "Unmodified entity with valid prior clearance finding carried forward"
            : "Unmodified entity requires fresh research due to incomplete prior evidence",
        });
      }
    }
  }

  // Check for DELETED entities (in base but omitted from target)
  let deletedCount = 0;
  for (const baseEnt of base.entities) {
    if (!matchedBaseEntityIds.has(baseEnt.id)) {
      deletedCount++;
      const priorFinding = baseFindingByEntityId.get(baseEnt.id);
      entityDeltas.push({
        entityId: baseEnt.id,
        canonicalName: baseEnt.canonicalName,
        type: baseEnt.type,
        changeType: "DELETED",
        baseEntityId: baseEnt.id,
        targetEntityId: null,
        previousFindingId: priorFinding?.id ?? null,
        previousStatus: priorFinding?.admittedStatus ?? null,
        confidenceScore: priorFinding?.confidence.finalScore ?? 0,
        requiresResearch: false,
        carryForwardAllowed: false,
        diffDetails: `Entity omitted from Script v${target.versionNumber}`,
      });
    }
  }

  const estimatedCostSavingsUsd = Number(
    (carriedForwardCount * 0.75).toFixed(2),
  );

  return {
    id: generateUuidV7(),
    baseScriptId: base.id,
    targetScriptId: target.id,
    baseVersionNumber: base.versionNumber,
    targetVersionNumber: target.versionNumber,
    sceneDiffs,
    entityDeltas,
    summary: {
      totalBaseEntities: base.entities.length,
      totalTargetEntities: target.entities.length,
      addedEntitiesCount: addedCount,
      modifiedEntitiesCount: modifiedCount,
      deletedEntitiesCount: deletedCount,
      untouchedEntitiesCount: untouchedCount,
      carriedForwardFindingsCount: carriedForwardCount,
      researchRequiredCount,
      estimatedCostSavingsUsd,
    },
    computedAt: new Date().toISOString(),
  };
}

/**
 * Computes line-by-line scene diffs between base and target scenes.
 */
function computeDetailedSceneDiffs(
  baseScenes: ScreenplaySceneInput[],
  targetScenes: ScreenplaySceneInput[],
): DetailedSceneDiff[] {
  const diffs: DetailedSceneDiff[] = [];
  const baseSceneMap = new Map<string, (typeof baseScenes)[0]>();

  for (const bs of baseScenes) {
    baseSceneMap.set(normalizeHeading(bs.heading), bs);
  }

  const targetHeadingSet = new Set<string>();

  for (let idx = 0; idx < targetScenes.length; idx++) {
    const ts = targetScenes[idx]!;
    const norm = normalizeHeading(ts.heading);
    targetHeadingSet.add(norm);

    const bs = baseSceneMap.get(norm);

    if (!bs) {
      // ADDED Scene
      const lineDiffs: LineDiffItem[] = ts.lines.map((line, lIdx) => ({
        lineIndex: lIdx + 1,
        type: "ADDED",
        text: line.text,
        speaker: line.speaker,
      }));

      diffs.push({
        sceneNumber: ts.sceneNumber ?? `${idx + 1}`,
        heading: ts.heading,
        changeType: "ADDED",
        addedLinesCount: ts.lines.length,
        removedLinesCount: 0,
        modifiedLinesCount: 0,
        lineDiffs,
        excerpt:
          ts.lines.length > 0 ? ts.lines[0]?.text.slice(0, 120) : "New scene",
      });
    } else {
      // Compare Lines between matching scenes
      const lineDiffs = compareSceneLines(bs.lines, ts.lines);

      const addedLinesCount = lineDiffs.filter(
        (l) => l.type === "ADDED",
      ).length;
      const removedLinesCount = lineDiffs.filter(
        (l) => l.type === "REMOVED",
      ).length;
      const modifiedLinesCount = lineDiffs.filter(
        (l) => l.type === "MODIFIED",
      ).length;

      const isModified =
        addedLinesCount > 0 || removedLinesCount > 0 || modifiedLinesCount > 0;

      const firstChange = lineDiffs.find((l) => l.type !== "UNTOUCHED");

      diffs.push({
        sceneNumber: ts.sceneNumber ?? `${idx + 1}`,
        heading: ts.heading,
        changeType: isModified ? "MODIFIED" : "UNTOUCHED",
        addedLinesCount,
        removedLinesCount,
        modifiedLinesCount,
        lineDiffs,
        excerpt: firstChange
          ? firstChange.text.slice(0, 120)
          : ts.lines[0]?.text.slice(0, 120),
      });
    }
  }

  // Check for DELETED scenes (present in base but omitted from target)
  for (let idx = 0; idx < baseScenes.length; idx++) {
    const bs = baseScenes[idx]!;
    const norm = normalizeHeading(bs.heading);

    if (!targetHeadingSet.has(norm)) {
      const lineDiffs: LineDiffItem[] = bs.lines.map((line, lIdx) => ({
        lineIndex: lIdx + 1,
        type: "REMOVED",
        text: line.text,
        speaker: line.speaker,
      }));

      diffs.push({
        sceneNumber: bs.sceneNumber ?? `${idx + 1}`,
        heading: bs.heading,
        changeType: "DELETED",
        addedLinesCount: 0,
        removedLinesCount: bs.lines.length,
        modifiedLinesCount: 0,
        lineDiffs,
        excerpt: "[Scene removed in revision]",
      });
    }
  }

  return diffs;
}

/**
 * Line-by-line comparison between base and target lines.
 */
function compareSceneLines(
  baseLines: Array<{ speaker?: string | undefined; text: string }>,
  targetLines: Array<{ speaker?: string | undefined; text: string }>,
): LineDiffItem[] {
  const lineDiffs: LineDiffItem[] = [];
  const maxLines = Math.max(baseLines.length, targetLines.length);

  for (let i = 0; i < maxLines; i++) {
    const bLine = baseLines[i];
    const tLine = targetLines[i];

    if (bLine && tLine) {
      const textMatches =
        bLine.text.trim().toLowerCase() === tLine.text.trim().toLowerCase();
      const speakerMatches =
        (bLine.speaker?.trim().toLowerCase() ?? "") ===
        (tLine.speaker?.trim().toLowerCase() ?? "");

      if (textMatches && speakerMatches) {
        lineDiffs.push({
          lineIndex: i + 1,
          type: "UNTOUCHED",
          text: tLine.text,
          speaker: tLine.speaker,
        });
      } else {
        lineDiffs.push({
          lineIndex: i + 1,
          type: "MODIFIED",
          text: tLine.text,
          oldText: bLine.text,
          speaker: tLine.speaker,
          oldSpeaker: bLine.speaker,
        });
      }
    } else if (tLine) {
      lineDiffs.push({
        lineIndex: i + 1,
        type: "ADDED",
        text: tLine.text,
        speaker: tLine.speaker,
      });
    } else if (bLine) {
      lineDiffs.push({
        lineIndex: i + 1,
        type: "REMOVED",
        text: bLine.text,
        speaker: bLine.speaker,
      });
    }
  }

  return lineDiffs;
}

function findMatchingEntity(
  targetEnt: CanonicalEntity,
  baseEntities: CanonicalEntity[],
): CanonicalEntity | undefined {
  const targetNorm = targetEnt.canonicalName.trim().toLowerCase();
  const targetAliases = targetEnt.aliases.map((a) => a.trim().toLowerCase());

  return baseEntities.find((be) => {
    const baseNorm = be.canonicalName.trim().toLowerCase();
    const baseAliases = be.aliases.map((a) => a.trim().toLowerCase());

    return (
      baseNorm === targetNorm ||
      baseAliases.includes(targetNorm) ||
      targetAliases.includes(baseNorm)
    );
  });
}

function isEntityModified(
  baseEntity: CanonicalEntity,
  targetEntity: CanonicalEntity,
  modifiedSceneHeadings: Set<string>,
  addedSceneHeadings: Set<string>,
): boolean {
  // If entity type changed
  if (baseEntity.type !== targetEntity.type) return true;

  // If number of mentions changed
  if (baseEntity.mentions.length !== targetEntity.mentions.length) return true;

  // Check if any mention context changed
  for (let i = 0; i < baseEntity.mentions.length; i++) {
    const bm = baseEntity.mentions[i]!;
    const tm = targetEntity.mentions[i]!;

    if (
      bm.contextExcerpt !== tm.contextExcerpt ||
      bm.sourceRange?.start !== tm.sourceRange?.start ||
      bm.sourceRange?.end !== tm.sourceRange?.end
    ) {
      return true;
    }
  }

  return false;
}

function normalizeHeading(heading: string): string {
  return heading
    .toUpperCase()
    .replace(/^SCENE\s+\d+[:\s-]*/i, "")
    .replace(/^(EXT\.|INT\.|INT\.\/EXT\.|I\/E\.)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fallback parser to extract scene headings and lines from raw screenplay text.
 */
export function parseScreenplayScenesFromText(
  rawText: string,
): ScreenplaySceneInput[] {
  if (!rawText || rawText.trim().length === 0) return [];

  const rawLines = rawText.split(/\r?\n/);
  const scenes: ScreenplaySceneInput[] = [];

  let currentScene: ScreenplaySceneInput | null = null;
  const sluglineRegex =
    /^(?:EXT\.|INT\.|INT\.\/EXT\.|I\/E\.|EST\.|SCENE)\s+(.+)$/i;
  const characterRegex = /^[A-Z0-9\s._'-]{2,30}$/;

  let pendingSpeaker: string | undefined;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      pendingSpeaker = undefined;
      continue;
    }

    if (sluglineRegex.test(trimmed)) {
      if (currentScene) scenes.push(currentScene);
      currentScene = {
        sceneNumber: `${scenes.length + 1}`,
        heading: trimmed.toUpperCase(),
        lines: [],
      };
      pendingSpeaker = undefined;
    } else if (currentScene) {
      if (characterRegex.test(trimmed) && !trimmed.endsWith(".")) {
        pendingSpeaker = trimmed;
      } else {
        currentScene.lines.push({
          speaker: pendingSpeaker,
          text: trimmed,
        });
        pendingSpeaker = undefined;
      }
    }
  }

  if (currentScene) {
    scenes.push(currentScene);
  }

  return scenes;
}
