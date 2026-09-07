"use client";

import React, { useState, useEffect } from "react";
import {
  type HashChainedAuditEntry,
  INITIAL_HASH_CHAINED_AUDIT_LOG,
  verifyAuditLedgerIntegrity,
  GENESIS_HASH,
} from "../lib/hash-chained-audit";
import {
  ShieldCheck,
  Link,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Download,
  Terminal,
  Clock,
  User,
  Hash,
  Scale,
  Lock,
} from "lucide-react";

interface AuditLedgerViewProps {
  auditEntries?: HashChainedAuditEntry[];
  projectTitle?: string;
  projectId?: string;
}

export const AuditLedgerView: React.FC<AuditLedgerViewProps> = ({
  auditEntries = INITIAL_HASH_CHAINED_AUDIT_LOG,
  projectTitle = "The Final Witness",
  projectId = "01918a22-7901-72f1-a192-b7e8d249f011",
}) => {
  const [ledger, setLedger] = useState<HashChainedAuditEntry[]>(auditEntries);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    totalVerified: number;
    brokenAtSequence: number | null;
    headHash: string;
    failureReason?: string;
  }>({
    valid: true,
    totalVerified: auditEntries.length,
    brokenAtSequence: null,
    headHash: auditEntries[auditEntries.length - 1]?.entryHash || GENESIS_HASH,
  });

  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [tamperSimulated, setTamperSimulated] = useState(false);

  // Sync prop changes
  useEffect(() => {
    setLedger(auditEntries);
  }, [auditEntries]);

  // Run integrity verification
  const handleVerifyLedger = async (currentList = ledger) => {
    setIsVerifying(true);
    const result = await verifyAuditLedgerIntegrity(currentList);
    setVerificationResult(result);
    setIsVerifying(false);
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard?.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleSimulateTamper = async () => {
    if (tamperSimulated) {
      // Revert to golden ledger
      setLedger(auditEntries);
      setTamperSimulated(false);
      await handleVerifyLedger(auditEntries);
      return;
    }

    // Tamper with sequence 1 (change one character in details)
    const tampered = ledger.map((entry) => {
      if (entry.sequence === 1) {
        return {
          ...entry,
          details: {
            ...entry.details,
            clearedEntitiesCount: 999, // Unlawful tampering!
          },
        };
      }
      return entry;
    });

    setLedger(tampered);
    setTamperSimulated(true);
    await handleVerifyLedger(tampered);
  };

  const handleExportAuditJson = () => {
    const payload = {
      $schema: "https://permissa.app/schemas/audit-ledger-v1.json",
      projectId,
      projectTitle,
      exportTimestamp: new Date().toISOString(),
      headHash: verificationResult.headHash,
      integrityValid: verificationResult.valid,
      totalEntries: ledger.length,
      entries: ledger,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PERMISSA_Audit_Chain_${projectTitle.replace(/\s+/g, "_")}_Seq${ledger.length - 1}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
              Tamper-Evident Audit Ledger &bull; Tranche 6
            </span>
            <span className="text-xs text-slate-500 font-mono">
              SHA-256 Hash Chained
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
            Immutable Chain-of-Custody Ledger
          </h1>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-3xl">
            Append-only cryptographic event sequence. Every state transition
            mathematically binds to the preceding entry hash, enforcing
            non-repudiation for entertainment insurance underwriters and studio
            legal audits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => handleVerifyLedger()}
            disabled={isVerifying}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-indigo-600 ${
                isVerifying ? "animate-spin" : ""
              }`}
            />
            <span>Verify Chain</span>
          </button>

          <button
            onClick={handleSimulateTamper}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg font-semibold text-xs transition-all ${
              tamperSimulated
                ? "bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            <AlertTriangle
              className={`w-3.5 h-3.5 ${
                tamperSimulated ? "text-amber-700" : "text-slate-500"
              }`}
            />
            <span>
              {tamperSimulated ? "Revert Tamper Test" : "Test Tamper Detection"}
            </span>
          </button>

          <button
            onClick={handleExportAuditJson}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit Trail</span>
          </button>
        </div>
      </div>

      {/* Verification Status Banner */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          verificationResult.valid
            ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400/20"
            : "bg-rose-50 border-rose-300 ring-1 ring-rose-400/30"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                verificationResult.valid
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-rose-600 text-white shadow-xs"
              }`}
            >
              {verificationResult.valid ? (
                <ShieldCheck className="w-6 h-6" />
              ) : (
                <AlertTriangle className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3
                  className={`text-sm font-bold tracking-tight ${
                    verificationResult.valid
                      ? "text-emerald-950"
                      : "text-rose-950"
                  }`}
                >
                  {verificationResult.valid
                    ? "Cryptographic Chain Integrity Verified"
                    : "Tamper Detected — Chain Integrity Broken!"}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    verificationResult.valid
                      ? "bg-emerald-200/70 text-emerald-900"
                      : "bg-rose-200 text-rose-900"
                  }`}
                >
                  {verificationResult.totalVerified} Blocks Validated
                </span>
              </div>
              <p
                className={`text-xs mt-0.5 ${
                  verificationResult.valid
                    ? "text-emerald-800"
                    : "text-rose-800 font-semibold"
                }`}
              >
                {verificationResult.valid
                  ? "All SHA-256 node linkages and canonical hashes match with zero discrepancies. Append-only contract intact."
                  : verificationResult.failureReason}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono shrink-0">
            <span className="text-slate-500 text-[11px]">Ledger Head:</span>
            <span className="font-bold text-slate-800 bg-white/80 px-2.5 py-1 rounded-md border border-slate-200">
              {verificationResult.headHash.slice(0, 16)}...
            </span>
          </div>
        </div>
      </div>

      {/* Audit Chain Event Stream */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-slate-200 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Cryptographic Hash-Linked Event Sequence
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {ledger.length} Chained Blocks
          </span>
        </div>

        <div className="space-y-4">
          {ledger.map((entry, index) => {
            const isBrokenNode =
              !verificationResult.valid &&
              verificationResult.brokenAtSequence === entry.sequence;

            return (
              <div
                key={entry.id}
                className={`p-4 sm:p-5 rounded-xl border transition-all space-y-3 relative ${
                  isBrokenNode
                    ? "bg-rose-50/80 border-rose-300 ring-2 ring-rose-400"
                    : "bg-slate-50/50 hover:bg-slate-50 border-slate-200"
                }`}
              >
                {/* Node Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                      Block #{entry.sequence}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">
                      {entry.action.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        entry.actorRole === "REVIEWER"
                          ? "bg-purple-100 text-purple-800 border border-purple-200"
                          : entry.actorRole === "PRODUCER"
                            ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                            : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      {entry.actorRole}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-slate-500 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span>&bull;</span>
                    <span>Actor: {entry.actorName}</span>
                  </div>
                </div>

                {/* Cryptographic Linkage Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                    <div className="truncate mr-2">
                      <span className="text-slate-400 text-[10px] block">
                        Previous Hash (Parent Link):
                      </span>
                      <span className="text-slate-700 font-semibold text-[11px] truncate block">
                        {entry.previousEntryHash === GENESIS_HASH
                          ? "GENESIS (Root Block)"
                          : entry.previousEntryHash}
                      </span>
                    </div>
                    {entry.previousEntryHash !== GENESIS_HASH && (
                      <button
                        onClick={() => handleCopyHash(entry.previousEntryHash)}
                        className="text-slate-400 hover:text-slate-600 p-1"
                      >
                        {copiedHash === entry.previousEntryHash ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  <div className="p-2.5 bg-white rounded-lg border border-indigo-200 flex items-center justify-between">
                    <div className="truncate mr-2">
                      <span className="text-indigo-600 text-[10px] font-bold block">
                        Current Entry SHA-256 Digest:
                      </span>
                      <span className="text-indigo-900 font-bold text-[11px] truncate block">
                        {entry.entryHash}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopyHash(entry.entryHash)}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      {copiedHash === entry.entryHash ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Content-Free Verified Details */}
                <div className="p-2.5 bg-white rounded-lg border border-slate-200/80 text-xs">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Event Details (Content-Free):
                  </span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {Object.entries(entry.details).map(([k, v]) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px] text-slate-700"
                      >
                        <strong>{k}:</strong> {String(v)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Connecting arrow if not last */}
                {index < ledger.length - 1 && (
                  <div className="flex justify-center -mb-2 pt-1 text-slate-400">
                    <Link className="w-3.5 h-3.5 rotate-90" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
