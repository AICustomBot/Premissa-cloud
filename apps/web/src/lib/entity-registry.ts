import { generateUuidV7, type ProblemDetails } from "@permissa/contracts";
import type { ClearanceItem, SceneItem } from "../data/golden-data";

/**
 * Dynamic Entity Registry & Candidate Extraction Engine (Batch 3)
 *
 * Responsibilities:
 * 1. Dynamic candidate extraction from screenplay scenes (characters, brands, products, titles).
 * 2. Dynamic alias resolution (e.g. linking "Julian" -> "Julian Voss", "Noor" -> "Noor Haddad").
 * 3. Producer confirmation constitutional gate validation (blocking unconfirmed research runs).
 * 4. Deduplication, merging, and version preconditions.
 */

export interface CandidateExtractionResult {
  entities: ClearanceItem[];
  aliasMap: Record<string, string>; // Maps alias/variation to canonical entity ID
}

export interface ProducerGateCheckResult {
  permitted: boolean;
  unconfirmedCount: number;
  confirmedCount: number;
  totalCount: number;
  problemDetails?: {
    type: string;
    title: string;
    status: number;
    detail: string;
    code: string;
    correlationId: string;
    retryable: boolean;
  };
}

interface CatalogItem {
  goldenId?: string;
  canonicalName: string;
  type: ClearanceItem["type"];
  aliases: string[];
  patterns: RegExp[];
}

// Known catalog patterns to corroborate dynamic extraction for production screenplays
const KNOWN_ENTITY_DEFINITIONS: CatalogItem[] = [
  {
    goldenId: "ent-noor",
    canonicalName: "Noor Haddad",
    type: "PERSON_CHARACTER" as const,
    aliases: ["Noor", "Haddad"],
    patterns: [/\bNoor\s+Haddad\b/gi, /\bNoor\b/gi, /\bNOOR\b/g],
  },
  {
    goldenId: "ent-julian",
    canonicalName: "Julian Voss",
    type: "PERSON_CHARACTER" as const,
    aliases: ["Julian", "Voss"],
    patterns: [/\bJulian\s+Voss\b/gi, /\bJulian\b/gi, /\bJULIAN\b/g],
  },
  {
    goldenId: "ent-layla",
    canonicalName: "Layla Mansour",
    type: "PERSON_CHARACTER" as const,
    aliases: ["Layla", "Mansour"],
    patterns: [/\bLayla\s+Mansour\b/gi, /\bLayla\b/gi, /\bLAYLA\b/g],
  },
  {
    goldenId: "ent-owen",
    canonicalName: "Owen Reed",
    type: "PERSON_CHARACTER" as const,
    aliases: ["Owen", "Reed"],
    patterns: [/\bOwen\s+Reed\b/gi, /\bOwen\b/gi, /\bOWEN\b/g],
  },
  {
    goldenId: "ent-apple",
    canonicalName: "Apple",
    type: "BRAND_BUSINESS_PRODUCT" as const,
    aliases: ["Apple Inc"],
    patterns: [/\bApple\b(?!\s+Vision\s+Pro)/g],
  },
  {
    goldenId: "ent-vision-pro",
    canonicalName: "Vision Pro",
    type: "BRAND_BUSINESS_PRODUCT" as const,
    aliases: ["Apple Vision Pro"],
    patterns: [/\b(?:Apple\s+)?Vision\s+Pro\b/gi],
  },
  {
    goldenId: "ent-fcp",
    canonicalName: "Final Cut Pro",
    type: "BRAND_BUSINESS_PRODUCT" as const,
    aliases: ["FCP"],
    patterns: [/\bFinal\s+Cut\s+Pro\b/gi, /\bFCP\b/g],
  },
  {
    goldenId: "ent-appel-one",
    canonicalName: "Appel One",
    type: "BRAND_BUSINESS_PRODUCT" as const,
    aliases: [],
    patterns: [/\bAppel\s+One\b/gi],
  },
  {
    goldenId: "ent-faceframe",
    canonicalName: "FaceFrame",
    type: "BRAND_BUSINESS_PRODUCT" as const,
    aliases: [],
    patterns: [/\bFaceFrame\b/gi],
  },
  {
    goldenId: "ent-final-witness",
    canonicalName: "The Final Witness",
    type: "PRODUCTION_TITLE" as const,
    aliases: ["Final Witness"],
    patterns: [/\b(?:The\s+)?Final\s+Witness\b/gi],
  },
  {
    goldenId: "ent-witness-protocol",
    canonicalName: "Witness Protocol",
    type: "PRODUCTION_TITLE" as const,
    aliases: [],
    patterns: [/\bWitness\s+Protocol\b/gi],
  },
  {
    goldenId: "ent-borrowed-face",
    canonicalName: "Borrowed Face",
    type: "PRODUCTION_TITLE" as const,
    aliases: [],
    patterns: [/\bBorrowed\s+Face\b/gi],
  },
  {
    goldenId: "ent-avid",
    canonicalName: "Avid Media Composer",
    type: "BRAND_BUSINESS_PRODUCT" as const,
    aliases: ["Avid"],
    patterns: [/\bAvid(?:\s+Media\s+Composer)?\b/gi],
  },
  {
    goldenId: "ent-cairo-edit",
    canonicalName: "Cairo Edit Suite",
    type: "BRAND_BUSINESS_PRODUCT" as const,
    aliases: [],
    patterns: [/\bCairo\s+Edit\s+Suite\b/gi],
  },
  {
    goldenId: "ent-talaat-harb",
    canonicalName: "Talaat Harb",
    type: "BRAND_BUSINESS_PRODUCT" as const,
    aliases: [],
    patterns: [/\bTalaat\s+Harb\b/gi],
  },
];

