import crypto from "crypto";
import { z } from "zod";
import {
  evaluateEvidenceGate,
  type ConfidenceInput,
  type GateDecision,
  type ProposedStatus,
  type AuthorityPattern,
  type IndependencePattern,
  type MatchQuality,
  type ContextQuality,
} from "@permissa/policy";
import type { GoldenCitation, ClearanceItem } from "../data/golden-data";

// Known official registry domains (Tier 1)
const TIER_1_DOMAINS = [
  "uspto.gov",
  "tess2.uspto.gov",
  "copyright.gov",
  "sec.gov",
  "fbi.gov",
  "fda.gov",
  "gov.uk",
  "ipo.gov.uk",
  "find-and-update.company-information.service.gov.uk",
  "companieshouse.gov.uk",
  "wipo.int",
  "chambers.com",
  "euipo.europa.eu",
];

// Known authoritative news & trade editorial domains (Tier 2)
const TIER_2_DOMAINS = [
  "reuters.com",
  "bloomberg.com",
  "ft.com",
  "wsj.com",
  "nytimes.com",
  "variety.com",
  "hollywoodreporter.com",
  "deadline.com",
  "theverge.com",
  "techcrunch.com",
  "crunchbase.com",
  "bbc.com",
  "bbc.co.uk",
  "theguardian.com",
];

export const ParallelResearchRequestSchema = z.object({
  projectId: z.string(),
  entityId: z.string(),
  canonicalName: z.string().min(1),
  type: z.string(),
  jurisdiction: z.string().default("US"),
});

export type ParallelResearchRequest = z.infer<
  typeof ParallelResearchRequestSchema
>;

export const ParallelResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string().optional(),
        excerpts: z.array(z.string()).optional(),
        published_date: z.string().optional(),
      }),
    )
    .optional(),
  warnings: z.array(z.string()).optional(),
  search_id: z.string().optional(),
});

export type ParallelResponse = z.infer<typeof ParallelResponseSchema>;

export interface ParallelResearchResult {
  entityId: string;
  citations: GoldenCitation[];
  confidenceInput: ConfidenceInput;
  decision: GateDecision;
  provider: {
    name: "Parallel Web Systems";
    endpoint: "https://api.parallel.ai/v1/search";
    callsUsed: number;
    latencyMs: number;
    searchId?: string | undefined;
  };
  usageLedgerEntry: {
    provider: "PARALLEL";
    model: "v1/search";
    timestamp: string;
    durationMs: number;
    costUsd: number;
    status: "SUCCESS" | "FAILED";
  };
}

/**
 * Checks if the Parallel API is configured via environment variable.
 */
export function isParallelConfigured(): boolean {
  return Boolean(
    process.env.PARALLEL_API_KEY &&
    process.env.PARALLEL_API_KEY.trim().length > 0,
  );
}

/**
 * Classifies a domain into a deterministic Source Tier.
 */
function classifyDomainTier(domain: string): "TIER_1" | "TIER_2" | "TIER_3" {
  const lower = domain.toLowerCase();
  if (
    lower.endsWith(".gov") ||
    lower.endsWith(".mil") ||
    TIER_1_DOMAINS.some((d) => lower === d || lower.endsWith(`.${d}`))
  ) {
    return "TIER_1";
  }
  if (TIER_2_DOMAINS.some((d) => lower === d || lower.endsWith(`.${d}`))) {
    return "TIER_2";
  }
  return "TIER_3";
}

/**
 * Extracts the root host domain from a URL.
 */
function extractDomain(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "web.source";
  }
}

/**
 * Generates deterministic SHA-256 hash for citation excerpt provenance.
 */
