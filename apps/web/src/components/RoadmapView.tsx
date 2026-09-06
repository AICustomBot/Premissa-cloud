"use client";

import React, { useState } from "react";
import {
  IMPLEMENTATION_ROADMAP,
  type TrancheRoadmapItem,
} from "../data/golden-data";
import {
  CheckCircle2,
  Clock,
  CircleDashed,
  ChevronRight,
  ShieldCheck,
  Code2,
  Lock,
  Cpu,
  ArrowUpRight,
  Workflow,
} from "lucide-react";

export const RoadmapView: React.FC = () => {
  const [selectedTranche, setSelectedTranche] = useState<TrancheRoadmapItem>(
    IMPLEMENTATION_ROADMAP[4] ?? IMPLEMENTATION_ROADMAP[0]!,
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-indigo-600 text-xs font-semibold uppercase tracking-wider">
              <Workflow className="w-4 h-4" />
              <span>Production Architecture Roadmap</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              PERMISSA Implementation &amp; Clearance Lifecycle
            </h1>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              Nine sequential tranches governed by the Engineering Constitution.
              Each tranche concludes with green verification gates,
              deterministic policy checks, and zero synthetic payload leakage.
            </p>
          </div>
          <div className="flex items-center space-x-3 shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <span className="block text-xl font-bold text-indigo-600">
                9 / 9
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Tranches Defined
              </span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
              <span className="block text-xl font-bold text-emerald-700">
                100%
              </span>
              <span className="text-[10px] text-emerald-800 uppercase tracking-wider font-semibold">
                Gate Integrity
              </span>
            </div>
          </div>
        </div>

        {/* Hard Prohibitions Guardrail Pill Bar */}
        <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center space-x-2 bg-rose-50/50 p-2.5 rounded-lg border border-rose-200">
            <Lock className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="text-rose-900 font-medium">
              No OpenAI / Anthropic / AWS models
            </span>
          </div>
          <div className="flex items-center space-x-2 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-200">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-indigo-900 font-medium">
              Deterministic Gate: Cleared &ge; 85
            </span>
          </div>
          <div className="flex items-center space-x-2 bg-amber-50/50 p-2.5 rounded-lg border border-amber-200">
            <Cpu className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-amber-900 font-medium">
              No final Blocked without Legal Review
            </span>
          </div>
          <div className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <Code2 className="w-4 h-4 text-slate-600 shrink-0" />
            <span className="text-slate-800 font-medium">
              Zod First + UUIDv7 Server-Side
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Tranche Steps & Active Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tranche Timeline List */}
        <div className="lg:col-span-7 space-y-3">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
            <span>Execution Tranches</span>
            <span className="text-xs text-slate-500 font-normal">
              Click to view specifications
            </span>
          </h2>

          <div className="space-y-2.5">
            {IMPLEMENTATION_ROADMAP.map((tranche) => {
              const isSelected = selectedTranche.id === tranche.id;
              return (
                <div
                  key={tranche.id}
                  onClick={() => setSelectedTranche(tranche)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-2xs"
                      : "bg-white hover:bg-slate-50 border-slate-200 shadow-2xs"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="mt-0.5">
                        {tranche.status === "COMPLETED" && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        )}
                        {tranche.status === "ACTIVE" && (
                          <Clock className="w-5 h-5 text-indigo-600 animate-pulse" />
                        )}
                        {tranche.status === "UPCOMING" && (
                          <CircleDashed className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            Tranche {tranche.number}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900">
                            {tranche.title}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                          {tranche.scope}
                        </p>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 transition-transform shrink-0 mt-1 ${
                        isSelected
                          ? "text-indigo-600 rotate-90"
                          : "text-slate-400"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Tranche Deep Dive Panel */}
        <div className="lg:col-span-5">
          <div className="sticky top-20 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                  Tranche {selectedTranche.number} Specification
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  {selectedTranche.title}
                </h3>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  selectedTranche.status === "COMPLETED"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : selectedTranche.status === "ACTIVE"
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {selectedTranche.status}
              </span>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Functional Scope
              </h4>
              <p className="text-xs text-slate-700 mt-1 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                {selectedTranche.scope}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Strict Exit Criteria
              </h4>
              <p className="text-xs text-amber-900 mt-1 leading-relaxed bg-amber-50/70 p-3.5 rounded-xl border border-amber-200">
                {selectedTranche.exitCriteria}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Key Deliverables &amp; Artifacts
              </h4>
              <ul className="mt-2 space-y-2">
                {selectedTranche.deliverables.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-center space-x-2 text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
