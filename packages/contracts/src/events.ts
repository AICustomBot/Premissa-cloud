import { z } from "zod";
import { IsoDateTime } from "./common";
import { OrganizationId, ProjectId, RunId } from "./ids";

/** Safe projection for the browser timeline. Content-free by contract. */
export const ActivityEventType = z.enum([
  "RUN_CREATED",
  "RUN_QUEUED",
  "PREFLIGHT_PASSED",
  "PREFLIGHT_DEGRADED",
  "PREFLIGHT_BLOCKED",
  "SPECIALIST_STARTED",
  "SPECIALIST_COMPLETED",
  "SEARCH_COMPLETED",
  "SEARCH_FAILED",
  "EVIDENCE_GATE_ACCEPTED",
  "EVIDENCE_GATE_DOWNGRADED",
  "EVIDENCE_GATE_REJECTED",
  "CHECKPOINT_SAVED",
  "BUDGET_THRESHOLD_REACHED",
  "RUN_PAUSED",
  "RUN_RESUMED",
  "RUN_CANCELLED",
  "DRAFT_READY",
  "REVIEW_REQUESTED",
  "REVIEW_RETURNED",
  "REVIEW_APPROVED",
  "INJECTION_ATTEMPT_IGNORED",
]);

export const ActivityEvent = z.object({
  eventId: z.string(),
  eventType: ActivityEventType,
  schemaVersion: z.string(),
  occurredAt: IsoDateTime,
  organizationId: OrganizationId,
  projectId: ProjectId,
  runId: RunId,
  correlationId: z.string(),
  sequence: z.number().int().nonnegative(),
  milestone: z.boolean(),
  metadata: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
});

export type ActivityEventType = z.infer<typeof ActivityEventType>;
export type ActivityEvent = z.infer<typeof ActivityEvent>;

