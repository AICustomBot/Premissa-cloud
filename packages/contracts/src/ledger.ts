import { z } from "zod";
import { IsoDateTime } from "./common.js";
import { LedgerEntryId, OrganizationId, ProjectId, RunId } from "./ids.js";

export const ProviderType = z.enum([
  "PARALLEL_SEARCH",
  "STATUTORY_REGISTRY",
  "TRADE_DIRECTORY",
  "GEMINI_SPECIALIST",
]);

export type ProviderType = z.infer<typeof ProviderType>;

/**
 * Immutable usage ledger entry written after every provider call.
 * Strictly content-free by constitutional contract:
 * No screenplay text, entity names, queries, evidence excerpts, or raw payloads.
 */
export const UsageLedgerEntry = z.object({
  id: LedgerEntryId,
  runId: RunId,
  organizationId: OrganizationId,
  projectId: ProjectId,
  provider: ProviderType,
  callType: z.string().max(64),
  latencyMs: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  unitsUsed: z.number().int().nonnegative(),
  budgetRemainingUsd: z.number().nonnegative(),
  timestamp: IsoDateTime,
});

export type UsageLedgerEntry = z.infer<typeof UsageLedgerEntry>;
