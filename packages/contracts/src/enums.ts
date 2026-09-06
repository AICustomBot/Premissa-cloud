import { z } from "zod";

export const EntityType = z.enum([
  "PERSON_CHARACTER",
  "BRAND_BUSINESS_PRODUCT",
  "PRODUCTION_TITLE",
]);

export const FindingStatus = z.enum([
  "RESEARCH_CLEARED",
  "NEEDS_LICENCE",
  "NEEDS_REWRITE",
  "BLOCKED",
  "INSUFFICIENT_EVIDENCE",
]);

export const ConfidenceBand = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const SourceTier = z.enum(["TIER_1", "TIER_2", "TIER_3"]);

export const ClaimType = z.enum(["CURRENT_STATUS", "HISTORICAL"]);

export const RunState = z.enum([
  "CREATED",
  "QUEUED",
  "PREFLIGHT",
  "RUNNING",
  "PAUSED_FAILURE",
  "PAUSED_BUDGET",
  "CANCELLED_PARTIAL",
  "DRAFT_READY",
  "PRODUCER_REVIEW",
  "CHANGES_REQUESTED",
  "PROFESSIONAL_REVIEW",
  "APPROVED",
]);

export const UploadState = z.enum([
  "INITIATED",
  "UPLOADED",
  "VALIDATING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
]);

export const InvitationState = z.enum([
  "ISSUED",
  "ACCEPTED",
  "EXPIRED",
  "REVOKED",
]);

export const Role = z.enum(["OWNER", "PRODUCER", "REVIEWER"]);

export const Jurisdiction = z.enum(["US"]);

export const SourceType = z.enum(["PDF", "FDX"]);

export const ReasonCode = z.enum([
  "EVIDENCE_MISSING",
  "EVIDENCE_WEAK",
  "EVIDENCE_CONFLICT",
  "EVIDENCE_EXPIRED",
  "EVIDENCE_NOT_INDEPENDENT",
  "ENTITY_MATCH_WEAK",
  "CONTEXT_INCOMPLETE",
  "SOURCE_TIER_INSUFFICIENT",
  "BUDGET_LIMIT",
  "PROVIDER_FAILED",
  "LICENCE_SIGNAL_SUPPORTED",
  "REWRITE_PATH_SUPPORTED",
  "STRONG_CONFLICT",
  "SEVERE_CONTEXT",
  "PROFESSIONAL_CONFIRMATION_REQUIRED",
  "PUBLICATION_DATE_UNKNOWN",
  "CITATION_UNREACHABLE",
  "RETRIEVAL_AGE_EXCEEDED",
  "REGISTRY_REFRESH_REQUIRED",
  "CURRENT_SOURCE_TOO_OLD",
  "HISTORICAL_PRIMARY_ACCEPTED",
  "DISCOVERY_SOURCE_ONLY",
  "CONFIDENCE_BELOW_CLEARED_THRESHOLD",
]);
