import { Injectable, Logger } from "@nestjs/common";
import {
  generateUuidV7,
  ProviderType,
  UsageLedgerEntry,
} from "@permissa/contracts";
import { FirestoreService } from "../../storage/firestore.service.js";

export interface RecordUsageParams {
  runId: string;
  organizationId: string;
  projectId: string;
  provider: ProviderType;
  callType: string;
  latencyMs: number;
  costUsd: number;
  unitsUsed?: number;
}

/**
 * Usage Ledger Service.
 * Constitutional invariant:
 * - A usage-ledger entry MUST be written after every provider call.
 * - Strictly content-free: No screenplay text, entity names, queries, evidence excerpts,
 *   reviewer comments, or raw provider payloads are ever recorded.
 */
@Injectable()
export class UsageLedgerService {
  private readonly logger = new Logger(UsageLedgerService.name);

  constructor(private readonly firestoreService: FirestoreService) {}

  async recordProviderCall(
    params: RecordUsageParams,
  ): Promise<UsageLedgerEntry> {
    // 1. Fetch current run to calculate remaining budget
    const run = await this.firestoreService.getRun(
      params.projectId,
      params.runId,
    );
    const currentCost = run ? run.budget.estimatedCostUsd : 0;
    const costCap = run ? run.budget.costCapUsd : 10.0;
    const newCost = Number((currentCost + params.costUsd).toFixed(4));
    const budgetRemaining = Math.max(0, Number((costCap - newCost).toFixed(4)));

    // 2. Create immutable, content-free usage ledger record
    const entry: UsageLedgerEntry = {
      id: generateUuidV7(),
      runId: params.runId,
      organizationId: params.organizationId,
      projectId: params.projectId,
      provider: params.provider,
      callType: params.callType,
      latencyMs: params.latencyMs,
      costUsd: params.costUsd,
      unitsUsed: params.unitsUsed ?? 1,
      budgetRemainingUsd: budgetRemaining,
      timestamp: new Date().toISOString(),
    };

    // 3. Persist entry
    await this.firestoreService.appendUsageLedgerEntry(entry);

    // 4. Update run budget aggregate if run exists
    if (run) {
      await this.firestoreService.updateRunBudget(
        params.projectId,
        params.runId,
        params.costUsd,
        1,
      );
    }

    this.logger.log(
      `Recorded content-free usage ledger entry [${entry.id}] for provider [${entry.provider}]: +$${params.costUsd.toFixed(3)} USD (Remaining: $${budgetRemaining.toFixed(3)})`,
    );

    return entry;
  }

  async getLedgerForRun(runId: string): Promise<UsageLedgerEntry[]> {
    return this.firestoreService.getUsageLedgerEntries(runId);
  }
}
