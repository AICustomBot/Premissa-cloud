import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from "@nestjs/common";
import {
  AuditLogEntry,
  CanonicalEntity,
  ClearanceReport,
  ClearanceRun,
  CompareScriptVersionsRequest,
  DifferentialClearanceRunRequest,
  DifferentialClearanceRunResult,
  EntityDelta,
  Finding,
  generateUuidV7,
  Project,
  Role,
  SceneDiff,
  ScriptDelta,
  ScriptDraftHistoryItem,
  ScriptDraftHistoryResponse,
  ScriptVersion,
} from "@permissa/contracts";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ResearchService } from "../research/research.service.js";
import { FirestoreService } from "../storage/firestore.service.js";

@Injectable()
export class DifferentialService {
  private readonly logger = new Logger(DifferentialService.name);

  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly projectsService: ProjectsService,
    private readonly researchService: ResearchService,
  ) {}

  /**
   * 1. Script Delta Comparison:
   * Compares a newly uploaded script draft with a prior version.
   * Performs scene and line diffing and classifies entities as ADDED, MODIFIED, DELETED, or UNTOUCHED.
   */
  async compareScriptVersions(
    user: AuthenticatedUser,
    projectId: string,
    req: CompareScriptVersionsRequest,
  ): Promise<ScriptDelta> {
    const validatedReq = CompareScriptVersionsRequest.parse(req);

    const project = await this.projectsService.getProject(user, projectId);
    await this.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);

    const baseScript = await this.firestoreService.getScriptVersion(
      projectId,
      validatedReq.baseScriptVersionId,
    );
    if (!baseScript) {
      throw new NotFoundException(
        `Base script version [${validatedReq.baseScriptVersionId}] not found`,
      );
    }

    const targetScript = await this.firestoreService.getScriptVersion(
      projectId,
      validatedReq.targetScriptVersionId,
    );
    if (!targetScript) {
      throw new NotFoundException(
        `Target script version [${validatedReq.targetScriptVersionId}] not found`,
      );
    }

    // 1. Scene Diffing
    const sceneDiffs = this.computeSceneDiffs(baseScript, targetScript);

    // 2. Load entities for both versions
    const baseEntities = await this.firestoreService.listEntities(
      baseScript.id,
    );
    const targetEntities = await this.firestoreService.listEntities(
      targetScript.id,
    );

    // 3. Find latest run and findings for base version to check prior clearance
    const projectRuns = await this.firestoreService.listRuns(projectId);
    const baseRuns = projectRuns.filter(
      (r) => r.scriptVersionId === baseScript.id,
    );
    baseRuns.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const latestBaseRun = baseRuns[0];

    const baseFindings = latestBaseRun
      ? await this.firestoreService.getFindings(latestBaseRun.id)
      : [];

    const baseFindingByEntityId = new Map<string, Finding>(
      baseFindings.map((f) => [f.entityId, f]),
    );

    // 4. Compute Entity Deltas
    const entityDeltas: EntityDelta[] = [];
    const matchedBaseEntityIds = new Set<string>();

    let addedCount = 0;
    let modifiedCount = 0;
    let untouchedCount = 0;
    let carriedForwardCount = 0;
    let researchRequiredCount = 0;

    for (const targetEnt of targetEntities) {
      // Find matching base entity by canonicalName or aliases (case-insensitive)
      const matchingBase = baseEntities.find(
        (be) =>
          be.canonicalName.trim().toLowerCase() ===
            targetEnt.canonicalName.trim().toLowerCase() ||
          be.aliases.some(
            (a) =>
              a.trim().toLowerCase() ===
              targetEnt.canonicalName.trim().toLowerCase(),
          ) ||
          targetEnt.aliases.some(
            (ta) =>
              ta.trim().toLowerCase() === be.canonicalName.trim().toLowerCase(),
          ),
      );

      if (!matchingBase) {
        // ADDED entity
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
          requiresResearch: true,
          carryForwardAllowed: false,
          diffDetails: "New entity introduced in latest draft",
        });
      } else {
        matchedBaseEntityIds.add(matchingBase.id);

        // Check if entity mentions, scenes, or attributes changed
        const isModified = this.isEntityModified(matchingBase, targetEnt);
        const priorFinding = baseFindingByEntityId.get(matchingBase.id);

        if (isModified) {
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
            previousStatus: priorFinding?.status ?? null,
            requiresResearch: true,
            carryForwardAllowed: false,
            diffDetails:
              "Entity context, scene occurrences, or lines modified across revisions",
          });
        } else {
          untouchedCount++;
          // UNTOUCHED entity: check if eligible for clearance carry-forward
          const canCarryForward =
            priorFinding !== undefined &&
            priorFinding.status !== "INSUFFICIENT_EVIDENCE" &&
            (priorFinding.confidenceScore ?? priorFinding.confidence?.finalScore ?? 0) >= 85;

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
            previousStatus: priorFinding?.status ?? null,
            requiresResearch: !canCarryForward,
            carryForwardAllowed: canCarryForward,
            diffDetails: canCarryForward
              ? "Unmodified entity with valid prior clearance finding carried forward"
              : "Unmodified entity requires fresh research due to incomplete prior evidence",
          });
        }
      }
    }

    // Check for DELETED entities (in base but not in target)
    let deletedCount = 0;
    for (const baseEnt of baseEntities) {
      if (!matchedBaseEntityIds.has(baseEnt.id)) {
        deletedCount++;
        entityDeltas.push({
          entityId: baseEnt.id,
          canonicalName: baseEnt.canonicalName,
          type: baseEnt.type,
          changeType: "DELETED",
          baseEntityId: baseEnt.id,
          targetEntityId: null,
          previousFindingId: baseFindingByEntityId.get(baseEnt.id)?.id ?? null,
          previousStatus: baseFindingByEntityId.get(baseEnt.id)?.status ?? null,
          requiresResearch: false,
          carryForwardAllowed: false,
          diffDetails: "Entity omitted from latest draft",
        });
      }
    }

    const estimatedCostSavingsUsd = Number(
      (carriedForwardCount * 0.75).toFixed(2),
    );

    const delta: ScriptDelta = {
      id: generateUuidV7(),
      projectId,
      baseScriptVersionId: baseScript.id,
      targetScriptVersionId: targetScript.id,
      baseChecksumSha256: baseScript.checksumSha256,
      targetChecksumSha256: targetScript.checksumSha256,
      sceneDiffs,
      entityDeltas,
      summary: {
        totalBaseEntities: baseEntities.length,
        totalTargetEntities: targetEntities.length,
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

    // Content-free audit entry
    await this.firestoreService.appendAuditLog({
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "SCRIPT_DELTA_COMPUTED",
      timestamp: new Date().toISOString(),
      metadata: {
        baseVersionNumber: baseScript.versionNumber,
        targetVersionNumber: targetScript.versionNumber,
        addedEntities: addedCount,
        modifiedEntities: modifiedCount,
        deletedEntities: deletedCount,
        carriedForward: carriedForwardCount,
        researchRequired: researchRequiredCount,
      },
    });

    return delta;
  }

  /**
   * 2. Differential Clearance Execution:
   * Automatically carries forward previously cleared findings for unmodified entities.
   * Dispatches the research pipeline ONLY for new or modified entities, preventing redundant spend.
   */
  async executeDifferentialClearanceRun(
    user: AuthenticatedUser,
    dto: DifferentialClearanceRunRequest,
  ): Promise<DifferentialClearanceRunResult> {
    const validatedDto = DifferentialClearanceRunRequest.parse(dto);

    const project = await this.projectsService.getProject(
      user,
      validatedDto.projectId,
    );
    await this.assertProjectAccess(user, project, ["OWNER", "PRODUCER"]);

    const targetScript = await this.firestoreService.getScriptVersion(
      validatedDto.projectId,
      validatedDto.targetScriptVersionId,
    );
    if (!targetScript) {
      throw new NotFoundException(
        `Target script version [${validatedDto.targetScriptVersionId}] not found`,
      );
    }

    // Resolve base script version
    let baseScript: ScriptVersion | null = null;
    if (validatedDto.baseScriptVersionId) {
      baseScript = await this.firestoreService.getScriptVersion(
        validatedDto.projectId,
        validatedDto.baseScriptVersionId,
      );
    } else {
      // Pick prior draft (versionNumber - 1)
      const allScripts = await this.firestoreService.listScriptVersions(
        validatedDto.projectId,
      );
      allScripts.sort((a, b) => b.versionNumber - a.versionNumber);
      baseScript =
        allScripts.find((s) => s.versionNumber < targetScript.versionNumber) ??
        null;
    }

    // Ensure all target entities are confirmed by Producer
    const targetEntities = await this.firestoreService.listEntities(
      targetScript.id,
    );
    const unconfirmed = targetEntities.filter((e) => !e.confirmed);
    if (unconfirmed.length > 0) {
      throw new PreconditionFailedException(
        `Producer Confirmation Gate Active: ${unconfirmed.length} entities in draft ${targetScript.versionNumber} have not been confirmed by a Producer.`,
      );
    }

    // Compute Delta
    let delta: ScriptDelta | null = null;
    if (baseScript) {
      delta = await this.compareScriptVersions(user, validatedDto.projectId, {
        baseScriptVersionId: baseScript.id,
        targetScriptVersionId: targetScript.id,
      });
    }

    const runId = generateUuidV7();
    const now = new Date().toISOString();

    const newRun: ClearanceRun = {
      id: runId,
      projectId: validatedDto.projectId,
      scriptVersionId: targetScript.id,
      state: "RUNNING",
      jurisdiction: validatedDto.jurisdiction,
      version: 1,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      endedAt: null,
      deadlineAt: new Date(Date.now() + 600000).toISOString(),
      checkpoint: {
        completedEntityIds: [],
        pendingEntityIds: targetEntities.map((e) => e.id),
        lastCheckpointAt: now,
        attempt: 1,
      },
      budget: {
        costCapUsd: 15.0,
        estimatedCostUsd: 0,
        parallelCallCap: 50,
        parallelCallsUsed: 0,
        entityCap: 50,
      },
    };
    await this.firestoreService.saveRun(newRun);

    const carriedForwardFindingIds: string[] = [];
    const dispatchedEntityIds: string[] = [];
    let totalCostUsd = 0;

    // Find prior findings if baseScript exists
    const projectRuns = await this.firestoreService.listRuns(
      validatedDto.projectId,
    );
    const baseRuns = baseScript
      ? projectRuns.filter((r) => r.scriptVersionId === baseScript!.id)
      : [];
    baseRuns.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const latestBaseRun = baseRuns[0];
    const priorFindings = latestBaseRun
      ? await this.firestoreService.getFindings(latestBaseRun.id)
      : [];
    const priorFindingsMap = new Map<string, Finding>(
      priorFindings.map((f) => [f.entityId, f]),
    );

    // Prior citations
    const priorCitations = latestBaseRun
      ? await this.firestoreService.getCitations(latestBaseRun.id)
      : [];
    const priorCitationMap = new Map(priorCitations.map((c) => [c.id, c]));

    for (const targetEnt of targetEntities) {
      const entityDelta = delta?.entityDeltas.find(
        (ed) => ed.targetEntityId === targetEnt.id,
      );

      const canCarryForward =
        validatedDto.autoCarryForward &&
        entityDelta &&
        entityDelta.changeType === "UNTOUCHED" &&
        entityDelta.carryForwardAllowed &&
        entityDelta.baseEntityId &&
        priorFindingsMap.has(entityDelta.baseEntityId);

      if (canCarryForward && entityDelta.baseEntityId) {
        // Carry forward prior cleared finding without redundant API calls
        const priorFinding = priorFindingsMap.get(entityDelta.baseEntityId)!;
        const newFindingId = generateUuidV7();

        // Carry forward matching citations into new run
        const relatedCitations = (priorFinding.citationIds || [])
          .map((cid) => priorCitationMap.get(cid))
          .filter(Boolean) as any[];

        if (relatedCitations.length > 0) {
          await this.firestoreService.saveCitations(runId, relatedCitations);
        }

        const carriedFinding: Finding = {
          ...priorFinding,
          id: newFindingId,
          runId,
          entityId: targetEnt.id,
          version: 1,
          createdAt: now,
          updatedAt: now,
          rationale: `${priorFinding.rationale} [DIFFERENTIAL CARRY-FORWARD FROM SCRIPT DRAFT ${baseScript?.versionNumber ?? 1}]`,
        };

        await this.firestoreService.saveFinding(carriedFinding);
        carriedForwardFindingIds.push(newFindingId);

        // Checkpoint update
        const completed = new Set(newRun.checkpoint.completedEntityIds);
        completed.add(targetEnt.id);
        newRun.checkpoint.completedEntityIds = Array.from(completed);
        newRun.checkpoint.pendingEntityIds =
          newRun.checkpoint.pendingEntityIds.filter((id) => id !== targetEnt.id);
      } else {
        // Dispatched live research for new or modified entity
        dispatchedEntityIds.push(targetEnt.id);
        const researchResult =
          await this.researchService.conductResearchForEntity({
            projectId: validatedDto.projectId,
            runId,
            entityId: targetEnt.id,
            jurisdiction: validatedDto.jurisdiction,
          });

        totalCostUsd += researchResult.totalCostUsd;
      }
    }

    // Finalize run state
    const costSavedUsd = Number(
      (carriedForwardFindingIds.length * 0.75).toFixed(2),
    );
    const updatedRun: ClearanceRun = {
      ...newRun,
      state: "DRAFT_READY",
      version: newRun.version + 1,
      updatedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      budget: {
        ...newRun.budget,
        estimatedCostUsd: Number(totalCostUsd.toFixed(4)),
      },
    };
    await this.firestoreService.saveRun(updatedRun);

    // Content-free audit log
    await this.firestoreService.appendAuditLog({
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId: validatedDto.projectId,
      actorId: user.uid,
      action: "DIFFERENTIAL_CLEARANCE_RUN_COMPLETED",
      timestamp: new Date().toISOString(),
      metadata: {
        runId,
        targetScriptVersion: targetScript.versionNumber,
        baseScriptVersion: baseScript?.versionNumber ?? null,
        carriedForwardCount: carriedForwardFindingIds.length,
        dispatchedCount: dispatchedEntityIds.length,
        totalEntities: targetEntities.length,
      },
    });

    return {
      runId,
      projectId: validatedDto.projectId,
      baseScriptVersionId: baseScript?.id ?? null,
      targetScriptVersionId: targetScript.id,
      deltaSummary: delta?.summary ?? {
        totalBaseEntities: 0,
        totalTargetEntities: targetEntities.length,
        addedEntitiesCount: targetEntities.length,
        modifiedEntitiesCount: 0,
        deletedEntitiesCount: 0,
        untouchedEntitiesCount: 0,
        carriedForwardFindingsCount: carriedForwardFindingIds.length,
        researchRequiredCount: dispatchedEntityIds.length,
        estimatedCostSavingsUsd: costSavedUsd,
      },
      carriedForwardFindingIds,
      dispatchedEntityIds,
      totalEntitiesInScope: targetEntities.length,
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
      costSavedUsd,
      startedAt: now,
      status: "DRAFT_READY",
    };
  }

  /**
   * 3. Revision History & Audit Trail:
   * Returns chronological chain of custody linking clearance certificates, reports, and checksums to script drafts.
   */
  async getScriptDraftHistory(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<ScriptDraftHistoryResponse> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);

    const scripts = await this.firestoreService.listScriptVersions(projectId);
    scripts.sort((a, b) => a.versionNumber - b.versionNumber);

    const allRuns = await this.firestoreService.listRuns(projectId);
    const allReports =
      await this.firestoreService.listClearanceReports(projectId);

    const historyItems: ScriptDraftHistoryItem[] = [];

    for (const script of scripts) {
      const entities = await this.firestoreService.listEntities(script.id);
      const scriptRuns = allRuns.filter((r) => r.scriptVersionId === script.id);
      scriptRuns.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const latestRun = scriptRuns[0];

      const report = allReports.find(
        (rep) =>
          rep.scriptChecksumSha256 === script.checksumSha256 ||
          (latestRun && rep.runId === latestRun.id),
      );

      historyItems.push({
        scriptVersionId: script.id,
        versionNumber: script.versionNumber,
        checksumSha256: script.checksumSha256,
        pageCount: script.pageCount,
        sceneCount: script.sceneCount,
        sourceType: script.sourceType,
        createdAt: script.createdAt,
        entitiesCount: entities.length,
        runsCount: scriptRuns.length,
        latestRunState: latestRun?.state ?? null,
        clearanceReportId: report?.id ?? null,
        certificateSealSha256:
          report?.verification.contentDigestSha256 ?? null,
      });
    }

    return {
      projectId,
      history: historyItems,
    };
  }

  // ==========================================
  // Helper & Scene / Entity Diffing Logic
  // ==========================================

  private computeSceneDiffs(
    baseScript: ScriptVersion,
    targetScript: ScriptVersion,
  ): SceneDiff[] {
    const diffs: SceneDiff[] = [];

    // If raw screenplay text exists, parse sluglines
    if (baseScript.rawText && targetScript.rawText) {
      const baseScenes = this.extractSceneHeadings(baseScript.rawText);
      const targetScenes = this.extractSceneHeadings(targetScript.rawText);

      const targetHeadingsSet = new Set(targetScenes.map((s) => s.heading));
      const baseHeadingsSet = new Set(baseScenes.map((s) => s.heading));

      for (const ts of targetScenes) {
        if (!baseHeadingsSet.has(ts.heading)) {
          diffs.push({
            sceneNumber: ts.sceneNumber,
            heading: ts.heading,
            changeType: "ADDED",
            baseSceneId: null,
            targetSceneId: null,
            addedLinesCount: ts.lineCount,
            removedLinesCount: 0,
          });
        } else {
          const bs = baseScenes.find((s) => s.heading === ts.heading);
          if (bs && bs.lineCount !== ts.lineCount) {
            diffs.push({
              sceneNumber: ts.sceneNumber,
              heading: ts.heading,
              changeType: "MODIFIED",
              baseSceneId: null,
              targetSceneId: null,
              addedLinesCount: Math.max(0, ts.lineCount - bs.lineCount),
              removedLinesCount: Math.max(0, bs.lineCount - ts.lineCount),
            });
          } else {
            diffs.push({
              sceneNumber: ts.sceneNumber,
              heading: ts.heading,
              changeType: "UNTOUCHED",
              baseSceneId: null,
              targetSceneId: null,
              addedLinesCount: 0,
              removedLinesCount: 0,
            });
          }
        }
      }

      for (const bs of baseScenes) {
        if (!targetHeadingsSet.has(bs.heading)) {
          diffs.push({
            sceneNumber: bs.sceneNumber,
            heading: bs.heading,
            changeType: "DELETED",
            baseSceneId: null,
            targetSceneId: null,
            addedLinesCount: 0,
            removedLinesCount: bs.lineCount,
          });
        }
      }
    } else {
      // Fallback structural scene diff based on scene counts
      const maxScenes = Math.max(baseScript.sceneCount, targetScript.sceneCount);
      for (let i = 1; i <= maxScenes; i++) {
        if (i <= targetScript.sceneCount && i <= baseScript.sceneCount) {
          diffs.push({
            sceneNumber: `${i}`,
            heading: `SCENE ${i}`,
            changeType: "UNTOUCHED",
            baseSceneId: null,
            targetSceneId: null,
            addedLinesCount: 0,
            removedLinesCount: 0,
          });
        } else if (i <= targetScript.sceneCount) {
          diffs.push({
            sceneNumber: `${i}`,
            heading: `SCENE ${i} (NEW)`,
            changeType: "ADDED",
            baseSceneId: null,
            targetSceneId: null,
            addedLinesCount: 20,
            removedLinesCount: 0,
          });
        } else {
          diffs.push({
            sceneNumber: `${i}`,
            heading: `SCENE ${i}`,
            changeType: "DELETED",
            baseSceneId: null,
            targetSceneId: null,
            addedLinesCount: 0,
            removedLinesCount: 20,
          });
        }
      }
    }

    return diffs;
  }

  private extractSceneHeadings(rawText: string): Array<{
    heading: string;
    sceneNumber?: string;
    lineCount: number;
  }> {
    const lines = rawText.split(/\r?\n/);
    const scenes: Array<{
      heading: string;
      sceneNumber?: string;
      lineCount: number;
    }> = [];
    let currentScene: {
      heading: string;
      sceneNumber?: string;
      lineCount: number;
    } | null = null;

    const sluglineRegex =
      /^(?:EXT\.|INT\.|INT\.\/EXT\.|I\/E\.|EST\.|SCENE)\s+(.+)$/i;

    for (const line of lines) {
      const match = line.trim().match(sluglineRegex);
      if (match) {
        if (currentScene) {
          scenes.push(currentScene);
        }
        currentScene = {
          heading: line.trim().toUpperCase(),
          sceneNumber: `${scenes.length + 1}`,
          lineCount: 1,
        };
      } else if (currentScene) {
        currentScene.lineCount++;
      }
    }

    if (currentScene) {
      scenes.push(currentScene);
    }

    return scenes;
  }

  private isEntityModified(
    baseEntity: CanonicalEntity,
    targetEntity: CanonicalEntity,
  ): boolean {
    if (baseEntity.type !== targetEntity.type) return true;
    if (baseEntity.mentions.length !== targetEntity.mentions.length) return true;

    // Compare mention details
    for (let i = 0; i < baseEntity.mentions.length; i++) {
      const bm = baseEntity.mentions[i]!;
      const tm = targetEntity.mentions[i]!;
      if (
        bm.sceneId !== tm.sceneId ||
        bm.sourceRange?.start !== tm.sourceRange?.start ||
        bm.sourceRange?.end !== tm.sourceRange?.end ||
        bm.contextExcerpt !== tm.contextExcerpt
      ) {
        return true;
      }
    }

    return false;
  }

  private async assertProjectAccess(
    user: AuthenticatedUser,
    project: Project,
    allowedRoles: Array<(typeof Role)["_type"]>,
  ): Promise<void> {
    const org = await this.firestoreService.getOrganization(
      project.organizationId,
    );
    if (org?.ownerId === user.uid) return;

    const grants = await this.firestoreService.getGrants(project.id);
    const grant = grants.find((g) => g.userId === user.uid);
    if (!grant || !allowedRoles.includes(grant.role)) {
      throw new ForbiddenException("FORBIDDEN");
    }
  }
}
