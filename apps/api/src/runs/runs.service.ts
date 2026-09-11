import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from "@nestjs/common";
import {
  CreateRunRequest,
  generateUuidV7,
  type AuditLogEntry,
  type CanonicalEntity,
  type ClearanceRun,
  type Finding,
} from "@permissa/contracts";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ResearchService } from "../research/research.service.js";
import { FirestoreService } from "../storage/firestore.service.js";

/** States from which execute() may start or resume work. */
const RESUMABLE_STATES = new Set<ClearanceRun["state"]>([
  "CREATED",
  "QUEUED",
  "PREFLIGHT",
  "RUNNING",
  "PAUSED_FAILURE",
  "PAUSED_BUDGET",
]);

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface CreateRunResult {
  run: ClearanceRun;
  confirmedEntityCount: number;
  /** True when an existing run was returned for a repeated idempotency key. */
  deduplicated: boolean;
}

export interface ExecuteRunResult {
  runId: string;
  state: ClearanceRun["state"];
  entitiesCompleted: number;
  entitiesPending: number;
  findingsWritten: number;
  statusCounts: Record<string, number>;
  estimatedCostUsd: number;
  providerCallsUsed: number;
  failedEntityCount: number;
  /** True when work remains and execute() should be called again. */
  resumable: boolean;
  stopReason:
    | "COMPLETED"
    | "COST_CAP_REACHED"
    | "TIME_BUDGET_REACHED"
    | "ENTITY_CAP_REACHED"
    | "ALL_ENTITIES_FAILED";
}

/**
 * Clearance run lifecycle.
 *
 * The per-entity research pipeline already existed in ResearchService. What
 * was missing was the run itself: something to create it against a real script
 * version, enforce the preflight gate once rather than per entity, walk the
 * confirmed entities, and record where it stopped. This service is that layer
 * and deliberately contains no clearance logic -- every status still comes
 * from synthesizeFinding inside the research pipeline, which calls
 * packages/policy.
 */