function sha256Hex(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Searches Parallel API for live web evidence for a screenplay entity.
 * Strict adherence to constitution:
 * - Content-free logging (no entity names or excerpts in logs)
 * - Provider SDK types stay inside adapter
 * - Deterministic confidence formula and evidence gate
 */
export async function executeParallelResearch(
  request: ParallelResearchRequest,
): Promise<ParallelResearchResult> {
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    const error: any = new Error("Parallel API key not configured");
    error.code = "PARALLEL_UNAVAILABLE";
    throw error;
  }

  const startTime = Date.now();

  const objective = `Verify legal clearance, registered trademarks, corporate entities, intellectual property, and public figures for film screenplay entity: ${request.canonicalName} (${request.type}) under jurisdiction ${request.jurisdiction}.`;
  const searchQueries = [
    `${request.canonicalName} trademark registration USPTO`,
    `${request.canonicalName} corporate registry company official`,
    `${request.canonicalName} legal controversy public entity`,
  ];

  let response: Response;
  try {
    response = await fetch("https://api.parallel.ai/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey.trim(),
      },
      body: JSON.stringify({
        objective,
        search_queries: searchQueries,
        max_results: 5,
      }),
    });
  } catch (netErr: any) {
    const error: any = new Error("Parallel network dispatch failed");
    error.code = "PARALLEL_UNAVAILABLE";
    error.cause = netErr;
    throw error;
  }

  const durationMs = Date.now() - startTime;

  if (!response.ok) {
    const error: any = new Error(
      `Parallel API returned status ${response.status}`,
    );
    error.code = "PARALLEL_UNAVAILABLE";
    error.statusCode = response.status;
    throw error;
  }

  const rawJson = await response.json();
  const parsed = ParallelResponseSchema.parse(rawJson);

  // Normalize results into Permissa GoldenCitation contract
  const results = parsed.results || [];
  const normalizedCitations: GoldenCitation[] = [];

  for (const r of results) {
    if (!r) continue;
    const url = r.url || "https://search.parallel.ai";
    const domain = extractDomain(url);
    const sourceTier = classifyDomainTier(domain);
    const excerpt =
      (r.excerpts && r.excerpts[0]) || r.title || "No excerpt retrieved";
    const publishedAt = r.published_date || new Date().toISOString();
    const retrievedAt = new Date().toISOString();
    const contentHash = sha256Hex(`${url}:${excerpt}`);

    normalizedCitations.push({
      id: `cit-par-${crypto.randomUUID().slice(0, 8)}`,
      title: r.title || `Parallel Evidence: ${domain}`,
      domain,
      controllingOwner:
        sourceTier === "TIER_1" ? "Official Registry Authority" : null,
      url,
      sourceTier,
      excerpt: excerpt.length > 800 ? `${excerpt.slice(0, 800)}...` : excerpt,
      publishedAt,
      retrievedAt,
      isReachable: true,
      contentHash,
    });
  }

  // Evaluate authority pattern from citations
  const hasTier1 = normalizedCitations.some((c) => c.sourceTier === "TIER_1");
  const tier2Citations = normalizedCitations.filter(
    (c) => c.sourceTier === "TIER_2",
  );
  const tier2Domains = new Set(tier2Citations.map((c) => c.domain));

  let authority: AuthorityPattern = "NONE";
  if (hasTier1) {
    authority = "TIER_1_APPLICABLE";
  } else if (tier2Domains.size >= 2) {
    authority = "TWO_INDEPENDENT_TIER_2";
  } else if (tier2Domains.size === 1) {
    authority = "SINGLE_TIER_2";
  } else if (normalizedCitations.length > 0) {
    authority = "TIER_3_ONLY";
  }

  // Independence pattern
  let independence: IndependencePattern = "SINGLE_SOURCE";
  if (hasTier1) {
    independence = "TIER_1_PATH";
  } else if (tier2Domains.size >= 2) {
    independence = "DISTINCT_DOMAIN_AND_OWNER";
  } else if (tier2Domains.size === 1) {
    independence = "DISTINCT_DOMAIN_SAME_OWNER";
  }

  // Check match quality against entity canonical name
  const lowerName = request.canonicalName.toLowerCase();
  const exactMatchInExcerpt = normalizedCitations.some((c) =>
    c.excerpt.toLowerCase().includes(lowerName),
  );

  let match: MatchQuality = "WEAK";
  if (exactMatchInExcerpt && hasTier1) {
    match = "EXACT_CORROBORATED";
  } else if (exactMatchInExcerpt && tier2Citations.length > 0) {
    match = "STRONG";
  } else if (exactMatchInExcerpt) {
    match = "PARTIAL";
  }

  // Check for conflict signals in excerpts
  const conflictKeywords = [
    "infringement",
    "trademark conflict",
    "lawsuit",
    "cease and desist",
    "opposition",
    "dispute",
    "copyright claim",
  ];
  const unresolvedConflict = normalizedCitations.some((c) =>
    conflictKeywords.some((kw) => c.excerpt.toLowerCase().includes(kw)),
  );

  const confidenceInput: ConfidenceInput = {
    authority,
    independence,
    match,
    freshnessValid: true,
    context: "COMPLETE",
    unresolvedConflict,
    providerFailed: false,
    budgetLimited: false,
    citationUnreachable: false,
    hasAdmissibleCitation: normalizedCitations.length > 0,
    evidenceExpired: false,
  };

  // Determine initial proposed status
  let proposedStatus: ProposedStatus = "INSUFFICIENT_EVIDENCE";
  if (unresolvedConflict) {
    proposedStatus = "NEEDS_REWRITE";
  } else if (hasTier1 && match === "EXACT_CORROBORATED") {
    // If exact commercial mark in registry
    proposedStatus =
      request.type === "BRAND_BUSINESS_PRODUCT"
        ? "NEEDS_LICENCE"
        : "RESEARCH_CLEARED";
  } else if (
    authority === "TWO_INDEPENDENT_TIER_2" ||
    authority === "TIER_1_APPLICABLE"
  ) {
    proposedStatus = "RESEARCH_CLEARED";
  }

  // Pass through the deterministic evidence gate
  const decision = evaluateEvidenceGate({
    proposedStatus,
    confidence: confidenceInput,
    licenceSignalSupported: proposedStatus === "NEEDS_LICENCE",
    rewritePathSupported: proposedStatus === "NEEDS_REWRITE",
    strongConflict: unresolvedConflict,
    severeContext: false,
  });

  return {
    entityId: request.entityId,
    citations: normalizedCitations,
    confidenceInput,
    decision,
    provider: {
      name: "Parallel Web Systems",
      endpoint: "https://api.parallel.ai/v1/search",
      callsUsed: 1,
      latencyMs: durationMs,
      searchId: parsed.search_id,
    },
    usageLedgerEntry: {
      provider: "PARALLEL",
      model: "v1/search",
      timestamp: new Date().toISOString(),
      durationMs,
      costUsd: 0.015, // $0.015 per web search call
      status: "SUCCESS",
    },
  };
}
