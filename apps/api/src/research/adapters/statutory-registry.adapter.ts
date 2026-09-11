import { Injectable, Logger } from "@nestjs/common";
import { DOMAIN_AUTHORITY_REGISTRY } from "./domain-authority.js";
import type {
  ISearchProvider,
  ProviderSearchQuery,
  ProviderSearchResponse,
} from "./search-provider.interface.js";
import {
  checkParallelApiHealth,
  executeParallelSearch,
  toRawCitations,
} from "./parallel-search.client.js";

/**
 * Statutory registry evidence.
 *
 * IMPORTANT SCOPE NOTE (PRM-P1.2): this adapter performs domain-targeted web
 * retrieval against official registry hosts. It is NOT a direct registry API
 * integration: it cannot read a live trademark status, and therefore never
 * emits a registry record identifier or a CURRENT_STATUS claim. Genuine
 * USPTO / Copyright Office / EUIPO / WIPO integrations are tracked separately.
 *
 * Tier-1 is earned only by the resolved hostname. Anything that resolves
 * elsewhere is discarded rather than relabelled.
 */
const TIER_1_DOMAINS = Object.values(DOMAIN_AUTHORITY_REGISTRY)
  .filter((meta) => meta.sourceTier === "TIER_1")
  .map((meta) => meta.domain);

@Injectable()
export class StatutoryRegistryAdapter implements ISearchProvider {
  readonly providerName = "STATUTORY_REGISTRY_SEARCH";
  readonly providerType = "STATUTORY_REGISTRY" as const;

  private readonly logger = new Logger(StatutoryRegistryAdapter.name);

  async search(query: ProviderSearchQuery): Promise<ProviderSearchResponse> {
    if (!this.isEnabled()) {
      this.logger.warn(
        "Statutory registry adapter is disabled by configuration; contributing zero citations.",
      );
      return { citations: [], latencyMs: 0, costUsd: 0, unitsUsed: 0 };
    }

    const searchQueries = this.buildQueries(query);

    const outcome = await executeParallelSearch(
      {
        objective: this.buildObjective(query),
        searchQueries,
      },
      this.logger,
    );

    const citations = await toRawCitations({
      results: outcome.results,
      query: searchQueries.join(" | "),
      allowedTiers: ["TIER_1"],
      logger: this.logger,
    });

    return {
      citations,
      latencyMs: outcome.latencyMs,
      costUsd: outcome.costUsd,
      unitsUsed: outcome.unitsUsed,
    };
  }

  async checkHealth(): Promise<{ healthy: boolean; latencyMs: number }> {
    return checkParallelApiHealth();
  }

  private isEnabled(): boolean {
    const raw = (process.env.PERMISSA_STATUTORY_ADAPTER_ENABLED ?? "true")
      .trim()
      .toLowerCase();
    return raw !== "false";
  }

  private targetDomains(query: ProviderSearchQuery): string[] {
    const preferred =
      query.type === "BRAND_BUSINESS_PRODUCT"
        ? ["tsdr.uspto.gov", "euipo.europa.eu", "sec.gov"]
        : query.type === "PRODUCTION_TITLE"
          ? ["cocatalog.loc.gov", "tsdr.uspto.gov", "wipo.int"]
          : ["tsdr.uspto.gov", "cocatalog.loc.gov"];

    return preferred.filter((domain) => TIER_1_DOMAINS.includes(domain));
  }

  private buildObjective(query: ProviderSearchQuery): string {
    return `Find official registry records published by government intellectual-property or regulatory authorities that refer to "${query.canonicalName}". Only official register pages are relevant; ignore commentary, news and aggregators.`;
  }

  private buildQueries(query: ProviderSearchQuery): string[] {
    const name = query.canonicalName.trim();
    const domains = this.targetDomains(query);

    if (domains.length === 0) {
      return [`"${name}" official registry record`];
    }

    return domains.map((domain) => `site:${domain} "${name}"`);
  }
}
