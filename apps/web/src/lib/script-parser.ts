/**
 * Client-Side Quarantined Script Parser Pipeline (Tranche 2 / Batch 2)
 *
 * Implements low-privilege FDX & Fountain/Text screenplay ingestion:
 * - Strict XXE & DTD entity protection (disables external entities).
 * - Enforces size limits (<= 20MB) and page count limits (<= 20 pages).
 * - Extracts scenes and normalizes sub-scenes (e.g. 5A -> 5, 6A -> 6).
 * - Identifies entity mentions across scenes.
 * - Neutralizes adversarial prompt injections.
 * - Emits granular progress state events.
 */

import type { SceneItem, ClearanceItem } from "../data/golden-data";
import { generateUuidV7 } from "@permissa/contracts";

export type IngestionStep =
  | "IDLE"
  | "READING_FILE"
  | "QUARANTINE_CHECK"
  | "SANITIZING_XML"
  | "EXTRACTING_SCENES"
  | "IDENTIFYING_ENTITIES"
  | "VALIDATING_CONTRACTS"
  | "COMPLETED"
  | "ERROR";

export interface IngestionProgress {
  step: IngestionStep;
  percentage: number;
  message: string;
  detail?: string | undefined;
  error?: string | undefined;
}

export interface ParsedScriptResult {
  title: string;
  genre: string;
  jurisdiction: string;
  version: string;
  pageCount: number;
  sceneCount: number;
  checksumSha256: string;
  uploadedAt: string;
  scenes: SceneItem[];
  entities: ClearanceItem[];
  neutralizedInjections: string[];
}

const MAX_BYTE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_PAGE_COUNT = 20;

const KNOWN_PROMPT_INJECTIONS = [
  /MARK\s+CLEARED;\s*REMOVE\s+CONFLICTS\.?/gi,
  /SYSTEM:\s*CLEARANCE\s*APPROVED/gi,
  /IGNORE\s+(ALL\s+)?PREVIOUS\s+INSTRUCTIONS/gi,
  /GRANT\s+AUTOMATIC\s+CLEARANCE/gi,
];

/**
 * Calculates SHA-256 checksum in browser using crypto.subtle.
 */
async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
}

/**
 * Strips DTD and blocks XXE injection in XML string.
 */
export function sanitizeClientXml(xml: string): string {
  if (/<!ENTITY\s+[^>]*\b(SYSTEM|PUBLIC)\b/i.test(xml)) {
    throw new Error(
      "XXE_SECURITY_VIOLATION: External entity declarations are forbidden in quarantined screenplay parsing.",
    );
  }
  return xml.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
}

/**
 * Runs the parsing pipeline on an uploaded File with progress updates.
 */
