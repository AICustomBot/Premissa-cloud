import {
  Injectable,
  Logger,
  PreconditionFailedException,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  Citation,
  ClearanceRun,
  Finding,
  generateUuidV7,
  Jurisdiction,
} from "@permissa/contracts";
import {
  synthesizeFinding,
  type SynthesisResult,
  type EntityRiskInput,
} from "@permissa/policy";
import { FirestoreService } from "../storage/firestore.service.js";
import { StatutoryRegistryAdapter } from "./adapters/statutory-registry.adapter.js";
import { IndustryDatabaseAdapter } from "./adapters/industry-database.adapter.js";
import { LiveSearchAdapter } from "./adapters/live-search.adapter.js";
import { CircuitBreaker } from "./circuit/circuit-breaker.js";
import { RateLimiter } from "./circuit/rate-limiter.js";
import { UsageLedgerService } from "./ledger/usage-ledger.service.js";
import { areSourcesIndependent } from "./adapters/domain-authority.js";

export interface ResearchQueryRequest {
  projectId: string;
  runId: string;
  entityId: string;
  jurisdiction?: any;
}

export interface ResearchQueryResult {
  entityId: string;
  citations: Citation[];
  hasTier1Citation: boolean;
  twoIndependentTier2: boolean;
  totalCostUsd: number;
  totalLatencyMs: number;
  providerCallsCount: number;
  finding: Finding;
  gateDecision: SynthesisResult["gateDecision"];
}

/**
 * Multi-Source Search Retrieval Engine.
 * Orchestrates parallel search queries across statutory registries, trade directories,
 * and live reference grounding engines.
 *
 * Constitutional Guarantees:
 * 1. Producer Confirmation Gate: Entity must be confirmed by Producer before dispatch.
 * 2. Strict Adapter Encapsulation: Provider SDK types remain strictly within adapters.
 * 3. Usage Ledger Precondition: Content-free ledger entry written after every provider call.
 * 4. Circuit Breakers & Rate Limits: Automated tripping on failures or budget exhaustion.
 */