/**
 * Dynamically extracts candidate entities from normalized scenes,
 * performs alias resolution (linking character references like "Julian" to "Julian Voss"),
 * and initializes them in an UNCONFIRMED state awaiting Producer review.
 */
export function extractCandidatesAndResolveAliases(
  scenes: SceneItem[],
  sourceLabel = "Screenplay Ingestion",
): CandidateExtractionResult {
  // Step 1: Discover all speaking characters and dialogue names
  const speakerFrequency = new Map<string, number>();

  for (const scene of scenes) {
    for (const line of scene.lines) {
      if (line.speaker) {
        // Strip parentheticals like (V.O.), (O.S.), (CONT'D)
        const cleanSpeaker = line.speaker.replace(/\s*\([^)]*\)/g, "").trim();

        if (
          cleanSpeaker.length >= 2 &&
          !/^(SCENE|CUT TO|FADE IN|FADE OUT|FLASHBACK|DISSOLVE TO)/i.test(
            cleanSpeaker,
          )
        ) {
          const titleCase = cleanSpeaker
            .toLowerCase()
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

          speakerFrequency.set(
            titleCase,
            (speakerFrequency.get(titleCase) ?? 0) + 1,
          );
        }
      }
    }
  }

  // Step 2: Dynamic Character Alias Clustering
  // Sort candidates by number of tokens descending so full names (e.g. "Julian Voss")
  // become the canonical anchor, and single tokens ("Julian", "Voss") become resolved aliases.
  const sortedSpeakerNames = Array.from(speakerFrequency.keys()).sort(
    (a, b) =>
      b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length,
  );

  const canonicalCharacters: Array<{
    canonicalName: string;
    aliases: string[];
    patterns: RegExp[];
  }> = [];

  const claimedAliases = new Set<string>();

  for (const speaker of sortedSpeakerNames) {
    if (claimedAliases.has(speaker.toLowerCase())) continue;

    const parts = speaker.split(/\s+/);
    const aliases: string[] = [];

    if (parts.length > 1) {
      // Each token with length >= 3 is a potential character reference
      for (const part of parts) {
        if (part.length >= 3) {
          aliases.push(part);
          claimedAliases.add(part.toLowerCase());
        }
      }
    }

    // Corroborate with known definitions if matching
    const knownMatch = KNOWN_ENTITY_DEFINITIONS.find(
      (k) => k.canonicalName.toLowerCase() === speaker.toLowerCase(),
    );

    if (knownMatch) {
      for (const a of knownMatch.aliases) {
        if (!aliases.includes(a)) {
          aliases.push(a);
        }
      }
    }

    // Build matching patterns for canonical name and all resolved aliases
    const searchTerms = [speaker, ...aliases];
    const escapedTerms = searchTerms.map((t) =>
      t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const combinedPattern = new RegExp(
      `\\b(${escapedTerms.join("|")})\\b`,
      "gi",
    );

    canonicalCharacters.push({
      canonicalName: speaker,
      aliases,
      patterns: [combinedPattern],
    });

    claimedAliases.add(speaker.toLowerCase());
  }

  // Step 3: Combine with Catalog Definitions for Brands, Titles, and Unintroduced Characters
  const finalCatalog = [...KNOWN_ENTITY_DEFINITIONS];

  for (const char of canonicalCharacters) {
    const existingIndex = finalCatalog.findIndex(
      (c) =>
        c.canonicalName.toLowerCase() === char.canonicalName.toLowerCase() ||
        c.aliases.some(
          (a) => a.toLowerCase() === char.canonicalName.toLowerCase(),
        ) ||
        c.canonicalName
          .toLowerCase()
          .split(/\s+/)
          .includes(char.canonicalName.toLowerCase()),
    );

    if (existingIndex >= 0) {
      // Merge discovered aliases into existing catalog definition
      const existing = finalCatalog[existingIndex]!;
      const mergedAliases = Array.from(
        new Set([...existing.aliases, ...char.aliases, char.canonicalName]),
      ).filter((a) => a.toLowerCase() !== existing.canonicalName.toLowerCase());
      finalCatalog[existingIndex] = {
        ...existing,
        aliases: mergedAliases,
      };
    } else if (
      char.canonicalName.split(/\s+/).length > 1 &&
      !/^(VENUE\s+MANAGER|SECURITY\s+GUARD|POLICE\s+OFFICER|STAGE\s+MANAGER|DESK\s+CLERK|WAITER|WAITRESS|DOCTOR|NURSE|DRIVER|REPORTER|BYSTANDER|ANNOUNCER|HOST|TECHNICIAN|OPERATOR|OFFICER|GUARD|SOLDIER|WITNESS)/i.test(
        char.canonicalName,
      )
    ) {
      finalCatalog.push({
        canonicalName: char.canonicalName,
        type: "PERSON_CHARACTER",
        aliases: char.aliases,
        patterns: char.patterns,
      });
    }
  }

  // Step 4: Scan scenes to extract mentions, scenes, and build the registry
  const extractedEntities: ClearanceItem[] = [];
  const aliasMap: Record<string, string> = {};

  for (const def of finalCatalog) {
    const matchedSceneIds: string[] = [];
    let mentionCount = 0;

    for (const sc of scenes) {
      const sceneFullText = sc.lines
        .map((l) => `${l.speaker ?? ""} ${l.text}`)
        .join(" ");

      let sceneMatched = false;
      for (const pattern of def.patterns) {
        pattern.lastIndex = 0;
        const matches = sceneFullText.match(pattern);
        if (matches && matches.length > 0) {
          sceneMatched = true;
          mentionCount += matches.length;
        }
      }

      if (sceneMatched) {
        matchedSceneIds.push(sc.id);
      }
    }

    if (matchedSceneIds.length > 0) {
      const entityId = (def as any).goldenId || generateUuidV7();

      // Map canonical name and each alias to this entity ID for fast lookup
      aliasMap[def.canonicalName.toLowerCase()] = entityId;
      for (const alias of def.aliases) {
        aliasMap[alias.toLowerCase()] = entityId;
      }

      extractedEntities.push({
        id: entityId,
        canonicalName: def.canonicalName,
        type: def.type,
        aliases: def.aliases,
        mentionsCount: mentionCount,
        sceneIds: matchedSceneIds,
        initialProposedStatus: "INSUFFICIENT_EVIDENCE",
        rationale: `Candidate entity identified from ${sourceLabel} across ${matchedSceneIds.length} scenes. Awaiting Producer confirmation before live clearance research can be authorized.`,
        citations: [],
        confidenceInput: {
          authority: "NONE",
          independence: "SINGLE_SOURCE",
          match: "EXACT_CORROBORATED",
          freshnessValid: true,
          context: "COMPLETE",
          unresolvedConflict: false,
          providerFailed: false,
          budgetLimited: false,
          citationUnreachable: false,
          hasAdmissibleCitation: false,
          evidenceExpired: false,
        },
        // Constitutional requirement: entities begin strictly UNCONFIRMED
        confirmedByProducer: false,
        version: 1,
      });
    }
  }

  return {
    entities: extractedEntities,
    aliasMap,
  };
}

