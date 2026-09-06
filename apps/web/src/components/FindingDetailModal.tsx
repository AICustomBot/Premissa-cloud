"use client";

import React, { useState } from "react";
import type { ClearanceItem } from "../data/golden-data";
import type { EvaluatedClearance } from "../lib/clearance-engine";
import {
  X,
  ShieldCheck,
  FileCheck,
  PenTool,
  AlertOctagon,
  HelpCircle,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Hash,
  Clock,
  Globe,
  FileText,
  UserCheck,
  Sparkles,
  RefreshCw,
  Radio,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";

interface FindingDetailModalProps {
  entity: ClearanceItem | null;
  evaluation: EvaluatedClearance | null;
  onClose: () => void;
  userRole: "PRODUCER" | "REVIEWER";
  onApplyOverride?: (entityId: string, newStatus: any, reason: string) => void;
  onLiveResearchComplete?: (
    entityId: string,
    citations: any[],
    confidenceInput: any,
    admittedStatus: any,
  ) => void;
  projectId?: string;
  onNavigate?: (direction: "prev" | "next") => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

export const FindingDetailModal: React.FC<FindingDetailModalProps> = ({
  entity,
  evaluation,
  onClose,
  userRole,
  onApplyOverride,
  onLiveResearchComplete,
  projectId = "proj-the-final-witness",
  onNavigate,
  hasPrev = false,
  hasNext = false,
  currentIndex,
  totalCount,
}) => {
  if (!entity || !evaluation) return null;

  const [overrideStatus, setOverrideStatus] = useState<string>(
    evaluation.admittedStatus,
  );
  const [overrideReason, setOverrideReason] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [isSearchingParallel, setIsSearchingParallel] = useState(false);
  const [parallelStatusMsg, setParallelStatusMsg] = useState<string | null>(
    null,
  );
  const [parallelError, setParallelError] = useState<string | null>(null);
  const [copiedCitationId, setCopiedCitationId] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const confidence = evaluation.confidence;
  const score = confidence.finalScore;

  const handleCopyCitation = (c: any) => {
    const text = `[${c.sourceTier}] ${c.title} (${c.domain})\nURL: ${c.url}\nExcerpt: "${c.excerpt}"\nHash: ${c.contentHash}`;
    navigator.clipboard?.writeText(text);
    setCopiedCitationId(c.id);
    setTimeout(() => setCopiedCitationId(null), 2000);
  };

  const handleCopySummary = () => {
    const summary = `ENTITY: ${entity.canonicalName} (${entity.type})
STATUS: ${evaluation.admittedStatus}
CONFIDENCE SCORE: ${score}/100 (${confidence.band})
RATIONALE: ${entity.rationale}
${entity.rewriteSuggestion ? `REMEDY: ${entity.rewriteSuggestion}` : ""}
CITATIONS: ${entity.citations.map((c) => `${c.title} (${c.url})`).join("; ")}`;
    navigator.clipboard?.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleRunParallelSearch = async () => {
    setIsSearchingParallel(true);
    setParallelError(null);
    setParallelStatusMsg(
      "Dispatching live query to Parallel API (api.parallel.ai)...",
    );

    try {
      const res = await fetch("/api/research/entity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          entityId: entity.id,
          canonicalName: entity.canonicalName,
          type: entity.type,
          jurisdiction: "US",
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        if (body.code === "PARALLEL_UNAVAILABLE") {
          setParallelError(
            "Parallel API key not configured in environment. In production, configure PARALLEL_API_KEY in Settings to perform live research against api.parallel.ai.",
          );
        } else {
          setParallelError(body.detail || "Live research failed.");
        }
        return;
      }

      if (body.success && body.data) {
        setParallelStatusMsg(
          `Retrieved ${body.data.citations.length} live citations via Parallel Web Systems (${body.data.provider.latencyMs}ms). Gate re-evaluated!`,
        );
        if (onLiveResearchComplete) {
          onLiveResearchComplete(
            entity.id,
            body.data.citations,
            body.data.confidenceInput,
            body.data.decision.admittedStatus,
          );
        }
      }
    } catch (err: any) {
      setParallelError("Network error contacting /api/research/entity");
    } finally {
      setIsSearchingParallel(false);
    }
  };

  const handleSaveOverride = () => {
    if (!overrideReason.trim()) return;
    if (onApplyOverride) {
      onApplyOverride(entity.id, overrideStatus, overrideReason);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Top Navigation */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-3">
            {onNavigate && (
              <div className="flex items-center space-x-1.5 mr-1">
                <button
                  onClick={() => onNavigate("prev")}
                  disabled={!hasPrev}
                  className="btn-tactile btn-tactile-secondary p-1.5 rounded-lg text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Previous Finding"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {currentIndex !== undefined && totalCount !== undefined && (
                  <span className="text-[11px] font-mono text-slate-600 px-1 font-semibold">
                    {currentIndex + 1}/{totalCount}
                  </span>
                )}
                <button
                  onClick={() => onNavigate("next")}
                  disabled={!hasNext}
                  className="btn-tactile btn-tactile-secondary p-1.5 rounded-lg text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next Finding"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Finding Detail &bull; {entity.type.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  ID: {entity.id}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1.5">
                {entity.canonicalName}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopySummary}
              className="hidden sm:flex btn-tactile btn-tactile-secondary items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700"
              title="Copy executive finding dossier to clipboard"
            >
              {copiedSummary ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Dossier</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
          {/* Status & Confidence Score Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
            {/* Status */}
            <div>
              <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                Deterministic Admitted Status
              </span>
              <div className="flex items-center space-x-2 mt-1.5">
                <span className="text-base font-bold text-slate-900">
                  {evaluation.admittedStatus.replace(/_/g, " ")}
                </span>
                {evaluation.admittedStatus !== evaluation.proposedStatus && (
                  <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                    Policy Downgraded
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Model proposed: {evaluation.proposedStatus.replace(/_/g, " ")}
              </p>
            </div>

            {/* Score & Band */}
            <div>
              <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                Confidence Formula (v{confidence.formulaVersion})
              </span>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-black text-slate-900">
                  {score}
                </span>
                <span className="text-slate-400">/ 100</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {confidence.band} CONFIDENCE
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Clearing Threshold: &ge; 85 required for Research-Cleared
              </p>
            </div>
          </div>

          {/* 5-Factor Mathematical Breakdown */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center justify-between">
              <span>5-Factor Deterministic Breakdown</span>
              <span className="text-[11px] text-slate-500 font-mono">
                Raw: {confidence.rawScore} &rarr; Final: {confidence.finalScore}
              </span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
              <div className="card-stat-tile p-3 bg-white flex flex-col justify-between">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Authority
                  </span>
                  <span className="text-sm font-black font-mono text-slate-900 mt-1 block">
                    {confidence.factors.authority} / 40
                  </span>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 my-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(5, (confidence.factors.authority / 40) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-[9px] text-slate-500 block truncate mt-0.5 font-medium">
                  {entity.confidenceInput.authority.replace(/_/g, " ")}
                </span>
              </div>

              <div className="card-stat-tile p-3 bg-white flex flex-col justify-between">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Independence
                  </span>
                  <span className="text-sm font-black font-mono text-slate-900 mt-1 block">
                    {confidence.factors.independence} / 20
                  </span>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 my-2 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(5, (confidence.factors.independence / 20) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-[9px] text-slate-500 block truncate mt-0.5 font-medium">
                  {entity.confidenceInput.independence.replace(/_/g, " ")}
                </span>
              </div>

              <div className="card-stat-tile p-3 bg-white flex flex-col justify-between">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Entity Match
                  </span>
                  <span className="text-sm font-black font-mono text-slate-900 mt-1 block">
                    {confidence.factors.entityMatch} / 20
                  </span>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 my-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(5, (confidence.factors.entityMatch / 20) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-[9px] text-slate-500 block truncate mt-0.5 font-medium">
                  {entity.confidenceInput.match}
                </span>
              </div>

              <div className="card-stat-tile p-3 bg-white flex flex-col justify-between">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Freshness
                  </span>
                  <span className="text-sm font-black font-mono text-emerald-700 mt-1 block">
                    {confidence.factors.freshness} / 10
                  </span>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 my-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(5, (confidence.factors.freshness / 10) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-[9px] text-slate-500 block mt-0.5 font-medium">
                  {entity.confidenceInput.freshnessValid
                    ? "< 365 Days"
                    : "Stale"}
                </span>
              </div>

              <div className="card-stat-tile p-3 bg-white col-span-2 sm:col-span-1 flex flex-col justify-between">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Context
                  </span>
                  <span className="text-sm font-black font-mono text-slate-900 mt-1 block">
                    {confidence.factors.context} / 10
                  </span>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 my-2 overflow-hidden">
                    <div
                      className="bg-purple-600 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(5, (confidence.factors.context / 10) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-[9px] text-slate-500 block mt-0.5 font-medium">
                  {entity.confidenceInput.context}
                </span>
              </div>
            </div>

            {/* Caps or Invalidations */}
            {(confidence.caps.length > 0 ||
              confidence.invalidations.length > 0 ||
              evaluation.reasonCodes.length > 0) && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                <div className="flex items-center space-x-1.5 text-rose-800 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Evidence Caps & Reason Codes</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {evaluation.reasonCodes.map((code, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-mono text-[10px] border border-rose-200"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rationale & Remediation */}
          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Legal Clearance Assessment
            </h3>
            <p className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-800 leading-relaxed">
              {entity.rationale}
            </p>

            {entity.rewriteSuggestion && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <span className="font-bold block text-amber-800 mb-0.5">
                  Recommended Clearance Rewrite:
                </span>
                {entity.rewriteSuggestion}
              </div>
            )}
          </div>

          {/* Admissible Evidence Citations */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-2">
                  <span>
                    Admissible Evidence Citations ({entity.citations.length})
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Parallel.ai Live Connector
                  </span>
                </h3>
                <span className="text-slate-500 text-[10px] block mt-0.5">
                  Tier 1 Official Registries &bull; Tier 2 Authoritative News
                  &bull; Zero Hallucinations
                </span>
              </div>

              <button
                onClick={handleRunParallelSearch}
                disabled={isSearchingParallel}
                className="btn-tactile btn-tactile-blue flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold shrink-0"
              >
                {isSearchingParallel ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Searching Parallel API...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5 text-blue-200" />
                    <span>Run Live Research (Parallel API)</span>
                  </>
                )}
              </button>
            </div>

            {/* Parallel Status or Error Message */}
            {parallelStatusMsg && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-xs flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{parallelStatusMsg}</span>
              </div>
            )}

            {parallelError && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Live Web Research Status</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  {parallelError}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {entity.citations.map((citation) => (
                <div
                  key={citation.id}
                  className="card-interactive p-4 space-y-2.5 cursor-default hover:border-slate-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono">
                          {citation.sourceTier.replace("_", " ")}
                        </span>
                        <h4 className="text-xs font-bold text-slate-900">
                          {citation.title}
                        </h4>
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-1">
                        <Globe className="w-3 h-3 text-slate-400" />
                        <span>{citation.domain}</span>
                        {citation.controllingOwner && (
                          <span>&bull; Owner: {citation.controllingOwner}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleCopyCitation(citation)}
                        className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                        title="Copy citation details and excerpt"
                      >
                        {copiedCitationId === citation.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                        title="Open external source"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 italic bg-slate-50 p-3 rounded-lg border border-slate-200/80 leading-relaxed">
                    &quot;{citation.excerpt}&quot;
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
                    <div className="flex items-center space-x-1.5">
                      <Hash className="w-3 h-3 text-slate-400" />
                      <span>Hash: {citation.contentHash}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>
                        Retrieved: {citation.retrievedAt.slice(0, 10)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reviewer Override Section (Enabled for REVIEWER role) */}
          {userRole === "REVIEWER" && (
            <div className="p-5 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-purple-900 font-bold">
                <UserCheck className="w-4 h-4 text-purple-700" />
                <span>Professional Reviewer Adjudication</span>
              </div>
              <p className="text-[11px] text-purple-700 leading-relaxed">
                Pursuant to ADR-0005, only an entertainment attorney or
                professional clearance reviewer may finalize a BLOCKED status or
                override an automated gate with admissible citation evidence.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 uppercase mb-1">
                    Override Admitted Status
                  </label>
                  <select
                    value={overrideStatus}
                    onChange={(e) => setOverrideStatus(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-xs text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-600"
                  >
                    <option value="RESEARCH_CLEARED">RESEARCH_CLEARED</option>
                    <option value="NEEDS_LICENCE">NEEDS_LICENCE</option>
                    <option value="NEEDS_REWRITE">NEEDS_REWRITE</option>
                    <option value="BLOCKED">
                      BLOCKED (Final Reviewer Only)
                    </option>
                    <option value="INSUFFICIENT_EVIDENCE">
                      INSUFFICIENT_EVIDENCE
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 uppercase mb-1">
                    Legal Clearance Reason / Citation Note
                  </label>
                  <input
                    type="text"
                    placeholder="Enter formal clearance docket or grounds..."
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    suppressHydrationWarning
                    className="w-full bg-white border border-slate-300 text-xs text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={handleSaveOverride}
                  disabled={!overrideReason.trim()}
                  className={`btn-tactile flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-semibold ${
                    overrideReason.trim()
                      ? "btn-tactile-purple"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed opacity-50"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Reviewer Decision</span>
                </button>
              </div>

              {isSaved && (
                <p className="text-emerald-700 text-[11px] font-medium text-right">
                  Decision successfully committed to clearance ledger!
                </p>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex justify-end">
          <button
            onClick={onClose}
            className="btn-tactile btn-tactile-secondary px-5 py-2 rounded-lg text-xs font-semibold text-slate-800"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