@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  /**
   * Idempotency key -> runId, per project.
   *
   * Process-local by necessity: ClearanceRun has no field to persist the key,
   * and the storage layer keeps runs in process memory anyway. A retry that
   * reaches a different container will create a second run, so this is a
   * best-effort guard against a double-click, not a durable guarantee.
   */
  private readonly idempotencyIndex = new Map<string, string>();

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly researchService: ResearchService,
    private readonly firestoreService: FirestoreService,
  ) {}

  async createRun(
    user: AuthenticatedUser,
    projectId: string,
    body: Record<string, unknown>,
  ): Promise<CreateRunResult> {
    const project = await this.projectsService.getProject(user, projectId);
    // Starting a run spends provider budget, so it is an owner/producer
    // action. A reviewer may read findings but may not commission research.
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
    ]);

    const dto = CreateRunRequest.parse({
      ...body,
      projectId,
      jurisdiction: body.jurisdiction ?? project.jurisdiction,
      // The contract requires a key of at least 16 characters. Generating one
      // when the client omits it keeps the field meaningful for clients that
      // do send it, instead of rejecting an otherwise valid request.
      idempotencyKey: body.idempotencyKey ?? `run-${generateUuidV7()}`,
    });

    const indexKey = `${projectId}:${dto.idempotencyKey}`;
    const existingRunId = this.idempotencyIndex.get(indexKey);
    if (existingRunId) {
      const existing = await this.firestoreService.getRun(
        projectId,
        existingRunId,
      );
      if (existing) {
        const entities = await this.confirmedEntities(dto.scriptVersionId);
        return {
          run: existing,
          confirmedEntityCount: entities.length,
          deduplicated: true,
        };
      }
      this.idempotencyIndex.delete(indexKey);
    }

    // Preflight. The producer confirmation gate is a precondition of any live
    // research, so it is checked once here rather than surfacing as a failure
    // on every entity mid-run.
    const confirmed = await this.confirmedEntities(dto.scriptVersionId);
    if (confirmed.length === 0) {
      const total = await this.firestoreService.listEntities(
        dto.scriptVersionId,
      );
      throw new PreconditionFailedException(
        total.length === 0
          ? "No entities exist for this script version, so there is nothing to research."
          : "No entity on this script version has been confirmed by a producer. Confirm entities before starting a run.",
      );
    }

    const now = new Date().toISOString();
    const costCapUsd = numberFromEnv("RUN_COST_CAP_USD", 10);
    const entityCap = numberFromEnv("RUN_ENTITY_CAP", 12);
    const deadlineMs = numberFromEnv("RUN_DEADLINE_MS", 600_000);

    const run: ClearanceRun = {
      id: generateUuidV7(),
      projectId,
      scriptVersionId: dto.scriptVersionId,
      state: "CREATED",
      jurisdiction: dto.jurisdiction,
      version: 1,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      endedAt: null,
      deadlineAt: new Date(Date.now() + deadlineMs).toISOString(),
      checkpoint: {
        completedEntityIds: [],
        pendingEntityIds: confirmed.slice(0, entityCap).map((e) => e.id),
        lastCheckpointAt: now,
        attempt: 1,
      },
      budget: {
        costCapUsd,
        estimatedCostUsd: 0,
        parallelCallCap: numberFromEnv("RUN_PARALLEL_CALL_CAP", 50),
        parallelCallsUsed: 0,
        entityCap,
      },
    };

    await this.firestoreService.saveRun(run);
    this.idempotencyIndex.set(indexKey, run.id);

    await this.appendAudit(project.organizationId, projectId, user.uid, {
      action: "RUN_CREATED",
      metadata: {
        runId: run.id,
        scriptVersionId: run.scriptVersionId,
        confirmedEntityCount: confirmed.length,
        entityCap,
        costCapUsd,
      },
    });

    return {
      run,
      confirmedEntityCount: confirmed.length,
      deduplicated: false,
    };
  }

  async listRuns(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<ClearanceRun[]> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);

    const runs = await this.firestoreService.listRuns(projectId);
    // Newest first: UUIDv7 ids sort chronologically, but createdAt is the
    // field a client can reason about.
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRun(
    user: AuthenticatedUser,
    projectId: string,
    runId: string,
  ): Promise<ClearanceRun> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);

    const run = await this.firestoreService.getRun(projectId, runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }
    return run;
  }

  /**
   * Research every pending confirmed entity, then settle the run's state.
   *
   * Synchronous rather than queued: there is no worker or task queue in this
   * deployment, so pretending the work happens in the background would mean
   * it never happens at all. The wall-clock budget keeps a request inside the
   * platform's request timeout, and the checkpoint makes the next call resume
   * instead of repeating completed entities.
   */
  async executeRun(
    user: AuthenticatedUser,
    projectId: string,
    runId: string,
  ): Promise<ExecuteRunResult> {
    const project = await this.projectsService.getProject(user, projectId);
    await this.projectsService.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
    ]);

    let run = await this.firestoreService.getRun(projectId, runId);
    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }
    if (!RESUMABLE_STATES.has(run.state)) {
      throw new ConflictException(
        `Run ${runId} is in state ${run.state} and cannot be executed. ` +
          "A run that has reached review or approval is closed to further research.",
      );
    }

    const confirmed = await this.confirmedEntities(run.scriptVersionId);
    const confirmedIds = new Set(confirmed.map((entity) => entity.id));
    const completed = new Set(run.checkpoint?.completedEntityIds ?? []);

    // Recompute the queue from current confirmations rather than trusting the
    // stored pending list: entities can be confirmed or merged after creation.
    const queue = confirmed
      .filter((entity) => !completed.has(entity.id))
      .slice(0, Math.max(run.budget.entityCap - completed.size, 0));

    const startedAt = run.startedAt ?? new Date().toISOString();
    run = await this.transition(run, {
      state: "RUNNING",
      startedAt,
      attempt: (run.checkpoint?.attempt ?? 1) + (run.startedAt ? 1 : 0),
    });

    const timeBudgetMs = numberFromEnv("RUN_EXECUTION_BUDGET_MS", 45_000);
    const deadline = Date.now() + timeBudgetMs;

    const statusCounts: Record<string, number> = {};
    let findingsWritten = 0;
    let failedEntityCount = 0;
    let attempted = 0;
    let stopReason: ExecuteRunResult["stopReason"] = "COMPLETED";

    for (const entity of queue) {
      const current = await this.firestoreService.getRun(projectId, runId);
      if (current) {
        run = current;
      }

      if (run.budget.estimatedCostUsd >= run.budget.costCapUsd) {
        stopReason = "COST_CAP_REACHED";
        break;
      }
      if (Date.now() >= deadline) {
        stopReason = "TIME_BUDGET_REACHED";
        break;
      }

      attempted += 1;
      try {
        const result = await this.researchService.conductResearchForEntity({
          projectId,
          runId,
          entityId: entity.id,
          jurisdiction: run.jurisdiction,
        });

        findingsWritten += 1;
        const status = result.finding.admittedStatus;
        statusCounts[status] = (statusCounts[status] ?? 0) + 1;

        // conductResearchForEntity records ledger entries per provider call but
        // does not roll the cost into the run budget, so do it here where the
        // cap is enforced.
        if (result.totalCostUsd > 0 || result.providerCallsCount > 0) {
          run = await this.firestoreService.updateRunBudget(
            projectId,
            runId,
            result.totalCostUsd,
            result.providerCallsCount,
          );
        }
      } catch (err: unknown) {
        failedEntityCount += 1;
        // Content-free: the entity id is an opaque identifier, the name is not.
        this.logger.warn(
          `Research failed for entity [${entity.id}] in run [${runId}]; continuing with remaining entities`,
        );
      }
    }

    const latest = await this.firestoreService.getRun(projectId, runId);
    if (latest) {
      run = latest;
    }

    const completedNow = new Set(run.checkpoint?.completedEntityIds ?? []);
    const pending = confirmed.filter(
      (entity) => !completedNow.has(entity.id),
    ).length;
    const cappedOut = pending > 0 && completedNow.size >= run.budget.entityCap;

    if (attempted > 0 && failedEntityCount === attempted) {
      stopReason = "ALL_ENTITIES_FAILED";
    } else if (stopReason === "COMPLETED" && cappedOut) {
      stopReason = "ENTITY_CAP_REACHED";
    }

    const nextState: ClearanceRun["state"] =
      stopReason === "COST_CAP_REACHED"
        ? "PAUSED_BUDGET"
        : stopReason === "ALL_ENTITIES_FAILED"
          ? "PAUSED_FAILURE"
          : stopReason === "TIME_BUDGET_REACHED"
            ? "RUNNING"
            : "DRAFT_READY";

    const settled = nextState === "DRAFT_READY";
    run = await this.transition(run, {
      state: nextState,
      startedAt: run.startedAt ?? startedAt,
      endedAt: settled ? new Date().toISOString() : null,
      pendingEntityIds: confirmed
        .filter((entity) => !completedNow.has(entity.id))
        .map((entity) => entity.id),
    });

    await this.appendAudit(project.organizationId, projectId, user.uid, {
      action: settled ? "RUN_DRAFT_READY" : "RUN_PAUSED",
      metadata: {
        runId,
        state: run.state,
        stopReason,
        entitiesCompleted: completedNow.size,
        entitiesPending: pending,
        failedEntityCount,
        estimatedCostUsd: run.budget.estimatedCostUsd,
      },
    });

    // Findings not confirmed in this pass still count toward the run total,
    // so report the stored count rather than only what this call wrote.
    const allFindings: Finding[] =
      await this.researchService.getFindingsForRun(runId);

    return {
      runId,
      state: run.state,
      entitiesCompleted: completedNow.size,
      entitiesPending: pending,
      findingsWritten: allFindings.length || findingsWritten,
      statusCounts,
      estimatedCostUsd: run.budget.estimatedCostUsd,
      providerCallsUsed: run.budget.parallelCallsUsed,
      failedEntityCount,
      resumable: !settled && pending > 0 && stopReason !== "ENTITY_CAP_REACHED",
      stopReason,
    };
  }

  private async confirmedEntities(
    scriptVersionId: string,
  ): Promise<CanonicalEntity[]> {
    const entities = await this.firestoreService.listEntities(scriptVersionId);
    return entities.filter((entity) => entity.confirmed);
  }

  private async transition(
    run: ClearanceRun,
    patch: {
      state: ClearanceRun["state"];
      startedAt?: string | null;
      endedAt?: string | null;
      pendingEntityIds?: string[];
      attempt?: number;
    },
  ): Promise<ClearanceRun> {
    const now = new Date().toISOString();
    const updated: ClearanceRun = {
      ...run,
      state: patch.state,
      version: run.version + 1,
      updatedAt: now,
      startedAt:
        patch.startedAt !== undefined ? patch.startedAt : run.startedAt,
      endedAt: patch.endedAt !== undefined ? patch.endedAt : run.endedAt,
      checkpoint: {
        completedEntityIds: run.checkpoint?.completedEntityIds ?? [],
        pendingEntityIds:
          patch.pendingEntityIds ?? run.checkpoint?.pendingEntityIds ?? [],
        lastCheckpointAt: now,
        attempt: patch.attempt ?? run.checkpoint?.attempt ?? 1,
      },
    };

    await this.firestoreService.saveRun(updated);
    return updated;
  }

  /**
   * Append a content-free audit entry. Metadata carries identifiers, counts
   * and states only -- never entity names, screenplay text or evidence.
   */
  private async appendAudit(
    organizationId: string,
    projectId: string,
    actorId: string,
    input: { action: string; metadata: Record<string, unknown> },
  ): Promise<void> {
    const entry: AuditLogEntry = {
      id: generateUuidV7(),
      organizationId,
      projectId,
      actorId,
      action: input.action,
      timestamp: new Date().toISOString(),
      metadata: input.metadata,
    };

    try {
      await this.firestoreService.appendAuditLog(entry);
    } catch (err: unknown) {
      // An audit write must not swallow the caller's result, but a silent
      // failure would leave an unexplained gap in the trail.
      this.logger.error(
        `Failed to append audit entry [${input.action}] for run in project [${projectId}]`,
      );
    }
  }
}
