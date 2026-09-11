import { Injectable, Logger } from "@nestjs/common";
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
 * Open-web evidence retrieval backed by the Parallel Search API.
 *
 * This adapter contributes discovery-grade evidence. It asserts no tier of its
 * own: the tier of every citation is resolved from the domain that actually
 * served the page.
 */
@Injectable()
export class LiveSearchAdapter implements ISearchProvider {
  readonly providerName = "PARALLEL_LIVE_SEARCH";
  readonly providerType = "PARALLEL_SEARCH" as const;

  private readonly logger = new Logger(LiveSearchAdapter.name);

  async search(query: ProviderSearchQuery): Promise<ProviderSearchResponse> {
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

  private buildObjective(query: ProviderSearchQuery): string {
    const name = query.canonicalName;
    switch (query.type) {
      case "PRODUCTION_TITLE":
        return `Determine whether "${name}" is an existing film, television series or other production title already in use, and identify who controls the rights to it. Prefer primary and authoritative sources over aggregators.`;
      case "BRAND_BUSINESS_PRODUCT":
        return `Determine whether "${name}" is an existing brand, business or product in commercial use, and identify the owning entity. Prefer official registers, regulatory filings and first-party sources.`;
      case "PERSON_CHARACTER":
      default:
        return `Determine whether "${name}" identifies a real, identifiable living or recently living person, and establish who that person is. Prefer authoritative biographical and first-party sources.`;
    }
  }

  private buildQueries(query: ProviderSearchQuery): string[] {
    const names = [query.canonicalName, ...(query.aliases ?? [])]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0)
      .slice(0, 3);

    const qualifier =
      query.type === "PRODUCTION_TITLE"
        ? "film series production title rights holder"
        : query.type === "BRAND_BUSINESS_PRODUCT"
          ? "company brand product trademark owner"
          : "real person public figure identity";

    if (names.length === 0) {
      return [qualifier];
    }

    return names.map((name) => `"${name}" ${qualifier}`);
  }
}
