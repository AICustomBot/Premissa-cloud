import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { resolveDomainMetadata } from "./domain-authority.js";
import type { RawCitationItem } from "./search-provider.interface.js";

/**
 * Parallel Search API client.
 *
 * Constitutional honesty contract (PRM-P1.2):
 * 1. Every citation returned to the orchestrator originates from a provider
 *    response. This module never synthesizes a URL, title, excerpt, date or
 *    record identifier.
 * 2. Source tier and controlling owner are resolved from the *resolved*
 *    hostname via the domain-authority registry. An adapter may never assert a
 *    tier for itself.
 * 3. `reachable` is the observed result of a real network probe, never a
 *    constant.
 * 4. When the provider is unreachable or unconfigured this module throws. A
 *    clearance run must fail loudly rather than produce a finding from an
 *    empty or partial evidence set.
 */

export const PARALLEL_SEARCH_ENDPOINT = "https://api.parallel.ai/v1/search";
export const PARALLEL_API_ROOT = "https://api.parallel.ai/";

export type ParallelSearchMode = "turbo" | "fast" | "advanced";
export type AllowedTier = "TIER_1" | "TIER_2" | "TIER_3";

/** Shape of a single result as documented by the Parallel Search API. */
export interface ParallelSearchResultItem {
  url?: string;
  title?: string;
  publish_date?: string | null;
  excerpts?: string[];
}

interface ParallelSearchApiResponse {
  search_id?: string;
  results?: ParallelSearchResultItem[];
  warnings?: unknown[];
  usage?: Array<{ name?: string; count?: number }>;
  session_id?: string;
}

export interface ParallelSearchOutcome {
  results: ParallelSearchResultItem[];
  latencyMs: number;
  costUsd: number;
  unitsUsed: number;
}

export interface ReachabilityProbe {
  reachable: boolean;
  resolvedUrl: string;
}

const DEFAULT_TIMEOUT_MS = 30000;
/**
 * Published Parallel Search pricing is $0.001-$0.005 per request depending on
 * mode. We bill the conservative upper bound so the run budget can never be
 * under-counted, and allow an operator override once real invoices are
 * reconciled (see PRM-P5.2).
 */
const DEFAULT_UNIT_COST_USD = 0.005;
const REACHABILITY_TIMEOUT_MS = 8000;
const REACHABILITY_CONCURRENCY = 5;
const MAX_EXCERPT_CHARS = 1200;

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizePublishDate(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function safeReadBody(response: {
  text: () => Promise<string>;
}): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return "<unreadable response body>";
  }
}

async function mapWithConcurrency<TIn, TOut>(
  items: TIn[],
  limit: number,
  worker: (item: TIn) => Promise<TOut>,
): Promise<TOut[]> {
  const output: TOut[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await worker(items[index] as TIn);
      }
    },
  );

  await Promise.all(runners);
  return output;
}

export function isParallelConfigured(): boolean {
  const key = process.env.PARALLEL_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

/**
 * Resolves the API key or throws. There is deliberately no fallback path:
 * an unconfigured provider must stop the run.
 */
export function requireParallelApiKey(): string {
  const key = process.env.PARALLEL_API_KEY;
  if (typeof key !== "string" || !key.trim()) {
    throw new ServiceUnavailableException({
      code: "PARALLEL_UNAVAILABLE",
      message:
        "PARALLEL_API_KEY is not configured. Evidence retrieval is unavailable and no clearance research may proceed.",
    });
  }
  return key.trim();
}

export function resolveSearchMode(): ParallelSearchMode {
  const raw = (process.env.PARALLEL_SEARCH_MODE ?? "").trim().toLowerCase();
  if (raw === "turbo" || raw === "fast" || raw === "advanced") return raw;
  return "fast";
}

/**
 * Executes one Parallel Search request. Throws on transport failure, non-2xx
 * response, or an unparseable body.
 */
export async function executeParallelSearch(
  request: {
    objective: string;
    searchQueries: string[];
    mode?: ParallelSearchMode;
  },
  logger: Logger,
): Promise<ParallelSearchOutcome> {
  const apiKey = requireParallelApiKey();
  const mode = request.mode ?? resolveSearchMode();
  const timeoutMs = readNumberEnv(
    "PARALLEL_SEARCH_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(PARALLEL_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        objective: request.objective,
        search_queries: request.searchQueries,
        mode,
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    throw new ServiceUnavailableException({
      code: "PARALLEL_UNAVAILABLE",
      message: `Parallel Search request failed after ${Date.now() - startedAt}ms: ${describeError(err)}`,
    });
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    const detail = await safeReadBody(response);
    throw new ServiceUnavailableException({
      code: "PARALLEL_UNAVAILABLE",
      message: `Parallel Search returned HTTP ${response.status}: ${detail}`,
    });
  }

  let payload: ParallelSearchApiResponse;
  try {
    payload = (await response.json()) as ParallelSearchApiResponse;
  } catch (err: unknown) {
    throw new ServiceUnavailableException({
      code: "PARALLEL_UNAVAILABLE",
      message: `Parallel Search returned a body that is not valid JSON: ${describeError(err)}`,
    });
  }

  const results = Array.isArray(payload.results) ? payload.results : [];

  const reportedUnits = (payload.usage ?? []).reduce(
    (sum, entry) => sum + (typeof entry?.count === "number" ? entry.count : 0),
    0,
  );
  const unitsUsed = reportedUnits > 0 ? reportedUnits : 1;
  const unitCostUsd = readNumberEnv(
    "PARALLEL_SEARCH_UNIT_COST_USD",
    DEFAULT_UNIT_COST_USD,
  );
  const costUsd = Number((unitsUsed * unitCostUsd).toFixed(4));

  if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
    logger.warn(
      `Parallel Search returned ${payload.warnings.length} warning(s) for this request.`,
    );
  }

  logger.log(
    `Parallel Search [${mode}] returned ${results.length} result(s) in ${latencyMs}ms (units=${unitsUsed}, billed=$${costUsd.toFixed(4)}).`,
  );

  return { results, latencyMs, costUsd, unitsUsed };
}