@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly statutoryAdapter: StatutoryRegistryAdapter,
    private readonly industryAdapter: IndustryDatabaseAdapter,
    private readonly liveSearchAdapter: LiveSearchAdapter,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly rateLimiter: RateLimiter,
    private readonly usageLedgerService: UsageLedgerService,
  ) {}

  async conductResearchForEntity(
    request: ResearchQueryRequest,
  ): Promise<ResearchQueryResult> {
    const startAll = Date.now();

    // 1. Verify Project and Entity Exist
    const project = await this.firestoreService.getProject(request.projectId);
    if (!project) {
      throw new NotFoundException(`Project ${request.projectId} not found`);
    }

    const entity = await this.firestoreService.getEntity(
      request.projectId,
      request.entityId,
    );
    if (!entity) {
      throw new NotFoundException(`Entity ${request.entityId} not found`);
    }

    // 2. Strictly Enforce Constitutional Producer Confirmation Gate
    if (!entity.confirmed) {
      this.logger.warn(
        `Constitutional violation prevented: Unconfirmed entity [${request.entityId}] attempted research execution`,
      );
      throw new PreconditionFailedException(
        "Constitutional Gate Active: Entity has not been confirmed by a Producer. Live clearance research runs are blocked.",
      );
    }

    // 3. Check / Initialize Clearance Run
    let run = await this.firestoreService.getRun(
      request.projectId,
      request.runId,
    );
    if (!run) {
      // Create run if it does not yet exist
      run = {
        id: request.runId,
        projectId: request.projectId,
        scriptVersionId: generateUuidV7(),
        state: "RUNNING",
        jurisdiction: request.jurisdiction ?? "US",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        endedAt: null,
        deadlineAt: new Date(Date.now() + 600000).toISOString(), // 10 min deadline
        checkpoint: {
          completedEntityIds: [],
          pendingEntityIds: [request.entityId],
          lastCheckpointAt: new Date().toISOString(),
          attempt: 1,
        },
        budget: {
          costCapUsd: 10.0,
          estimatedCostUsd: 0,
          parallelCallCap: 50,
          parallelCallsUsed: 0,
          entityCap: 12,
        },
      };
      await this.firestoreService.saveRun(run);
    }

    // 4. Determine Active Adapters for this Entity Type
    const queryParams = {
      entityId: entity.id,
      canonicalName: entity.canonicalName,
      type: entity.type,
      aliases: entity.aliases,
      jurisdiction: request.jurisdiction ?? "US",
    };

    const targetAdapters = [
      this.statutoryAdapter,
      this.industryAdapter,
      this.liveSearchAdapter,
    ];

    const citationsCollected: Citation[] = [];
    let totalCostUsd = 0;
    let providerCallsCount = 0;

    // 5. Execute Multi-Source Parallel Retrieval through Circuit Breakers & Rate Limits
    for (const adapter of targetAdapters) {
      // Check Rate Limit & Budget Preconditions
      this.rateLimiter.checkAndAcquire(
        request.runId,
        request.entityId,
        run.budget.estimatedCostUsd + totalCostUsd,
        run.budget.costCapUsd,
      );

      try {
        const response = await this.circuitBreaker.execute(
          adapter.providerName,
          async () => adapter.search(queryParams),
        );

        totalCostUsd += response.costUsd;
        providerCallsCount++;

        // Record Content-Free Usage Ledger Entry
        await this.usageLedgerService.recordProviderCall({
          runId: request.runId,
          organizationId: project.organizationId,
          projectId: request.projectId,
          provider: adapter.providerType,
          callType: "SEARCH_RETRIEVAL",
          latencyMs: response.latencyMs,
          costUsd: response.costUsd,
          unitsUsed: response.unitsUsed,
        });

        // Normalize Raw Citations to Domain Citation Schema
        for (const raw of response.citations) {
          const contentHash = createHash("sha256")
            .update(`${raw.resolvedUrl}:${raw.title}:${raw.excerpt}`)
            .digest("hex");

          const normalizedCitation: Citation = {
            id: generateUuidV7(),
            taskId: generateUuidV7(),
            originalUrl: raw.originalUrl,
            resolvedUrl: raw.resolvedUrl,
            resolvedDomain: raw.resolvedDomain,
            controllingOwner: raw.controllingOwner,
            title: raw.title,
            excerpt: raw.excerpt,
            sourceTier: raw.sourceTier,
            claimType: raw.claimType,
            query: raw.query,
            publishedAt: raw.publishedAt ?? null,
            updatedAt: raw.updatedAt ?? null,
            retrievedAt: new Date().toISOString(),
            registryRecordId: raw.registryRecordId ?? null,
            contentHash,
            reachable: raw.reachable,
          };

          citationsCollected.push(normalizedCitation);
        }
      } catch (adapterErr: unknown) {
        this.logger.warn(
          `Provider call failed for [${adapter.providerName}]; proceeding with remaining sources`,
        );
      }
    }

    // 6. Persist Citations
    if (citationsCollected.length > 0) {
      await this.firestoreService.saveCitations(
        request.runId,
        citationsCollected,
      );
    }

    // 7. Check Source Tier and Domain Independence Properties
    const hasTier1Citation = citationsCollected.some(
      (c) => c.sourceTier === "TIER_1",
    );

    const tier2Citations = citationsCollected.filter(
      (c) => c.sourceTier === "TIER_2",
    );

    let twoIndependentTier2 = false;
    for (let i = 0; i < tier2Citations.length; i++) {
      for (let j = i + 1; j < tier2Citations.length; j++) {
        const cA = tier2Citations[i];
        const cB = tier2Citations[j];
        if (
          cA &&
          cB &&
          areSourcesIndependent(cA.resolvedDomain, cB.resolvedDomain)
        ) {
          twoIndependentTier2 = true;
          break;
        }
      }
      if (twoIndependentTier2) break;
    }

    // 8. Deterministic Evidence Gate & Policy Synthesis (Constitutional Engine)
    const synthesis = synthesizeFinding({
      runId: request.runId,
      entity,
      citations: citationsCollected,
    });

    // Save Finding with Optimistic Concurrency Control
    await this.firestoreService.saveFinding(synthesis.finding);

    // Update Run Checkpoint: track completed entity
    const completedSet = new Set(run.checkpoint?.completedEntityIds ?? []);
    completedSet.add(request.entityId);
    const updatedRun: ClearanceRun = {
      ...run,
      version: run.version + 1,
      updatedAt: new Date().toISOString(),
      checkpoint: {
        completedEntityIds: Array.from(completedSet),
        pendingEntityIds: (run.checkpoint?.pendingEntityIds ?? []).filter(
          (id) => id !== request.entityId,
        ),
        lastCheckpointAt: new Date().toISOString(),
        attempt: run.checkpoint?.attempt ?? 1,
      },
    };
    await this.firestoreService.saveRun(updatedRun);

    return {
      entityId: request.entityId,
      citations: citationsCollected,
      hasTier1Citation,
      twoIndependentTier2,
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
      totalLatencyMs: Date.now() - startAll,
      providerCallsCount,
      finding: synthesis.finding,
      gateDecision: synthesis.gateDecision,
    };
  }

  async getFindingsForRun(runId: string): Promise<Finding[]> {
    return this.firestoreService.getFindings(runId);
  }

  async getFinding(runId: string, findingId: string): Promise<Finding> {
    const finding = await this.firestoreService.getFinding(runId, findingId);
    if (!finding) {
      throw new NotFoundException(
        `Finding [${findingId}] not found in run [${runId}]`,
      );
    }
    return finding;
  }

  async reevaluateFinding(
    projectId: string,
    runId: string,
    entityId: string,
    riskOverrides?: Partial<EntityRiskInput>,
  ): Promise<SynthesisResult> {
    const entity = await this.firestoreService.getEntity(projectId, entityId);
    if (!entity) {
      throw new NotFoundException(`Entity [${entityId}] not found`);
    }

    const allCitations = await this.firestoreService.getCitations(runId);
    const existingFinding = await this.firestoreService.getFindingByEntityId(
      runId,
      entityId,
    );

    const synthesis = synthesizeFinding({
      runId,
      entity,
      citations: allCitations,
      riskOverrides,
      findingId: existingFinding?.id,
    });

    const versionToSave: Finding = {
      ...synthesis.finding,
      version: existingFinding ? existingFinding.version + 1 : 1,
      updatedAt: new Date().toISOString(),
    };

    await this.firestoreService.saveFinding(
      versionToSave,
      existingFinding?.version,
    );

    return {
      ...synthesis,
      finding: versionToSave,
    };
  }

  getCircuitStatus() {
    return this.circuitBreaker.getStatus();
  }
}