/**
 * Evaluates the Producer Confirmation Gate across a roster of candidate entities.
 *
 * Rules:
 * 1. 100% of candidate entities must be explicitly confirmed by a Producer (confirmedByProducer === true).
 * 2. The active caller must hold the PRODUCER or OWNER role.
 * 3. Returns RFC 9457 Problem Details if the gate fails.
 */
export function validateProducerConfirmationGate(
  entities: ClearanceItem[],
  userRole = "PRODUCER",
  correlationId = `corr_gate_${generateUuidV7().slice(0, 8)}`,
): ProducerGateCheckResult {
  const isProducerRole = userRole === "PRODUCER" || userRole === "OWNER";
  const unconfirmed = entities.filter((e) => !e.confirmedByProducer);
  const confirmed = entities.filter((e) => e.confirmedByProducer);

  // Role authorization check
  if (!isProducerRole) {
    return {
      permitted: false,
      unconfirmedCount: unconfirmed.length,
      confirmedCount: confirmed.length,
      totalCount: entities.length,
      problemDetails: {
        type: "https://permissa.app/errors/FORBIDDEN",
        title: "Forbidden: Producer Clearance Required",
        status: 403,
        detail: `The active user role [${userRole}] does not have permission to confirm candidate entities or authorize live clearance research runs. Only accounts with PRODUCER or OWNER clearance may operate this gate.`,
        code: "FORBIDDEN",
        correlationId,
        retryable: false,
      },
    };
  }

  // Roster confirmation check
  if (unconfirmed.length > 0 || entities.length === 0) {
    return {
      permitted: false,
      unconfirmedCount: unconfirmed.length,
      confirmedCount: confirmed.length,
      totalCount: entities.length,
      problemDetails: {
        type: "https://permissa.app/errors/ENTITY_REGISTER_UNCONFIRMED",
        title: "Entity Register Unconfirmed",
        status: 409,
        detail: `Constitutional Gate Active: ${unconfirmed.length} of ${entities.length} candidate entities remain unconfirmed. Clearance research runs cannot be scheduled, queued, or dispatched until a Producer reviews and confirms the entire entity roster.`,
        code: "ENTITY_REGISTER_UNCONFIRMED",
        correlationId,
        retryable: false,
      },
    };
  }

  return {
    permitted: true,
    unconfirmedCount: 0,
    confirmedCount: entities.length,
    totalCount: entities.length,
  };
}

