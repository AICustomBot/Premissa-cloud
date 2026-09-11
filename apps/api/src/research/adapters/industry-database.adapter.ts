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
 * Trade directory and industry database evidence.
 *
 * Retrieval is domain-targeted at recognised trade sources, but the tier and
 * controlling owner of each citation are still resolved from the hostname that
 * actually served the page. Independence is therefore enforced downstream: two
 * Penske titles, or IMDb and Box Office Mojo, still collapse to one owner.
 */
const TIER_2_DOMAINS = Object.values(DOMAIN_AUTHORITY_REGISTRY)
  .filter((meta) => meta.sourceTier === "TIER_2")
  .map((meta) => meta.domain);

@Injectable()
export class IndustryDatabaseAdapter implements ISearchProvider {
  readonly providerName = "TRADE_DIRECTORY_SEARCH";
  readonly providerType = "TRADE_DIRECTORY" as const;

  private readonly logger = new Logger(IndustryDatabaseAdapter.name);

  async search(query: ProviderSearchQuery): Promise<ProviderSearchResponse> {
    if (!this.isEnabled()) {
      this.logger.warn(
        "Trade directory adapter is disabled by configuration; contributing zero citations.",
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
      allowedTiers: ["TIER_2"],
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
    const raw = (process.env.PERMISSA_TRADE_ADAPTER_ENABLED ?? "true")
      .trim()
      .toLowerCase();
    return raw !== "false";
  }

  private targetDomains(query: ProviderSearchQuery): string[] {
    const preferred =
      query.type === "PRODUCTION_TITLE"
        ? ["imdb.com", "variety.com", "deadline.com", "eidr.org"]
        : query.type === "BRAND_BUSINESS_PRODUCT"
          ? ["crunchbase.com", "bloomberg.com", "reuters.com"]
          : ["imdb.com", "variety.com", "hollywoodreporter.com"];

    return preferred.filter((domain) => TIER_2_DOMAINS.includes(domain));
  }

  private buildObjective(query: ProviderSearchQuery): string {
    return `Find entries in established industry databases and trade publications that document "${query.canonicalName}", including who owns or controls it. Prefer database entries and reported fact over opinion pieces.`;
  }

  private buildQueries(query: ProviderSearchQuery): string[] {
    const name = query.canonicalName.trim();
    const domains = this.targetDomains(query);

    if (domains.length === 0) {
      return [`"${name}" industry database entry`];
    }

    return domains.map((domain) => `site:${domain} "${name}"`);
  }
}
