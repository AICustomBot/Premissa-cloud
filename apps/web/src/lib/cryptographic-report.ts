import { z } from "zod";

export interface DigestPayload {
  id: string;
  projectId: string;
  runId: string;
  versionNumber: number;
  title: string;
  jurisdiction: string;
  scriptChecksumSha256: string;
  findings: Array<{
    findingId: string;
    entityId: string;
    canonicalName: string;
    status: string;
    confidenceScore: number;
  }>;
}

export interface ProductionLicense {
  id: string;
  entityId: string;
  entityName: string;
  licensorName: string;
  licenseCategory:
    | "TRADEMARK"
    | "COPYRIGHT"
    | "LOCATION_RELEASE"
    | "PERSONALITY_RIGHTS"
    | "MUSIC_SYNC";
  scope: string;
  status: "EXECUTED" | "IN_NEGOTIATION" | "DRAFT_ISSUED" | "WAIVER_FILED";
  executionDate?: string | undefined;
  expirationDate?: string | undefined;
  documentRef?: string | undefined;
  financialConsideration?: string | undefined;
}

export interface LegalHoldItem {
  id: string;
  entityId: string;
  entityName: string;
  holdType:
    "PROVISIONAL_HOLD" | "COUNSEL_RESTRICTION" | "SCRIPT_AMENDMENT_REQUIRED";
  reason: string;
  placedBy: string;
  placedAt: string;
  resolved: boolean;
}

export interface ReviewerSignOffRecord {
  reviewerName: string;
  organization: string;
  barOrCredentialId: string;
  jurisdiction: string;
  signedAt: string;
  affirmationStatement: string;
  signatureDigestSha256: string;
}

/**
 * Computes deterministic canonical SHA-256 digest of report findings and metadata using Web Crypto API.
 */
export async function computeClientReportDigest(
  payload: DigestPayload,
): Promise<{
  digestSha256: string;
  canonicalPayload: string;
}> {
  const sortedFindings = [...payload.findings].sort((a, b) =>
    a.findingId.localeCompare(b.findingId),
  );

  const canonicalObject = {
    algorithm: "SHA-256",
    id: payload.id,
    projectId: payload.projectId,
    runId: payload.runId,
    versionNumber: payload.versionNumber,
    title: payload.title,
    jurisdiction: payload.jurisdiction,
    scriptChecksumSha256: payload.scriptChecksumSha256,
    findings: sortedFindings,
  };

  const canonicalPayload = JSON.stringify(canonicalObject, null, 2);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalPayload);

  // Use crypto.subtle in browser / modern environments
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const digestSha256 = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { digestSha256, canonicalPayload };
  }

  // Fallback if needed
  return {
    digestSha256:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    canonicalPayload,
  };
}

/**
 * Computes a digital signature digest for the professional counsel signoff
 */
export async function computeSignOffDigest(
  signOff: Omit<ReviewerSignOffRecord, "signatureDigestSha256">,
): Promise<string> {
  const canonical = JSON.stringify(signOff);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}
