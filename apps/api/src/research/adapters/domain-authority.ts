import { SourceTier } from "@permissa/contracts";

export interface DomainMetadata {
  domain: string;
  sourceTier: any;
  controllingOwner: string;
  jurisdiction: "US";
}

/**
 * Authoritative registry of known domain authorities, tiers, and controlling owners.
 * Used for deterministic domain independence verification:
 * Two sources are only independent if BOTH their domain and controlling owner are distinct.
 */
export const DOMAIN_AUTHORITY_REGISTRY: Record<string, DomainMetadata> = {
  // Tier 1: Official Statutory & Government Registries
  "uspto.gov": {
    domain: "uspto.gov",
    sourceTier: "TIER_1",
    controllingOwner: "United States Patent and Trademark Office",
    jurisdiction: "US",
  },
  "tsdr.uspto.gov": {
    domain: "tsdr.uspto.gov",
    sourceTier: "TIER_1",
    controllingOwner: "United States Patent and Trademark Office",
    jurisdiction: "US",
  },
  "copyright.gov": {
    domain: "copyright.gov",
    sourceTier: "TIER_1",
    controllingOwner: "United States Copyright Office",
    jurisdiction: "US",
  },
  "cocatalog.loc.gov": {
    domain: "cocatalog.loc.gov",
    sourceTier: "TIER_1",
    controllingOwner: "United States Copyright Office",
    jurisdiction: "US",
  },
  "euipo.europa.eu": {
    domain: "euipo.europa.eu",
    sourceTier: "TIER_1",
    controllingOwner: "European Union Intellectual Property Office",
    jurisdiction: "US",
  },
  "wipo.int": {
    domain: "wipo.int",
    sourceTier: "TIER_1",
    controllingOwner: "World Intellectual Property Organization",
    jurisdiction: "US",
  },
  "gov.uk": {
    domain: "gov.uk",
    sourceTier: "TIER_1",
    controllingOwner: "UK Intellectual Property Office",
    jurisdiction: "US",
  },
  "companieshouse.gov.uk": {
    domain: "companieshouse.gov.uk",
    sourceTier: "TIER_1",
    controllingOwner: "UK Companies House",
    jurisdiction: "US",
  },
  "sec.gov": {
    domain: "sec.gov",
    sourceTier: "TIER_1",
    controllingOwner: "US Securities and Exchange Commission",
    jurisdiction: "US",
  },

  // Tier 2: Authoritative Trade Directories & Industry Databases
  "imdb.com": {
    domain: "imdb.com",
    sourceTier: "TIER_2",
    controllingOwner: "Amazon.com, Inc.",
    jurisdiction: "US",
  },
  "boxofficemojo.com": {
    domain: "boxofficemojo.com",
    sourceTier: "TIER_2",
    controllingOwner: "Amazon.com, Inc.", // Same owner as IMDb!
    jurisdiction: "US",
  },
  "variety.com": {
    domain: "variety.com",
    sourceTier: "TIER_2",
    controllingOwner: "Penske Media Corporation",
    jurisdiction: "US",
  },
  "hollywoodreporter.com": {
    domain: "hollywoodreporter.com",
    sourceTier: "TIER_2",
    controllingOwner: "Penske Media Corporation", // Same owner as Variety!
    jurisdiction: "US",
  },
  "deadline.com": {
    domain: "deadline.com",
    sourceTier: "TIER_2",
    controllingOwner: "Penske Media Corporation", // Same owner as Variety!
    jurisdiction: "US",
  },
  "crunchbase.com": {
    domain: "crunchbase.com",
    sourceTier: "TIER_2",
    controllingOwner: "Crunchbase, Inc.",
    jurisdiction: "US",
  },
  "bloomberg.com": {
    domain: "bloomberg.com",
    sourceTier: "TIER_2",
    controllingOwner: "Bloomberg L.P.",
    jurisdiction: "US",
  },
  "reuters.com": {
    domain: "reuters.com",
    sourceTier: "TIER_2",
    controllingOwner: "Thomson Reuters Corporation",
    jurisdiction: "US",
  },
  "eidr.org": {
    domain: "eidr.org",
    sourceTier: "TIER_2",
    controllingOwner: "Entertainment Identifier Registry Association",
    jurisdiction: "US",
  },
};

/**
 * Resolves metadata, tier, and controlling owner for any domain.
 */
export function resolveDomainMetadata(domainOrUrl: string): DomainMetadata {
  let hostname = domainOrUrl.toLowerCase();
  try {
    if (
      domainOrUrl.startsWith("http://") ||
      domainOrUrl.startsWith("https://")
    ) {
      hostname = new URL(domainOrUrl).hostname.toLowerCase();
    }
  } catch {
    // fallback to plain string
  }

  // Strip leading www.
  if (hostname.startsWith("www.")) {
    hostname = hostname.slice(4);
  }

  // Exact match
  if (DOMAIN_AUTHORITY_REGISTRY[hostname]) {
    return DOMAIN_AUTHORITY_REGISTRY[hostname] as any;
  }

  // Subdomain match (e.g. tsdr.uspto.gov -> uspto.gov)
  for (const [key, meta] of Object.entries(DOMAIN_AUTHORITY_REGISTRY)) {
    if (hostname.endsWith(`.${key}`)) {
      return meta;
    }
  }

  // Fallback to Tier 3 general web
  return {
    domain: hostname,
    sourceTier: "TIER_3",
    controllingOwner: `Autonomous Host (${hostname})`,
    jurisdiction: "US",
  };
}

/**
 * Checks if two source domains are truly independent.
 * In accordance with constitutional policy:
 * Two Tier-2 sources with the same owner (e.g. IMDb and Box Office Mojo, or Variety and Deadline)
 * do NOT qualify as independent corroboration.
 */
export function areSourcesIndependent(
  domainA: string,
  domainB: string,
): boolean {
  const metaA = resolveDomainMetadata(domainA);
  const metaB = resolveDomainMetadata(domainB);

  if (metaA.domain === metaB.domain) return false;
  if (
    metaA.controllingOwner &&
    metaB.controllingOwner &&
    metaA.controllingOwner === metaB.controllingOwner
  ) {
    return false;
  }
  return true;
}