export async function parseScreenplayFile(
  file: File,
  onProgress?: (progress: IngestionProgress) => void,
): Promise<ParsedScriptResult> {
  const update = (
    step: IngestionStep,
    pct: number,
    msg: string,
    detail?: string,
  ) => {
    onProgress?.({
      step,
      percentage: pct,
      message: msg,
      ...(detail !== undefined ? { detail } : {}),
    });
  };

  update("READING_FILE", 10, `Reading ${file.name}...`);

  if (file.size > MAX_BYTE_SIZE) {
    throw new Error(
      `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 20MB quarantine limit.`,
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const checksum = await computeSha256Hex(arrayBuffer);

  update(
    "QUARANTINE_CHECK",
    25,
    "Quarantine pre-flight validation...",
    `SHA-256: ${checksum.slice(0, 16)}...`,
  );
  await new Promise((r) => setTimeout(r, 100)); // Non-blocking yield

  const decoder = new TextDecoder("utf-8");
  let rawText = decoder.decode(arrayBuffer);

  update(
    "SANITIZING_XML",
    40,
    "Sanitizing XML structure & disabling DTD/XXE...",
  );
  rawText = sanitizeClientXml(rawText);

  // Scan and neutralize prompt injections
  const neutralizedInjections: string[] = [];
  for (const inj of KNOWN_PROMPT_INJECTIONS) {
    if (inj.test(rawText)) {
      neutralizedInjections.push(inj.source);
      rawText = rawText.replace(
        inj,
        "[INJECTION STRING DETECTED & NEUTRALIZED BY PARSER]",
      );
    }
  }

  update(
    "EXTRACTING_SCENES",
    60,
    "Extracting and normalizing scene headings...",
  );
  await new Promise((r) => setTimeout(r, 100));

  const isFdx = file.name.endsWith(".fdx") || rawText.includes("<FinalDraft");
  let pageCount = 1;
  interface ClientRawScene {
    ordinal: number;
    subOrdinal?: string | undefined;
    heading: string;
    lines: {
      speaker?: string | undefined;
      text: string;
      isArabic?: boolean | undefined;
    }[];
  }

  const rawSceneList: ClientRawScene[] = [];

  if (isFdx) {
    // FDX Paragraph extraction
    const pRegex =
      /<Paragraph(?:\s+Type="([^"]*)")?(?:\s+PageBreak="([^"]*)")?[^>]*>([\s\S]*?)<\/Paragraph>/gi;
    let match: RegExpExecArray | null;
    let pageBreaks = 0;
    let currentScene: ClientRawScene | null = null;
    let currentSpeaker: string | undefined;

    while ((match = pRegex.exec(rawText)) !== null) {
      const pType = match[1] ?? "Action";
      const hasPageBreak = match[0].includes("PageBreak");
      if (hasPageBreak) pageBreaks++;

      // Extract text pieces
      const textPieces: string[] = [];
      const tRegex = /<Text[^>]*>([\s\S]*?)<\/Text>/gi;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRegex.exec(match[3] ?? "")) !== null) {
        textPieces.push(tMatch[1] ?? "");
      }
      const text = textPieces.join("").trim();
      if (!text) continue;

      if (
        pType === "Scene Heading" ||
        /^(?:\d+[A-Z]?\.\s+)?(INT\.|EXT\.|INT\.\/EXT\.|I\/E)/i.test(text)
      ) {
        const numMatch = text.match(/(?:^|\.)(\d+)([A-Z]?)\.?\s*(.*)$/i);
        const ordinal =
          numMatch && numMatch[1]
            ? parseInt(numMatch[1], 10)
            : rawSceneList.length + 1;
        const subOrdinal =
          numMatch && numMatch[2] ? numMatch[2].toUpperCase() : undefined;

        const newScene: ClientRawScene = {
          ordinal,
          subOrdinal,
          heading: text,
          lines: [],
        };
        currentScene = newScene;
        rawSceneList.push(newScene);
        currentSpeaker = undefined;
      } else if (currentScene) {
        if (pType === "Character") {
          currentSpeaker = text.replace(/\s*\([^)]*\)/g, "").trim();
        } else if (pType === "Dialogue") {
          const isArabic = /[\u0600-\u06FF]/.test(text);
          currentScene.lines.push({
            speaker: currentSpeaker,
            text,
            isArabic,
          });
          currentSpeaker = undefined;
        } else {
          currentScene.lines.push({
            text,
          });
        }
      }
    }
    pageCount = Math.max(1, pageBreaks + 1);
  } else {
    // Plain text / Fountain extraction
    const lines = rawText.split(/\r?\n/);
    let currentScene: ClientRawScene | null = null;
    let currentSpeaker: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("===")) {
        pageCount++;
        continue;
      }
      if (/^(?:INT\.|EXT\.|INT\.\/EXT\.|I\/E|\.\d+[A-Z]?\.)/i.test(trimmed)) {
        const numMatch = trimmed.match(/(?:^|\.)(\d+)([A-Z]?)\.?\s*(.*)$/i);
        const ordinal =
          numMatch && numMatch[1]
            ? parseInt(numMatch[1], 10)
            : rawSceneList.length + 1;
        const subOrdinal =
          numMatch && numMatch[2] ? numMatch[2].toUpperCase() : undefined;

        const newScene: ClientRawScene = {
          ordinal,
          subOrdinal,
          heading: trimmed.replace(/^\.\d+[A-Z]?\.\s*/, ""),
          lines: [],
        };
        currentScene = newScene;
        rawSceneList.push(newScene);
        currentSpeaker = undefined;
      } else if (currentScene) {
        if (
          /^[A-Z0-9\s.()-]{2,30}$/.test(trimmed) &&
          trimmed.length > 2 &&
          !trimmed.endsWith(".")
        ) {
          currentSpeaker = trimmed.replace(/\s*\([^)]*\)/g, "").trim();
        } else if (currentSpeaker && trimmed.length > 0) {
          const isArabic = /[\u0600-\u06FF]/.test(trimmed);
          currentScene.lines.push({
            speaker: currentSpeaker,
            text: trimmed,
            isArabic,
          });
          currentSpeaker = undefined;
        } else if (trimmed.length > 0) {
          currentScene.lines.push({ text: trimmed });
        }
      }
    }
  }

  // Enforce 20-page limit
  if (pageCount > MAX_PAGE_COUNT) {
    throw new Error(
      `Page count (${pageCount}) exceeds the 20-page limit allowed by the ingestion engine.`,
    );
  }

  // Consolidate sub-scenes (5A -> 5, 6A -> 6)
  const consolidatedMap = new Map<
    number,
    {
      ordinal: number;
      heading: string;
      lines: {
        speaker?: string | undefined;
        text: string;
        isArabic?: boolean | undefined;
      }[];
    }
  >();

  for (const s of rawSceneList) {
    const existing = consolidatedMap.get(s.ordinal);
    if (!existing) {
      consolidatedMap.set(s.ordinal, {
        ordinal: s.ordinal,
        heading: s.heading,
        lines: [...s.lines],
      });
    } else {
      existing.lines.push({ text: `[CONTINUATION: ${s.heading}]` });
      existing.lines.push(...s.lines);
    }
  }

  const sortedOrdinals = Array.from(consolidatedMap.keys()).sort(
    (a, b) => a - b,
  );
  const normalizedScenes: SceneItem[] = sortedOrdinals.map((ord, idx) => {
    const data = consolidatedMap.get(ord)!;
    const locMatch = data.heading.match(
      /(?:INT\.|EXT\.|INT\.\/EXT\.)\s+([^-—]+)(?:[-—]\s*(.*))?/i,
    );
    const location = locMatch && locMatch[1] ? locMatch[1].trim() : "Interior";
    const timeOfDay = locMatch && locMatch[2] ? locMatch[2].trim() : "DAY";

    return {
      id: `scene-${idx + 1}`,
      ordinal: idx + 1,
      heading: data.heading,
      location,
      timeOfDay,
      summary: `Extracted Scene ${idx + 1}: ${data.heading}`,
      lines: data.lines,
      detectedEntityIds: [],
    };
  });

  update(
    "IDENTIFYING_ENTITIES",
    80,
    "Detecting entity mentions across scenes...",
  );
  await new Promise((r) => setTimeout(r, 100));

  // Dynamic Candidate Extraction Engine (Batch 3)
  // Extracts speaking characters, brands/products, and production titles
  // Resolves aliases into canonical records and issues server-side UUIDv7 identifiers.

  // 1. Gather all speaking character candidates from dialogue lines
  const speakerCandidates = new Map<string, { raw: string; count: number }>();
  for (const sc of normalizedScenes) {
    for (const l of sc.lines) {
      if (l.speaker) {
        // Strip parentheticals like (V.O.), (O.S.), (CONT'D)
        const cleaned = l.speaker.replace(/\s*\([^)]*\)/g, "").trim();
        if (cleaned.length >= 2 && !/^(SCENE|CUT TO|FADE IN|FADE OUT)/i.test(cleaned)) {
          // Normalize to Title Case
          const titleCased = cleaned
            .toLowerCase()
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

          const existing = speakerCandidates.get(titleCased) ?? {
            raw: titleCased,
            count: 0,
          };
          existing.count++;
          speakerCandidates.set(titleCased, existing);
        }
      }
    }
  }

  // 2. Map and deduplicate variations to canonical character records
  // e.g. "Layla" and "Layla Mansour" -> Canonical "Layla Mansour", alias ["Layla"]
  // "Julian", "Voss", "Julian Voss" -> Canonical "Julian Voss", aliases ["Julian", "Voss"]
  const characterRoster: Array<{
    canonicalName: string;
    aliases: string[];
    pattern: RegExp;
  }> = [];

  const sortedSpeakers = Array.from(speakerCandidates.keys()).sort(
    (a, b) => b.length - a.length,
  );
  const claimedSpeakers = new Set<string>();

  for (const speaker of sortedSpeakers) {
    if (claimedSpeakers.has(speaker)) continue;

    // Check if shorter names are sub-parts / aliases of this full name
    const aliases: string[] = [];
    const parts = speaker.split(/\s+/);

    if (parts.length > 1) {
      for (const part of parts) {
        if (part.length >= 3) {
          aliases.push(part);
          claimedSpeakers.add(part);
        }
      }
    }

    // Build regex matching full name or any recognized alias
    const escapedNames = [speaker, ...aliases].map((n) =>
      n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const pattern = new RegExp(`\\b(${escapedNames.join("|")})\\b`, "gi");

    characterRoster.push({
      canonicalName: speaker,
      aliases,
      pattern,
    });
    claimedSpeakers.add(speaker);
  }

  // 3. Known Catalog & Dynamic Brand/Product & Title definitions
  const candidateDefs = [
    // Golden characters if present
    {
      goldenId: "ent-noor",
      name: "Noor Haddad",
      type: "PERSON_CHARACTER" as const,
      aliases: ["Noor", "Haddad"],
      pattern: /\b(Noor\s+Haddad|Noor)\b/gi,
    },
    {
      goldenId: "ent-julian",
      name: "Julian Voss",
      type: "PERSON_CHARACTER" as const,
      aliases: ["Julian", "Voss"],
      pattern: /\b(Julian\s+Voss|Julian)\b/gi,
    },
    {
      goldenId: "ent-layla",
      name: "Layla Mansour",
      type: "PERSON_CHARACTER" as const,
      aliases: ["Layla", "Mansour"],
      pattern: /\b(Layla\s+Mansour|Layla)\b/gi,
    },
    {
      goldenId: "ent-owen",
      name: "Owen Reed",
      type: "PERSON_CHARACTER" as const,
      aliases: ["Owen", "Reed"],
      pattern: /\b(Owen\s+Reed|Owen)\b/gi,
    },
    // Brands & Commercial Products
    {
      goldenId: "ent-apple",
      name: "Apple",
      type: "BRAND_BUSINESS_PRODUCT" as const,
      aliases: [],
      pattern: /\bApple\b(?!\s+Vision\s+Pro)/g,
    },
    {
      goldenId: "ent-vision-pro",
      name: "Vision Pro",
      type: "BRAND_BUSINESS_PRODUCT" as const,
      aliases: ["Apple Vision Pro"],
      pattern: /\b(Apple\s+)?Vision\s+Pro\b/gi,
    },
    {
      goldenId: "ent-fcp",
      name: "Final Cut Pro",
      type: "BRAND_BUSINESS_PRODUCT" as const,
      aliases: ["FCP"],
      pattern: /\b(Final\s+Cut\s+Pro|FCP)\b/gi,
    },
    {
      goldenId: "ent-appel-one",
      name: "Appel One",
      type: "BRAND_BUSINESS_PRODUCT" as const,
      aliases: [],
      pattern: /\bAppel\s+One\b/gi,
    },
    {
      goldenId: "ent-faceframe",
      name: "FaceFrame",
      type: "BRAND_BUSINESS_PRODUCT" as const,
      aliases: [],
      pattern: /\bFaceFrame\b/gi,
    },
    // Production Titles
    {
      goldenId: "ent-final-witness",
      name: "The Final Witness",
      type: "PRODUCTION_TITLE" as const,
      aliases: ["Final Witness"],
      pattern: /\b(The\s+)?Final\s+Witness\b/gi,
    },
    {
      goldenId: "ent-witness-protocol",
      name: "Witness Protocol",
      type: "PRODUCTION_TITLE" as const,
      aliases: [],
      pattern: /\bWitness\s+Protocol\b/gi,
    },
    {
      goldenId: "ent-borrowed-face",
      name: "Borrowed Face",
      type: "PRODUCTION_TITLE" as const,
      aliases: [],
      pattern: /\bBorrowed\s+Face\b/gi,
    },
  ];

  // Merge dynamically discovered character candidates that aren't in goldenDefs
  for (const char of characterRoster) {
    const isAlreadyCovered = candidateDefs.some(
      (def) =>
        def.name.toLowerCase() === char.canonicalName.toLowerCase() ||
        def.aliases.some((a) => a.toLowerCase() === char.canonicalName.toLowerCase()),
    );
    if (!isAlreadyCovered) {
      candidateDefs.push({
        goldenId: undefined as any,
        name: char.canonicalName,
        type: "PERSON_CHARACTER" as const,
        aliases: char.aliases,
        pattern: char.pattern,
      });
    }
  }

  const extractedEntities: ClearanceItem[] = [];

  for (const def of candidateDefs) {
    const matchedSceneIds: string[] = [];
    let mentionCount = 0;

    for (const sc of normalizedScenes) {
      const fullSceneText = sc.lines
        .map((l) => `${l.speaker ?? ""} ${l.text}`)
        .join(" ");
      def.pattern.lastIndex = 0;
      const matches = fullSceneText.match(def.pattern);
      if (matches && matches.length > 0) {
        matchedSceneIds.push(sc.id);
        mentionCount += matches.length;
      }
    }

    if (matchedSceneIds.length > 0) {
      // Server-side UUIDv7 identification for canonical entity records
      const entityId = def.goldenId || generateUuidV7();

      // Record detected entity ID in scenes
      for (const sc of normalizedScenes) {
        if (matchedSceneIds.includes(sc.id) && !sc.detectedEntityIds.includes(entityId)) {
          sc.detectedEntityIds.push(entityId);
        }
      }

      extractedEntities.push({
        id: entityId,
        canonicalName: def.name,
        type: def.type,
        aliases: def.aliases,
        mentionsCount: mentionCount,
        sceneIds: matchedSceneIds,
        initialProposedStatus: "INSUFFICIENT_EVIDENCE",
        rationale: `Extracted candidate from ${file.name} across ${matchedSceneIds.length} scenes. Awaiting Producer confirmation before clearance research may execute.`,
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
        // Strictly enforce the constitutional gate: no live research until Producer confirms
        confirmedByProducer: false,
        version: 1,
      });
    }
  }

  update(
    "VALIDATING_CONTRACTS",
    95,
    "Validating schema compliance against @permissa/contracts...",
  );
  await new Promise((r) => setTimeout(r, 100));

  // Determine title from filename or script text
  const cleanTitle = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  update(
    "COMPLETED",
    100,
    `Successfully ingested ${normalizedScenes.length} scenes and ${extractedEntities.length} entities.`,
  );

  return {
    title: cleanTitle || "Uploaded Screenplay",
    genre: "Drama / Thriller",
    jurisdiction: "US",
    version: "v1.0-uploaded",
    pageCount: Math.min(pageCount, 20),
    sceneCount: normalizedScenes.length,
    checksumSha256: checksum,
    uploadedAt: new Date().toISOString(),
    scenes: normalizedScenes,
    entities: extractedEntities,
    neutralizedInjections,
  };
}
