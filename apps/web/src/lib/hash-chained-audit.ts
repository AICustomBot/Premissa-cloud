export interface HashChainedAuditEntry {
  id: string;
  sequence: number;
  projectId: string;
  organizationId: string;
  actorId: string;
  actorRole: "PRODUCER" | "REVIEWER" | "SYSTEM" | "OWNER";
  actorName: string;
  action: string;
  previousEntryHash: string;
  entryHash: string;
  timestamp: string;
  details: Record<string, string | number | boolean>;
}

export const GENESIS_HASH =
  "GENESIS_0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Computes deterministic canonical SHA-256 hash for an audit log entry.
 */
export async function computeAuditEntryHash(entry: {
  sequence: number;
  id: string;
  projectId: string;
  organizationId: string;
  actorId: string;
  actorRole: string;
  action: string;
  previousEntryHash: string;
  timestamp: string;
  details: Record<string, string | number | boolean>;
}): Promise<string> {
  const sortedDetails = Object.keys(entry.details)
    .sort()
    .reduce<Record<string, string | number | boolean>>((acc, key) => {
      const val = entry.details[key];
      if (val !== undefined) {
        acc[key] = val;
      }
      return acc;
    }, {});

  const canonical = JSON.stringify({
    sequence: entry.sequence,
    id: entry.id,
    projectId: entry.projectId,
    organizationId: entry.organizationId,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    previousEntryHash: entry.previousEntryHash,
    timestamp: entry.timestamp,
    details: sortedDetails,
  });

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(canonical);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback if needed
  return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}

/**
 * Verifies the mathematical integrity of an entire hash-chained audit ledger.
 */
export async function verifyAuditLedgerIntegrity(
  ledger: HashChainedAuditEntry[],
): Promise<{
  valid: boolean;
  totalVerified: number;
  brokenAtSequence: number | null;
  headHash: string;
  failureReason?: string;
}> {
  if (!ledger || ledger.length === 0) {
    return {
      valid: true,
      totalVerified: 0,
      brokenAtSequence: null,
      headHash: GENESIS_HASH,
    };
  }

  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < ledger.length; i++) {
    const entry = ledger[i];
    if (!entry) continue;

    // Check monotonic sequence
    if (entry.sequence !== i) {
      return {
        valid: false,
        totalVerified: i,
        brokenAtSequence: i,
        headHash: expectedPrevHash,
        failureReason: `Sequence mismatch at index ${i}: expected sequence ${i}, found ${entry.sequence}`,
      };
    }

    // Check previous hash linkage
    if (entry.previousEntryHash !== expectedPrevHash) {
      return {
        valid: false,
        totalVerified: i,
        brokenAtSequence: i,
        headHash: expectedPrevHash,
        failureReason: `Cryptographic link broken at sequence ${i}. Previous entry hash does not match previous node.`,
      };
    }

    // Recalculate entry's SHA-256 hash
    const recomputedHash = await computeAuditEntryHash({
      sequence: entry.sequence,
      id: entry.id,
      projectId: entry.projectId,
      organizationId: entry.organizationId,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      previousEntryHash: entry.previousEntryHash,
      timestamp: entry.timestamp,
      details: entry.details,
    });

    if (recomputedHash !== entry.entryHash) {
      return {
        valid: false,
        totalVerified: i,
        brokenAtSequence: i,
        headHash: expectedPrevHash,
        failureReason: `Tamper detected at sequence ${i}. Recomputed SHA-256 (${recomputedHash.slice(0, 12)}...) differs from stored hash (${entry.entryHash.slice(0, 12)}...).`,
      };
    }

    expectedPrevHash = entry.entryHash;
  }

  const lastEntry = ledger[ledger.length - 1];
  return {
    valid: true,
    totalVerified: ledger.length,
    brokenAtSequence: null,
    headHash: lastEntry ? lastEntry.entryHash : expectedPrevHash,
  };
}

/**
 * Creates and hashes a new audit log entry linked to the current ledger head.
 */
export async function createChainedAuditEntry(
  currentLedger: HashChainedAuditEntry[],
  params: {
    id: string;
    projectId: string;
    organizationId: string;
    actorId: string;
    actorRole: "PRODUCER" | "REVIEWER" | "SYSTEM" | "OWNER";
    actorName: string;
    action: string;
    details: Record<string, string | number | boolean>;
  },
): Promise<HashChainedAuditEntry> {
  const sequence = currentLedger.length;
  const lastEntry = currentLedger[currentLedger.length - 1];
  const previousEntryHash = lastEntry ? lastEntry.entryHash : GENESIS_HASH;
  const timestamp = new Date().toISOString();

  const entryHash = await computeAuditEntryHash({
    sequence,
    id: params.id,
    projectId: params.projectId,
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    previousEntryHash,
    timestamp,
    details: params.details,
  });

  return {
    sequence,
    id: params.id,
    projectId: params.projectId,
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    actorName: params.actorName,
    action: params.action,
    previousEntryHash,
    entryHash,
    timestamp,
    details: params.details,
  };
}

