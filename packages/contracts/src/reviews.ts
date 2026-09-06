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