/**
 * Real reachability probe. Follows redirects so the resolved URL reflects where
 * the citation actually lands. Never throws: an unreachable citation is
 * recorded as unreachable, which the evidence gate penalises.
 */
export async function probeUrlReachability(
  url: string,
): Promise<ReachabilityProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);

  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    // Some origins reject HEAD outright; retry with a single-byte ranged GET.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { range: "bytes=0-0" },
        signal: controller.signal,
      });
    }

    const resolvedUrl =
      typeof response.url === "string" && response.url.length > 0
        ? response.url
        : url;

    return { reachable: response.ok, resolvedUrl };
  } catch {
    return { reachable: false, resolvedUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalizes provider results into citations.
 *
 * Results are dropped when they carry no provider-supplied excerpt (we will not
 * invent supporting text) or when their resolved domain falls outside the tiers
 * an adapter is allowed to contribute.
 */
export async function toRawCitations(params: {
  results: ParallelSearchResultItem[];
  query: string;
  allowedTiers?: AllowedTier[];
  logger: Logger;
}): Promise<RawCitationItem[]> {
  const { results, query, allowedTiers, logger } = params;

  const candidates = results.filter(
    (item): item is ParallelSearchResultItem & { url: string } =>
      typeof item?.url === "string" && isHttpUrl(item.url),
  );

  const probes = await mapWithConcurrency(
    candidates,
    REACHABILITY_CONCURRENCY,
    (item) => probeUrlReachability(item.url),
  );

  const citations: RawCitationItem[] = [];
  let droppedForTier = 0;
  let droppedForMissingExcerpt = 0;

  candidates.forEach((item, index) => {
    const probe = probes[index] ?? {
      reachable: false,
      resolvedUrl: item.url,
    };

    const metadata = resolveDomainMetadata(probe.resolvedUrl);

    if (allowedTiers && !allowedTiers.includes(metadata.sourceTier)) {
      droppedForTier += 1;
      return;
    }

    const excerpt = (item.excerpts ?? [])
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0)
      .join(" … ")
      .slice(0, MAX_EXCERPT_CHARS);

    if (!excerpt) {
      droppedForMissingExcerpt += 1;
      return;
    }

    citations.push({
      originalUrl: item.url,
      resolvedUrl: probe.resolvedUrl,
      resolvedDomain: metadata.domain,
      controllingOwner: metadata.controllingOwner ?? null,
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim()
          : item.url,
      excerpt,
      sourceTier: metadata.sourceTier,
      // A search snippet is a point-in-time observation. Only a direct registry
      // integration may assert CURRENT_STATUS.
      claimType: "HISTORICAL",
      query,
      publishedAt: normalizePublishDate(item.publish_date),
      updatedAt: null,
      // Populated only by a genuine registry record lookup, which does not exist yet.
      registryRecordId: null,
      reachable: probe.reachable,
    });
  });

  if (droppedForTier > 0 || droppedForMissingExcerpt > 0) {
    logger.log(
      `Discarded ${droppedForTier} out-of-tier and ${droppedForMissingExcerpt} excerpt-less result(s); ${citations.length} citation(s) retained.`,
    );
  }

  return citations;
}

/**
 * Health check for the Parallel dependency.
 *
 * This deliberately performs a non-billable network probe of the API host plus
 * a configuration check. It proves DNS, TLS and reachability; it does not prove
 * the key is valid, because validating a key requires a chargeable search.
 */
export async function checkParallelApiHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
}> {
  if (!isParallelConfigured()) {
    return { healthy: false, latencyMs: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(PARALLEL_API_ROOT, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    return {
      healthy: response.status < 500,
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return { healthy: false, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}
