import { ClaimType, SourceTier } from "@permissa/contracts";

export interface ProviderSearchQuery {
  entityId: string;
  canonicalName: string;
  type: "PERSON_CHARACTER" | "BRAND_BUSINESS_PRODUCT" | "PRODUCTION_TITLE";
  aliases: string[];
  jurisdiction?: "US" | "UK" | "EU" | "GLOBAL";
}

export interface RawCitationItem {
  originalUrl: string;
  resolvedUrl: string;
  resolvedDomain: string;
  controllingOwner: string | null;
  title: string;
  excerpt: string;
  sourceTier: SourceTier;
  claimType: ClaimType;
  query: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  registryRecordId?: string | null;
  reachable: boolean;
}

export interface ProviderSearchResponse {
  citations: RawCitationItem[];
  latencyMs: number;
  costUsd: number;
  unitsUsed: number;
}

/**
 * Encapsulated search provider interface.
 * Constitutional rule: Provider SDK types remain strictly isolated behind adapters.
 * No SDK types or raw provider payloads are ever exposed across the boundary.
 */
export interface ISearchProvider {
  readonly providerName: string;
  readonly providerType:
    | "PARALLEL_SEARCH"
    | "STATUTORY_REGISTRY"
    | "TRADE_DIRECTORY"
    | "GEMINI_SPECIALIST";

  search(query: ProviderSearchQuery): Promise<ProviderSearchResponse>;
  checkHealth(): Promise<{ healthy: boolean; latencyMs: number }>;
}
