import "reflect-metadata";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSearchAdapter } from "../src/research/adapters/live-search.adapter.js";
import { StatutoryRegistryAdapter } from "../src/research/adapters/statutory-registry.adapter.js";
import { IndustryDatabaseAdapter } from "../src/research/adapters/industry-database.adapter.js";
import type { ProviderSearchQuery } from "../src/research/adapters/search-provider.interface.js";

/**
 * Regression tests for PRM-P1.2.
 *
 * Every ISearchProvider implementation previously manufactured its own
 * citations: invented URLs, invented excerpts, randomly generated USPTO serial
 * numbers and EIDR identifiers, hardcoded publication dates, and a `reachable`
 * flag that was the literal value `true`. Two of the three adapters minted
 * TIER_1 and TIER_2 evidence, which is exactly the evidence the gate trusts.
 *
 * These tests assert the property that matters: a citation can only exist if a
 * provider returned it.
 */

const QUERY: ProviderSearchQuery = {
  entityId: "entity-1",
  canonicalName: "Apex Entertainment",
  type: "BRAND_BUSINESS_PRODUCT",
  aliases: ["Apex Ent."],
  jurisdiction: "US",
};

const SEARCH_ENDPOINT = "https://api.parallel.ai/v1/search";

interface StubCall {
  url: string;
  method: string;
}

let calls: StubCall[] = [];
let savedEnv: NodeJS.ProcessEnv;