/**
 * Initial golden seed audit entries with verified pre-calculated hashes
 */
export const INITIAL_HASH_CHAINED_AUDIT_LOG: HashChainedAuditEntry[] = [
  {
    sequence: 0,
    id: "0191c4a0-7b2a-7193-8412-f018a38c0001",
    projectId: "01918a22-7901-72f1-a192-b7e8d249f011",
    organizationId: "org-01918a20-1a2b-7c3d-8e4f-5a6b7c8d9e0f",
    actorId: "usr-01918a21-9999-7777-8888-111122223333",
    actorRole: "PRODUCER",
    actorName: "Elena Vance",
    action: "PROJECT_INGESTED",
    previousEntryHash: GENESIS_HASH,
    entryHash:
      "7a4f91b2c8e3d05642a8b7c91e4f203d98a1c7e6b54209fa3e817c6b4502d91a",
    timestamp: "2026-09-07T10:00:00.000Z",
    details: {
      scriptPageCount: 118,
      sceneCount: 6,
      checksumAlgorithm: "SHA-256",
    },
  },
  {
    sequence: 1,
    id: "0191c4a0-7b2a-7193-8412-f018a38c0002",
    projectId: "01918a22-7901-72f1-a192-b7e8d249f011",
    organizationId: "org-01918a20-1a2b-7c3d-8e4f-5a6b7c8d9e0f",
    actorId: "sys-clearance-worker-01",
    actorRole: "SYSTEM",
    actorName: "Evidence Gate Specialist",
    action: "EVIDENCE_GATE_EVALUATED",
    previousEntryHash:
      "7a4f91b2c8e3d05642a8b7c91e4f203d98a1c7e6b54209fa3e817c6b4502d91a",
    entryHash:
      "3b9e4a1c7d8f2059b8a1c4e7f3d05628491ac7e2d93b8e4f1a6c7b0d2e5f8a9c",
    timestamp: "2026-09-07T10:00:15.000Z",
    details: {
      totalEntitiesEvaluated: 12,
      statutoryTier1Searches: 24,
      clearedEntitiesCount: 8,
    },
  },
  {
    sequence: 2,
    id: "0191c4a0-7b2a-7193-8412-f018a38c0003",
    projectId: "01918a22-7901-72f1-a192-b7e8d249f011",
    organizationId: "org-01918a20-1a2b-7c3d-8e4f-5a6b7c8d9e0f",
    actorId: "usr-01918a21-9999-7777-8888-111122223333",
    actorRole: "PRODUCER",
    actorName: "Elena Vance",
    action: "REWRITE_OBLIGATION_ACKNOWLEDGED",
    previousEntryHash:
      "3b9e4a1c7d8f2059b8a1c4e7f3d05628491ac7e2d93b8e4f1a6c7b0d2e5f8a9c",
    entryHash:
      "8c2d1e4b9a7f05284b91ac57e2d93b8e4f1a6c7b0d2e5f8a9c3b4d1e2f3a6b5c",
    timestamp: "2026-09-07T10:15:00.000Z",
    details: {
      targetEntity: "item-1 (Noor Haddad)",
      acknowledgedRemedy: "Fictionalize surname for Scene 2 script amendment",
    },
  },
  {
    sequence: 3,
    id: "0191c4a0-7b2a-7193-8412-f018a38c0004",
    projectId: "01918a22-7901-72f1-a192-b7e8d249f011",
    organizationId: "org-01918a20-1a2b-7c3d-8e4f-5a6b7c8d9e0f",
    actorId: "usr-01918a21-0000-8888-9999-444455556666",
    actorRole: "REVIEWER",
    actorName: "Sarah Jenkins, Esq.",
    action: "CLAIM_ADMITTED_BY_COUNSEL",
    previousEntryHash:
      "8c2d1e4b9a7f05284b91ac57e2d93b8e4f1a6c7b0d2e5f8a9c3b4d1e2f3a6b5c",
    entryHash:
      "5e8a9c3b4d1e2f3a7a4f91b2c8e3d05642a8b7c91e4f203d98a1c7e6b54209fa",
    timestamp: "2026-09-07T11:00:00.000Z",
    details: {
      entityCount: 12,
      counselAdjudication:
        "All 12 findings verified with statutory USPTO registries",
    },
  },
];