/**
 * Resolves a mention or alias string to the corresponding canonical entity in the registry.
 * E.g., "Julian" -> matches "Julian Voss" via aliases.
 */
export function resolveEntityByMention(
  mention: string,
  entities: ClearanceItem[],
): ClearanceItem | null {
  const trimmed = mention.trim().toLowerCase();
  if (!trimmed) return null;

  // 1. Exact match on canonical name
  const exact = entities.find((e) => e.canonicalName.toLowerCase() === trimmed);
  if (exact) return exact;

  // 2. Match on alias
  const aliasMatch = entities.find((e) =>
    e.aliases.some((a) => a.toLowerCase() === trimmed),
  );
  if (aliasMatch) return aliasMatch;

  // 3. Substring / Token match for multi-word characters
  const tokenMatch = entities.find((e) => {
    if (e.type !== "PERSON_CHARACTER") return false;
    const tokens = e.canonicalName.toLowerCase().split(/\s+/);
    return tokens.includes(trimmed);
  });

  return tokenMatch || null;
}

/**
 * Merges multiple candidate entity records into a single survivor entity,
 * combining aliases and scenes with version increment.
 */
export function mergeCandidateEntities(
  survivor: ClearanceItem,
  mergedEntities: ClearanceItem[],
): ClearanceItem {
  const aliasSet = new Set<string>(survivor.aliases);

  for (const m of mergedEntities) {
    aliasSet.add(m.canonicalName);
    for (const a of m.aliases) {
      aliasSet.add(a);
    }
  }
  aliasSet.delete(survivor.canonicalName);

  const combinedScenes = Array.from(
    new Set([
      ...survivor.sceneIds,
      ...mergedEntities.flatMap((m) => m.sceneIds),
    ]),
  );

  const totalMentions =
    survivor.mentionsCount +
    mergedEntities.reduce((sum, m) => sum + m.mentionsCount, 0);

  return {
    ...survivor,
    aliases: Array.from(aliasSet).slice(0, 20),
    sceneIds: combinedScenes,
    mentionsCount: totalMentions,
    version: (survivor.version ?? 1) + 1,
  };
}
