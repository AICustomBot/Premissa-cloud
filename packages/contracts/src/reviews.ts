import { z } from "zod";
import { IsoDateTime } from "./common";
import { FindingStatus, InvitationState, Role } from "./enums";
import { FindingId, ProjectId, ReportId, ReviewId, RunId } from "./ids";

export const CreateInvitationRequest = z.object({
  projectId: ProjectId,
  reviewerEmail: z.string().email(),
  role: z.literal(Role.Enum.REVIEWER),
});

export const Invitation = z.object({
  id: z.string(),
  projectId: ProjectId,
  reviewerEmailNormalized: z.string().email(),
  state: InvitationState,
  expiresAt: IsoDateTime,
  acceptUrl: z.string().url(),
});

/** A reviewer may change status only alongside admissible new evidence. */
export const ReviewFindingChange = z.object({
  findingId: FindingId,
  expectedVersion: z.number().int().nonnegative(),
  newStatus: FindingStatus,
  reason: z.string().min(10).max(1000),
  addedCitationUrls: z.array(z.string().url()).max(10).default([]),
});

export const SubmitReviewRequest = z.object({
  runId: RunId,
  changes: z.array(ReviewFindingChange).max(50),
});

export const ReviewDecisionRequest = z.object({
  reviewId: ReviewId,
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().min(10).max(1000),
});

export const ReportVersion = z.object({
  id: ReportId,
  projectId: ProjectId,
  runId: RunId,
  versionNumber: z.number().int().positive(),
  approvedAt: IsoDateTime,
  pdfAvailable: z.boolean(),
});

export const ReportSummary = z.object({
  totalEntities: z.number().int().nonnegative(),
  clearedCount: z.number().int().nonnegative(),
  licenceRequiredCount: z.number().int().nonnegative(),
  rewriteRequiredCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  insufficientEvidenceCount: z.number().int().nonnegative(),
  overallRiskLevel: z.enum(["CLEAR", "LOW", "ELEVATED", "CRITICAL"]),
});

export const ReportFindingItem = z.object({
  findingId: FindingId,
  entityId: z.string(),
  entityName: z.string().default("Unknown Entity"),
  entityType: z.string().default("UNKNOWN"),
  status: FindingStatus.default("INSUFFICIENT_EVIDENCE"),
  confidenceScore: z.number().default(0),
  confidenceBand: z.string().default("LOW"),
  rationale: z.string().default(""),
  rewriteSuggestion: z.string().nullable().optional(),
  citationsCount: z.number().int().nonnegative().default(0),
});

export const ReportVerification = z.object({
  contentDigestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  algorithm: z.literal("SHA-256"),
  archivalWatermark: z.string(),
  certificateUrl: z.string().optional(),
});

export const ClearanceReport = z.object({
  id: ReportId,
  projectId: ProjectId,
  runId: RunId,
  versionNumber: z.number().int().positive(),
  title: z.string(),
  jurisdiction: z.string(),
  generatedAt: IsoDateTime,
  approvedAt: IsoDateTime.nullable(),
  approvedBy: z.string().nullable(),
  scriptChecksumSha256: z.string().default(""),
  summary: ReportSummary,
  findings: z.array(ReportFindingItem),
  verification: ReportVerification,
  pdfAvailable: z.boolean().default(true),
});

export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequest>;
export type Invitation = z.infer<typeof Invitation>;
export type ReviewFindingChange = z.infer<typeof ReviewFindingChange>;
export type SubmitReviewRequest = z.infer<typeof SubmitReviewRequest>;
export type ReviewDecisionRequest = z.infer<typeof ReviewDecisionRequest>;
export type ReportVersion = z.infer<typeof ReportVersion>;
export type ReportSummary = z.infer<typeof ReportSummary>;
export type ReportFindingItem = z.infer<typeof ReportFindingItem>;
export type ReportVerification = z.infer<typeof ReportVerification>;
export type ClearanceReport = z.infer<typeof ClearanceReport>;
