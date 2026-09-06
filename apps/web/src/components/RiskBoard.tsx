"use client";

import React, { useState } from "react";
import type { ClearanceItem } from "../data/golden-data";
import type { EvaluatedClearance } from "../lib/clearance-engine";
import {
  ShieldCheck,
  FileCheck,
  PenTool,
  AlertOctagon,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Search,
  Filter,
  Layers,
  Sparkles,
  Lock,
  Radio,
  RefreshCw,
  AlertTriangle,
  X,
} from "lucide-react";

interface RiskBoardProps {
  entities: ClearanceItem[];
  evaluations: Record<string, EvaluatedClearance>;
  onSelectEntity: (entityId: string) => void;
  onRefreshEvaluation: () => void;
  onBatchLiveResearch?: () => void;
}

export const RiskBoard: React.FC<RiskBoardProps> = ({
  entities,
  evaluations,
  onSelectEntity,
  onRefreshEvaluation,
  onBatchLiveResearch,
}) => {
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchNotice, setBatchNotice] = useState<{
    type: "info" | "error";
    msg: string;
  } | null>(null);

  const handleRunLiveParallelBatch = async () => {
    setIsBatchRunning(true);
    setBatchNotice(null);

    const targetEntities = entities;
    if (targetEntities.length === 0) {
      setBatchNotice({
        type: "error",
        msg: "No entities available to research. Upload or register screenplay entities first.",
      });
      setIsBatchRunning(false);
      return;
    }

    try {
      const res = await fetch("/api/research/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "proj-the-final-witness",
          entities: targetEntities.map((e) => ({
            entityId: e.id,
            canonicalName: e.canonicalName,
            type: e.type,
            jurisdiction: "US",
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === "PARALLEL_UNAVAILABLE") {
          setBatchNotice({
            type: "info",
            msg: "Parallel API is configured to use PARALLEL_API_KEY from Settings. In production with the key configured, live registry queries dispatch to api.parallel.ai.",
          });
        } else {
          setBatchNotice({
            type: "error",
            msg: data.detail || "Parallel batch research failed.",
          });
        }
        return;
      }

      setBatchNotice({
        type: "info",
        msg: `Batch Parallel research completed: ${data.summary?.processedCount || 0} entities queried via live web API.`,
      });
      if (onBatchLiveResearch) {
        onBatchLiveResearch();
      }
    } catch (err) {
      setBatchNotice({
        type: "error",
        msg: "Network error executing batch clearance research.",
      });
    } finally {
      setIsBatchRunning(false);
    }
  };

  const statusConfig = {
    RESEARCH_CLEARED: {
      label: "Research-Cleared",
      color: "emerald",
      bg: "bg-emerald-50",
      text: "text-emerald-800",
      border: "border-emerald-200",
      icon: ShieldCheck,
      desc: "Passing evidence gate, verified authority, score >= 85",
    },
    NEEDS_LICENCE: {
      label: "Needs Licence",
      color: "amber",
      bg: "bg-amber-50",
      text: "text-amber-800",
      border: "border-amber-200",
      icon: FileCheck,
      desc: "Valid commercial mark detected, licensing agreement needed",
    },
    NEEDS_REWRITE: {
      label: "Needs Rewrite",
      color: "rose",
      bg: "bg-rose-50",
      text: "text-rose-800",
      border: "border-rose-200",
      icon: PenTool,
      desc: "Defamation, false-light, or confusion risk; revision advised",
    },
    INSUFFICIENT_EVIDENCE: {
      label: "Insufficient Evidence",
      color: "slate",
      bg: "bg-slate-100",
      text: "text-slate-700",
      border: "border-slate-200",
      icon: HelpCircle,
      desc: "Weak citation authority or uncorroborated registry records",
    },
    BLOCKED: {
      label: "Blocked",
      color: "red",
      bg: "bg-red-50",
      text: "text-red-800",
      border: "border-red-200",
      icon: AlertOctagon,
      desc: "Severe non-negotiable conflict; requires professional review sign-off",
    },
  };

  // Compute status counts
  const counts: Record<string, number> = {
    RESEARCH_CLEARED: 0,
    NEEDS_LICENCE: 0,
    NEEDS_REWRITE: 0,
    INSUFFICIENT_EVIDENCE: 0,
    BLOCKED: 0,
  };

  entities.forEach((e) => {
    const evalResult = evaluations[e.id];
    const status = evalResult
      ? evalResult.admittedStatus
      : e.initialProposedStatus;
    if (counts[status] !== undefined) {
      counts[status]++;
    }
  });

  const actionRequiredCount =
    (counts.NEEDS_REWRITE || 0) +
    (counts.NEEDS_LICENCE || 0) +
    (counts.BLOCKED || 0);

  const filteredEntities = entities.filter((e) => {
    const evalResult = evaluations[e.id];
    const status = evalResult
      ? evalResult.admittedStatus
      : e.initialProposedStatus;

    let matchesStatus = true;
    if (activeStatusFilter === "ACTION_REQUIRED") {
      matchesStatus =
        status === "NEEDS_REWRITE" ||
        status === "NEEDS_LICENCE" ||
        status === "BLOCKED";
    } else if (activeStatusFilter !== "ALL") {
      matchesStatus = status === activeStatusFilter;
    }

    const matchesSearch =
      e.canonicalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.rationale.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6" suppressHydrationWarning>
      {/* Header Banner */}
      <div
        className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-xs"
        suppressHydrationWarning
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                Clearance Risk Board &bull; Tranche 5
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Deterministic Evidence-Gated Findings
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              Screenplay Clearance Status
            </h1>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Deterministic evaluation powered by <code>@permissa/policy</code>.
              Every finding is grounded in admissible citations from USPTO,
              Library of Congress, and guild registries.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0 flex-wrap gap-y-2">
            <button
              onClick={handleRunLiveParallelBatch}
              disabled={isBatchRunning}
              className="btn-tactile btn-tactile-blue flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-white"
              title="Query Parallel Web Systems (api.parallel.ai) for live trademark and entity evidence"
            >
              {isBatchRunning ? (
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

            <button
              onClick={onRefreshEvaluation}
              className="btn-tactile btn-tactile-secondary flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Re-evaluate Gate</span>
            </button>
          </div>
        </div>

        {/* Batch Notice Alert */}
        {batchNotice && (
          <div
            className={`mt-4 p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              batchNotice.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-blue-50 border-blue-200 text-blue-800"
            }`}
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span className="leading-relaxed font-medium">
                {batchNotice.msg}
              </span>
            </div>
            <button
              onClick={() => setBatchNotice(null)}
              className="text-slate-500 hover:text-slate-800 text-xs ml-4 font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Status Metrics Ribbon */}
        <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(Object.keys(statusConfig) as (keyof typeof statusConfig)[]).map(
            (statusKey) => {
              const cfg = statusConfig[statusKey];
              const Icon = cfg.icon;
              const count = counts[statusKey] || 0;
              const isSelected = activeStatusFilter === statusKey;

              return (
                <button
                  key={statusKey}
                  onClick={() =>
                    setActiveStatusFilter(
                      isSelected ? "ALL" : (statusKey as string),
                    )
                  }
                  className={`card-stat-tile p-3.5 ${
                    isSelected
                      ? `${cfg.bg} ${cfg.border} ring-2 ring-indigo-600/30 shadow-xs font-semibold`
                      : "bg-white hover:bg-slate-50/90 border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xl font-black font-mono tracking-tight ${cfg.text}`}
                    >
                      {count}
                    </span>
                    <div className="p-1 rounded-md bg-white border border-slate-200 shadow-2xs">
                      <Icon className={`w-3.5 h-3.5 ${cfg.text}`} />
                    </div>
                  </div>
                  <div className="text-xs font-bold text-slate-900 mt-2 line-clamp-1">
                    {cfg.label}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                    {cfg.desc}
                  </div>
                </button>
              );
            },
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-slate-200 p-3 sm:p-3.5 rounded-xl shadow-2xs"
        suppressHydrationWarning
      >
        <div
          className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-none"
          suppressHydrationWarning
        >
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-600 font-semibold">Filter:</span>
          <button
            onClick={() => setActiveStatusFilter("ALL")}
            className={`btn-tactile text-xs px-3.5 py-1.5 rounded-lg shrink-0 ${
              activeStatusFilter === "ALL"
                ? "btn-tactile-primary"
                : "btn-tactile-secondary text-slate-700 font-medium"
            }`}
          >
            All ({entities.length})
          </button>
          <button
            onClick={() => setActiveStatusFilter("ACTION_REQUIRED")}
            className={`btn-tactile text-xs px-3.5 py-1.5 rounded-lg shrink-0 flex items-center space-x-1.5 ${
              activeStatusFilter === "ACTION_REQUIRED"
                ? "bg-gradient-to-b from-amber-500 to-amber-600 text-white border border-amber-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(15,23,42,0.1)] font-semibold"
                : "btn-tactile-secondary text-amber-800 font-medium"
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Action Required ({actionRequiredCount})</span>
          </button>
          {activeStatusFilter !== "ALL" &&
            activeStatusFilter !== "ACTION_REQUIRED" && (
              <span className="text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 shrink-0 font-medium">
                Showing: {activeStatusFilter.replace(/_/g, " ")}
              </span>
            )}
        </div>

        <div className="relative w-full sm:w-72" suppressHydrationWarning>
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search findings by entity, type, or law..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            suppressHydrationWarning
            className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2 p-0.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Findings Grid or Empty State */}
      {filteredEntities.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              No matching clearance findings
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              No entities match the active search query &quot;{searchQuery}
              &quot; or status filter. Try clearing filters.
            </p>
          </div>
          <button
            onClick={() => {
              setActiveStatusFilter("ALL");
              setSearchQuery("");
            }}
            className="btn-tactile btn-tactile-primary px-4 py-2 rounded-lg text-xs font-semibold text-white"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEntities.map((item) => {
            const evalResult = evaluations[item.id];
            const status = evalResult
              ? evalResult.admittedStatus
              : item.initialProposedStatus;
            const cfg =
              statusConfig[status as keyof typeof statusConfig] ||
              statusConfig.INSUFFICIENT_EVIDENCE;
            const Icon = cfg.icon;
            const confidence = evalResult?.confidence;
            const score = confidence?.finalScore ?? 50;

            return (
              <div
                key={item.id}
                onClick={() => onSelectEntity(item.id)}
                className="card-interactive p-5 flex flex-col justify-between group"
              >
                <div>
                  {/* Card Top: Status Badge, Dot Indicator & Score */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide ${cfg.bg} ${cfg.text} border ${cfg.border} shadow-2xs`}
                    >
                      <Icon className="w-3.5 h-3.5 mr-0.5 shrink-0" />
                      <span>{cfg.label}</span>
                    </span>

                    {/* Confidence Score Pill */}
                    <div
                      className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-xs font-mono font-bold border shadow-2xs ${
                        score >= 85
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : score >= 60
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      <span>{score}</span>
                      <span className="text-[10px] text-slate-400">/100</span>
                    </div>
                  </div>

                  {/* Sleek Mini Confidence Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        score >= 85
                          ? "bg-emerald-500"
                          : score >= 60
                            ? "bg-amber-500"
                            : "bg-slate-400"
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(10, score))}%`,
                      }}
                    />
                  </div>

                  {/* Canonical Name & Category */}
                  <div className="mt-4">
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {item.canonicalName}
                    </h3>
                    <div className="flex items-center space-x-2 text-xs text-slate-500 mt-1">
                      <span className="capitalize font-semibold text-slate-600">
                        {item.type.toLowerCase().replace(/_/g, " ")}
                      </span>
                      <span>&bull;</span>
                      <span>{item.mentionsCount} mentions</span>
                      <span>&bull;</span>
                      <span>{item.citations.length} citation(s)</span>
                    </div>
                  </div>

                  {/* Rationale Excerpt */}
                  <p className="text-xs text-slate-600 mt-3 line-clamp-3 leading-relaxed bg-slate-50/80 p-3 rounded-lg border border-slate-200/80">
                    {item.rationale}
                  </p>

                  {/* Rewrite Suggestion pill if present */}
                  {item.rewriteSuggestion && (
                    <div className="mt-2.5 text-[11px] text-amber-900 bg-amber-50/90 p-2.5 rounded-lg border border-amber-200 flex items-start space-x-1.5 shadow-2xs">
                      <span className="font-bold text-amber-800 shrink-0">
                        Remedy:
                      </span>
                      <span className="line-clamp-2">
                        {item.rewriteSuggestion}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Footer: Citations Tier Preview & CTA */}
                <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                    {item.citations.map((c, cIdx) => (
                      <span
                        key={cIdx}
                        className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-mono text-slate-700 shadow-2xs font-semibold"
                      >
                        {c.sourceTier.replace("_", " ")}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center space-x-1 text-indigo-600 group-hover:translate-x-1.5 transition-transform font-bold text-xs shrink-0">
                    <span>Inspect</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
