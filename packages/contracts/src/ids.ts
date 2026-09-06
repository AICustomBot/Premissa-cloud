import { z } from "zod";

/** UUIDv7, generated server-side. Opaque to clients. */
export const Uuid = z
  .string()
  .uuid()
  .refine((value) => value[14] === "7", {
    message: "identifier must be UUIDv7",
  });

export const OrganizationId = Uuid;
export const ProjectId = Uuid;
export const ScriptVersionId = Uuid;
export const SceneId = Uuid;
export const EntityId = Uuid;
export const RunId = Uuid;
export const ResearchTaskId = Uuid;
export const CitationId = Uuid;
export const FindingId = Uuid;
export const ReviewId = Uuid;
export const ReportId = Uuid;
export const LedgerEntryId = Uuid;
export const IdempotencyKey = z.string().min(16).max(128);

/**
 * Server-side UUIDv7 generator conforming to RFC 9562.
 */
export function generateUuidV7(): string {
  const now = Date.now();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // 48-bit timestamp (big-endian)
  bytes[0] = Math.floor(now / 0x10000000000) & 0xff;
  bytes[1] = Math.floor(now / 0x100000000) & 0xff;
  bytes[2] = Math.floor(now / 0x1000000) & 0xff;
  bytes[3] = Math.floor(now / 0x10000) & 0xff;
  bytes[4] = Math.floor(now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  // Version 7 in bits 48..51: 0111
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  // Variant RFC 4122 in bits 64..65: 10
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
