import { z } from "zod";

export const ErrorCode = z.enum([
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "UPLOAD_EXPIRED",
  "FILE_TYPE_INVALID",
  "FILE_SIGNATURE_INVALID",
  "PAGE_LIMIT_EXCEEDED",
  "PDF_LOCKED",
  "FDX_PARSE_FAILED",
  "ENTITY_REGISTER_UNCONFIRMED",
  "ENTITY_LIMIT_EXCEEDED",
  "RUN_ALREADY_ACTIVE",
  "RUN_QUOTA_EXCEEDED",
  "GEMINI_UNAVAILABLE",
  "PARALLEL_UNAVAILABLE",
  "GRAFANA_DEGRADED",
  "PREFLIGHT_BLOCKED",
  "EVIDENCE_INSUFFICIENT",
  "EVIDENCE_CONFLICT",
  "BUDGET_EXCEEDED",
  "RUN_TIMEOUT",
  "INVALID_STATE_TRANSITION",
  "VERSION_CONFLICT",
  "CURSOR_INVALID",
  "VALIDATION_FAILED",
]);

/** RFC 9457 Problem Details. `detail` must be user-safe and content-free. */
export const ProblemDetails = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string(),
  instance: z.string().optional(),
  code: ErrorCode,
  correlationId: z.string(),
  retryable: z.boolean(),
  errors: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

export type ProblemDetails = z.infer<typeof ProblemDetails>;
