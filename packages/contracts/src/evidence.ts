import { z } from "zod";
import { IsoDateTime } from "./common";
import { ClaimType, ConfidenceBand, ReasonCode, SourceTier } from "./enums";
import { CitationId, EntityId, ResearchTaskId } from "./ids";

export const Citation = z.object({
  id: CitationId,
  taskId: ResearchTaskId,
  originalUrl: z.string().url(),
  resolvedUrl: z.string().url(),
  resolvedDomain: z.string(),
  controllingOwner: z.string().nullable(),
  title: z.string(),
  excerpt: z.string().max(1200),
  sourceTier: SourceTier,
  claimType: ClaimType,
  query: z.string(),
  publishedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime.nullable(),
  retrievedAt: IsoDateTime,
  registryRecordId: z.string().nullable(),
  contentHash: z.string(),
  reachable: z.boolean(),
});

export const ConfidenceFactors = z.object({
  authority: z.number().int().min(0).max(40),
  independence: z.number().int().min(0).max(20),
  entityMatch: z.number().int().min(0).max(20),
  freshness: z.number().int().min(0).max(10),
  context: z.number().int().min(0).max(10),
});

export const ConfidenceResult = z.object({
  formulaVersion: z.string(),
  rawScore: z.number().int().min(0).max(100),
  finalScore: z.number().int().min(0).max(100),
  band: ConfidenceBand,
  factors: ConfidenceFactors,
  caps: z.array(z.string()),
  invalidations: z.array(z.string()),
  reasonCodes: z.array(ReasonCode),
});

/** Model output. Advisory only: it never sets the admitted status or score. */
export const SpecialistProposal = z.object({
  entityId: EntityId,
  proposedStatus: z.enum([
    "RESEARCH_CLEARED",
    "NEEDS_LICENCE",
    "NEEDS_REWRITE",
    "BLOCKED",
    "INSUFFICIENT_EVIDENCE",
  ]),
  rationale: z.string().max(2000),
  citationIds: z.array(CitationId),
  conflictsDetected: z.boolean(),
  severeContext: z.boolean(),
  entityMatchQuality: z.enum([
    "EXACT_CORROBORATED",
    "STRONG",
    "PARTIAL",
    "WEAK",
  ]),
  contextComplete: z.boolean(),
  rewritePath: z.string().max(600).nullable(),
  licenceSignal: z.string().max(600).nullable(),
});

export type Citation = z.infer<typeof Citation>;
export type ConfidenceFactors = z.infer<typeof ConfidenceFactors>;
export type ConfidenceResult = z.infer<typeof ConfidenceResult>;
export type SpecialistProposal = z.infer<typeof SpecialistProposal>;