function stubResponse(body: unknown, url: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function installFetch(
  searchBody: unknown,
  options: {
    searchStatus?: number;
    probeThrows?: boolean;
    probeStatus?: number;
  } = {},
) {
  const impl = vi.fn(async (input: unknown, init?: Record<string, unknown>) => {
    const url = String(input);
    const method = String(init?.["method"] ?? "GET").toUpperCase();
    calls.push({ url, method });

    if (url.startsWith(SEARCH_ENDPOINT)) {
      return stubResponse(searchBody, url, options.searchStatus ?? 200);
    }

    if (options.probeThrows) {
      throw new Error("network unreachable");
    }

    return stubResponse({}, url, options.probeStatus ?? 200);
  });

  vi.stubGlobal("fetch", impl);
  return impl;
}

beforeEach(() => {
  savedEnv = { ...process.env };
  calls = [];
  process.env.PARALLEL_API_KEY = "test-key";
  delete process.env.PERMISSA_STATUTORY_ADAPTER_ENABLED;
  delete process.env.PERMISSA_TRADE_ADAPTER_ENABLED;
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = savedEnv;
});

describe("provider configuration is a hard precondition", () => {
  it("throws rather than degrading when PARALLEL_API_KEY is absent", async () => {
    delete process.env.PARALLEL_API_KEY;
    const fetchMock = installFetch({ results: [] });

    await expect(new LiveSearchAdapter().search(QUERY)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the provider returns a non-2xx response", async () => {
    installFetch({ error: "boom" }, { searchStatus: 500 });

    await expect(new LiveSearchAdapter().search(QUERY)).rejects.toThrow();
  });

  it("reports unhealthy when the key is missing, without calling the API", async () => {
    delete process.env.PARALLEL_API_KEY;
    const fetchMock = installFetch({ results: [] });

    const health = await new LiveSearchAdapter().checkHealth();

    expect(health.healthy).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("citations can only come from a provider response", () => {
  it("returns zero citations when the provider returns zero results", async () => {
    installFetch({ results: [], usage: [{ name: "search", count: 1 }] });

    const response = await new LiveSearchAdapter().search(QUERY);

    expect(response.citations).toHaveLength(0);
  });

  it("emits only URLs the provider actually returned, with no invented record ids", async () => {
    installFetch({
      results: [
        {
          url: "https://www.imdb.com/title/example-entry",
          title: "Apex Entertainment",
          publish_date: "2024-03-04",
          excerpts: ["Apex Entertainment is credited as producer."],
        },
      ],
      usage: [{ name: "search", count: 1 }],
    });

    const response = await new LiveSearchAdapter().search(QUERY);

    expect(response.citations).toHaveLength(1);
    const citation = response.citations[0]!;
    expect(citation.originalUrl).toBe(
      "https://www.imdb.com/title/example-entry",
    );
    expect(citation.resolvedDomain).toBe("imdb.com");
    expect(citation.controllingOwner).toBe("Amazon.com, Inc.");
    expect(citation.sourceTier).toBe("TIER_2");
    expect(citation.registryRecordId).toBeNull();
    expect(citation.claimType).toBe("HISTORICAL");
    expect(citation.excerpt).toContain("credited as producer");
    expect(citation.publishedAt).not.toBeNull();
  });

  it("drops results that carry no provider-supplied excerpt", async () => {
    installFetch({
      results: [
        { url: "https://www.imdb.com/title/example-entry", title: "Apex" },
      ],
    });

    const response = await new LiveSearchAdapter().search(QUERY);

    expect(response.citations).toHaveLength(0);
  });
});

describe("reachable reflects a real probe", () => {
  it("is false when the probe cannot reach the citation", async () => {
    installFetch(
      {
        results: [
          {
            url: "https://www.imdb.com/title/example-entry",
            title: "Apex",
            excerpts: ["Apex Entertainment."],
          },
        ],
      },
      { probeThrows: true },
    );

    const response = await new LiveSearchAdapter().search(QUERY);

    expect(response.citations[0]!.reachable).toBe(false);
  });

  it("is false when the citation responds with an error status", async () => {
    installFetch(
      {
        results: [
          {
            url: "https://www.imdb.com/title/example-entry",
            title: "Apex",
            excerpts: ["Apex Entertainment."],
          },
        ],
      },
      { probeStatus: 404 },
    );

    const response = await new LiveSearchAdapter().search(QUERY);

    expect(response.citations[0]!.reachable).toBe(false);
  });
});

describe("tier is earned by the resolved host, never asserted by the adapter", () => {
  it("statutory adapter keeps registry hosts and discards everything else", async () => {
    installFetch({
      results: [
        {
          url: "https://someones-blog.example/apex-trademark",
          title: "Everything about Apex trademarks",
          excerpts: ["Apex filed a mark, apparently."],
        },
        {
          url: "https://tsdr.uspto.gov/documentviewer?caseId=example",
          title: "Trademark Status & Document Retrieval",
          excerpts: ["Mark: APEX ENTERTAINMENT."],
        },
      ],
    });

    const response = await new StatutoryRegistryAdapter().search(QUERY);

    expect(response.citations).toHaveLength(1);
    expect(response.citations[0]!.sourceTier).toBe("TIER_1");
    expect(response.citations[0]!.resolvedDomain).toBe("tsdr.uspto.gov");
    expect(response.citations[0]!.registryRecordId).toBeNull();
  });

  it("trade adapter cannot contribute Tier-1 evidence", async () => {
    installFetch({
      results: [
        {
          url: "https://tsdr.uspto.gov/documentviewer?caseId=example",
          title: "Trademark Status & Document Retrieval",
          excerpts: ["Mark: APEX ENTERTAINMENT."],
        },
      ],
    });

    const response = await new IndustryDatabaseAdapter().search(QUERY);

    expect(response.citations).toHaveLength(0);
  });

  it("a disabled adapter contributes nothing and spends nothing", async () => {
    process.env.PERMISSA_STATUTORY_ADAPTER_ENABLED = "false";
    const fetchMock = installFetch({ results: [] });

    const response = await new StatutoryRegistryAdapter().search(QUERY);

    expect(response.citations).toHaveLength(0);
    expect(response.costUsd).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("source scan: fabrication patterns must not reappear", () => {
  const researchDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "../src/research",
  );
  const adaptersDir = join(researchDir, "adapters");

  it("no adapter generates its own identifiers or evidence", () => {
    const offenders: string[] = [];

    for (const file of readdirSync(adaptersDir)) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(join(adaptersDir, file), "utf8");

      if (/Math\s*\.\s*random/.test(source)) {
        offenders.push(`${file}: generates random values`);
      }
      if (/\btt\d{6,}\b/.test(source) || /\bnm\d{6,}\b/.test(source)) {
        offenders.push(`${file}: contains a hardcoded IMDb identifier`);
      }
      if (/reachable:\s*true/.test(source)) {
        offenders.push(`${file}: hardcodes reachability`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("the orchestrator no longer swallows provider failures", () => {
    const source = readFileSync(
      join(researchDir, "research.service.ts"),
      "utf8",
    );

    expect(source).not.toContain("proceeding with remaining sources");
  });
});
