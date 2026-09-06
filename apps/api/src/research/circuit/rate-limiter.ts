import {
  Injectable,
  Logger,
  PreconditionFailedException,
} from "@nestjs/common";

export interface RateLimitConfig {
  maxCallsPerEntity: number;
  maxCallsPerRun: number;
}

/**
 * Enforces constitutional rate limiting and budget invariants:
 * - Maximum 3 parallel calls per entity.
 * - Maximum 50 provider calls per run.
 * - Immediate rejection if run budget exceeds cost cap.
 */
@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);

  private readonly config: RateLimitConfig = {
    maxCallsPerEntity: 3,
    maxCallsPerRun: 50,
  };

  private readonly entityCalls = new Map<string, number>(); // entityId -> call count
  private readonly runCalls = new Map<string, number>(); // runId -> call count

  checkAndAcquire(
    runId: string,
    entityId: string,
    currentRunCostUsd: number,
    costCapUsd: number,
  ): void {
    // 1. Budget Cap Check
    if (currentRunCostUsd >= costCapUsd) {
      this.logger.warn(
        `Budget limit breached for run [${runId}]: Used $${currentRunCostUsd.toFixed(3)} >= Cap $${costCapUsd.toFixed(3)}`,
      );
      throw new PreconditionFailedException(
        `Clearance run cost cap of $${costCapUsd.toFixed(2)} USD exceeded. Further research queries blocked.`,
      );
    }

    // 2. Per-Run Call Cap Check
    const currentRunCount = this.runCalls.get(runId) ?? 0;
    if (currentRunCount >= this.config.maxCallsPerRun) {
      this.logger.warn(
        `Run call quota exceeded for run [${runId}]: ${currentRunCount} >= ${this.config.maxCallsPerRun}`,
      );
      throw new PreconditionFailedException(
        `Run provider call quota of ${this.config.maxCallsPerRun} calls reached.`,
      );
    }

    // 3. Per-Entity Parallel Call Cap Check
    const currentEntityCount = this.entityCalls.get(entityId) ?? 0;
    if (currentEntityCount >= this.config.maxCallsPerEntity) {
      this.logger.warn(
        `Per-entity search cap reached for entity [${entityId}]: ${currentEntityCount} >= ${this.config.maxCallsPerEntity}`,
      );
      throw new PreconditionFailedException(
        `Maximum ${this.config.maxCallsPerEntity} provider calls already conducted for this entity candidate.`,
      );
    }

    // Increment call counters
    this.runCalls.set(runId, currentRunCount + 1);
    this.entityCalls.set(entityId, currentEntityCount + 1);
  }

  getRunCallCount(runId: string): number {
    return this.runCalls.get(runId) ?? 0;
  }

  getEntityCallCount(entityId: string): number {
    return this.entityCalls.get(entityId) ?? 0;
  }

  resetRun(runId: string): void {
    this.runCalls.delete(runId);
  }
}
