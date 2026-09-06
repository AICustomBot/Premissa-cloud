"use client";

import React, { useState } from "react";
import {
  GitCompare,
  GitBranch,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FilePlus2,
  Trash2,
  RefreshCw,
  Coins,
  ShieldCheck,
  Zap,
  Sparkles,
  FileCode,
  Lock,
  Search,
  Check,
  ChevronRight,
  Fingerprint,
} from "lucide-react";
import type { ClearanceItem } from "../data/golden-data";

interface ScriptRevision {
  id: string;
  versionNumber: number;
  name: string;
  revisionColor: string;
  badgeBg: string;
  badgeText: string;
  checksumSha256: string;
  pageCount: number;
  sceneCount: number;
  createdAt: string;
  certificateHash?: string;
  entitiesCount: number;
}

interface SceneDiffItem {
  sceneNumber: string;
  heading: string;
  changeType: "ADDED" | "MODIFIED" | "DELETED" | "UNTOUCHED";
  addedLines: number;
  removedLines: number;
  excerpt?: string;
}

interface EntityDeltaItem {
  id: string;
  canonicalName: string;
  type: string;
  changeType: "ADDED" | "MODIFIED" | "DELETED" | "UNTOUCHED";
  priorFindingId?: string;
  priorStatus?: string;
  confidenceScore: number;
  requiresResearch: boolean;
  carryForwardAllowed: boolean;
  reason: string;
}

const MOCK_REVISIONS: ScriptRevision[] = [
  {
    id: "ver-draft-1",
    versionNumber: 1,
    name: "Production Draft 1",
    revisionColor: "White Revision",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    checksumSha256:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    pageCount: 112,
    sceneCount: 38,
    createdAt: "2026-09-01T08:30:00Z",
    certificateHash:
      "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    entitiesCount: 6,
  },
  {
    id: "ver-draft-2",
    versionNumber: 2,
    name: "Production Draft 2",
    revisionColor: "Pink Revision",
    badgeBg: "bg-pink-100",
    badgeText: "text-pink-800",
    checksumSha256:
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    pageCount: 114,
    sceneCount: 40,
    createdAt: "2026-09-04T14:15:00Z",
    certificateHash:
      "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
    entitiesCount: 7,
  },
  {
    id: "ver-draft-3",
    versionNumber: 3,
    name: "Production Draft 3",
    revisionColor: "Blue Revision (Current)",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
    checksumSha256:
      "d2a932b2b9b66904649f85e897a65f7743f55fd057165667b140f01449da8744",
    pageCount: 116,
    sceneCount: 42,
    createdAt: "2026-09-06T09:45:00Z",
    entitiesCount: 8,
  },
];

const MOCK_SCENE_DIFFS: SceneDiffItem[] = [
  {
    sceneNumber: "1",
    heading: "EXT. SKYLINE SUITE - NIGHT",
    changeType: "UNTOUCHED",
    addedLines: 0,
    removedLines: 0,
    excerpt: "Rain streaks the high-rise glass overlooking Manhattan.",
  },
  {
    sceneNumber: "2",
    heading: "INT. AEROSTREAM LUXURY LINER - CABIN - NIGHT",
    changeType: "MODIFIED",
    addedLines: 8,
    removedLines: 2,
    excerpt:
      "VANCE adjusts the Chrono-Diver watch while taking a sip of vintage scotch.",
  },
  {
    sceneNumber: "3",
    heading: "INT. CHRONO LABS SECURE ARCHIVE - CONTINUOUS",
    changeType: "DELETED",
    addedLines: 0,
    removedLines: 24,
    excerpt: "[Scene removed in Blue Revision]",
  },
  {
    sceneNumber: "4",
    heading: "INT. STARLIGHT ROOFTOP LOUNGE - NIGHT",
    changeType: "ADDED",
    addedLines: 32,
    removedLines: 0,
    excerpt:
      "Neon reflections shimmer across the terrace. A sleek billboard advertises Quantum Motors.",
  },
];

const INITIAL_ENTITY_DELTAS: EntityDeltaItem[] = [
  {
    id: "delta-1",
    canonicalName: "Dr. Alistair Vance",
    type: "PERSON_CHARACTER",
    changeType: "UNTOUCHED",
    priorFindingId: "find-001",
    priorStatus: "RESEARCH_CLEARED",
    confidenceScore: 92,
    requiresResearch: false,
    carryForwardAllowed: true,
    reason: "No script dialogue or context changes in revised scenes.",
  },
  {
    id: "delta-2",
    canonicalName: "Aerostream Luxury",
    type: "BRAND_BUSINESS_PRODUCT",
    changeType: "MODIFIED",
    priorFindingId: "find-002",
    priorStatus: "NEEDS_LICENCE",
    confidenceScore: 88,
    requiresResearch: true,
    carryForwardAllowed: false,
    reason:
      "Scene 2 dialogue modified with additional prominent brand close-up.",
  },
  {
    id: "delta-3",
    canonicalName: "Quantum Motors",
    type: "BRAND_BUSINESS_PRODUCT",
    changeType: "ADDED",
    confidenceScore: 90,
    requiresResearch: true,
    carryForwardAllowed: false,
    reason: "New brand entity introduced in Scene 4 rooftop sequence.",
  },
  {
    id: "delta-4",
    canonicalName: "Chrono Labs",
    type: "BRAND_BUSINESS_PRODUCT",
    changeType: "DELETED",
    priorFindingId: "find-004",
    priorStatus: "RESEARCH_CLEARED",
    confidenceScore: 85,
    requiresResearch: false,
    carryForwardAllowed: false,
    reason: "Entity removed along with deleted Scene 3 archive.",
  },
  {
    id: "delta-5",
    canonicalName: "The Quantum Enigma",
    type: "COPYRIGHTED_WORK",
    changeType: "UNTOUCHED",
    priorFindingId: "find-003",
    priorStatus: "RESEARCH_CLEARED",
    confidenceScore: 95,
    requiresResearch: false,
    carryForwardAllowed: true,
    reason: "Identical excerpt and prop placement across drafts.",
  },
];

interface DifferentialClearanceViewProps {
  userRole: "PRODUCER" | "REVIEWER";
  onTriggerNotification: (msg: string) => void;
}

export const DifferentialClearanceView: React.FC<
  DifferentialClearanceViewProps
> = ({ userRole, onTriggerNotification }) => {
  const [baseVersionId, setBaseVersionId] = useState<string>("ver-draft-2");
  const [targetVersionId, setTargetVersionId] = useState<string>("ver-draft-3");
  const [deltas, setDeltas] = useState<EntityDeltaItem[]>(
    INITIAL_ENTITY_DELTAS,
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runProgress, setRunProgress] = useState<number>(0);
  const [activeSubTab, setActiveSubTab] = useState<
    "entities" | "scenes" | "audit"
  >("entities");
  const [autoCarryForward, setAutoCarryForward] = useState<boolean>(true);
  const [completedResult, setCompletedResult] = useState<{
    carriedForward: number;
    dispatched: number;
    costSavedUsd: number;
    totalCostUsd: number;
    newRunId: string;
  } | null>(null);

  const baseVersion = MOCK_REVISIONS.find((r) => r.id === baseVersionId);
  const targetVersion = MOCK_REVISIONS.find((r) => r.id === targetVersionId);

  const untouchedCount = deltas.filter(
    (d) => d.changeType === "UNTOUCHED",
  ).length;
  const modifiedCount = deltas.filter(
    (d) => d.changeType === "MODIFIED",
  ).length;
  const addedCount = deltas.filter((d) => d.changeType === "ADDED").length;
  const deletedCount = deltas.filter((d) => d.changeType === "DELETED").length;
  const carriedForwardCount = autoCarryForward
    ? deltas.filter((d) => d.carryForwardAllowed).length
    : 0;
  const liveResearchCount = deltas.filter(
    (d) =>
      d.requiresResearch || (!autoCarryForward && d.changeType !== "DELETED"),
  ).length;

  const estimatedSavingsUsd = Number((carriedForwardCount * 0.75).toFixed(2));

  const handleRunDifferentialClearance = () => {
    if (userRole !== "PRODUCER") {
      onTriggerNotification(
        "Only Producers or Owners can initiate differential clearance runs.",
      );
      return;
    }

    setIsRunning(true);
    setRunProgress(15);
    setCompletedResult(null);

    setTimeout(() => {
      setRunProgress(45);
    }, 400);

    setTimeout(() => {
      setRunProgress(80);
    }, 800);

    setTimeout(() => {
      setIsRunning(false);
      setRunProgress(100);
      const carried = carriedForwardCount;
      const dispatched = liveResearchCount;
      const saved = estimatedSavingsUsd;
      const cost = Number((dispatched * 0.033).toFixed(3));

      setCompletedResult({
        carriedForward: carried,
        dispatched,
        costSavedUsd: saved,
        totalCostUsd: cost,
        newRunId: "run-diff-" + Math.floor(Math.random() * 10000),
      });

      onTriggerNotification(
        `Differential clearance complete: ${carried} findings carried forward, saving $${saved.toFixed(2)} USD!`,
      );
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Value Proposition */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-md border border-indigo-700/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <GitCompare className="w-48 h-48 text-indigo-400" />
        </div>

        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center space-x-2.5 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-xs font-semibold flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-indigo-300" />
              <span>Batch 8 Differential Engine</span>
            </span>
            <span className="text-xs text-slate-300 font-medium">
              Multi-Draft Screenplay Revision Delta
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
            Differential Script Clearance & Cost Optimizer
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            Film and television screenplays undergo constant revisions (White,
            Pink, Blue drafts). Permissa diffs script revisions scene-by-scene,
            instantly carrying forward valid clearance findings for untouched
            elements while executing live research only for newly introduced or
            modified entities.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-xs border border-white/10">
              <div className="text-xs text-slate-300 font-medium">
                Prior Cleared Carried
              </div>
              <div className="text-xl font-bold text-emerald-300 mt-0.5">
                {carriedForwardCount} Entities
              </div>
            </div>
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-xs border border-white/10">
              <div className="text-xs text-slate-300 font-medium">
                Research Dispatches
              </div>
              <div className="text-xl font-bold text-amber-300 mt-0.5">
                {liveResearchCount} Entities
              </div>
            </div>
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-xs border border-white/10">
              <div className="text-xs text-slate-300 font-medium">
                Est. Research Savings
              </div>
              <div className="text-xl font-bold text-indigo-200 mt-0.5">
                ${estimatedSavingsUsd.toFixed(2)} USD
              </div>
            </div>
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-xs border border-white/10">
              <div className="text-xs text-slate-300 font-medium">
                Time Redundant Saved
              </div>
              <div className="text-xl font-bold text-teal-300 mt-0.5">
                ~85% Faster
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Revision Selection Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Script Revision Comparison
              </h3>
              <p className="text-xs text-slate-500">
                Select baseline clearance run and target revision draft to diff
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Base Revision Select */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500">
                Base Draft:
              </span>
              <select
                value={baseVersionId}
                onChange={(e) => setBaseVersionId(e.target.value)}
                className="text-xs font-medium rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                {MOCK_REVISIONS.map((rev) => (
                  <option key={rev.id} value={rev.id}>
                    Draft {rev.versionNumber} ({rev.revisionColor})
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="w-4 h-4 text-slate-400" />

            {/* Target Revision Select */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500">
                Target Draft:
              </span>
              <select
                value={targetVersionId}
                onChange={(e) => setTargetVersionId(e.target.value)}
                className="text-xs font-medium rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                {MOCK_REVISIONS.map((rev) => (
                  <option key={rev.id} value={rev.id}>
                    Draft {rev.versionNumber} ({rev.revisionColor})
                  </option>
                ))}
              </select>
            </div>

            {/* Auto Carry-Forward Toggle */}
            <label className="flex items-center space-x-2 cursor-pointer ml-2 text-xs font-semibold text-slate-700 select-none bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                checked={autoCarryForward}
                onChange={(e) => setAutoCarryForward(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
              />
              <span>Auto Carry-Forward Passing Evidence</span>
            </label>

            {/* Execute Run Action */}
            <button
              onClick={handleRunDifferentialClearance}
              disabled={isRunning || baseVersionId === targetVersionId}
              className="btn-tactile btn-tactile-primary flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
            >
              <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
              <span>
                {isRunning
                  ? "Executing Differential Run..."
                  : "Execute Differential Run"}
              </span>
            </button>
          </div>
        </div>

        {/* Progress Bar when running */}
        {isRunning && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-700 mb-1.5">
              <span className="flex items-center space-x-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>
                  Processing revision deltas & querying statutory registers...
                </span>
              </span>
              <span>{runProgress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 transition-all duration-300"
                style={{ width: `${runProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Completed Result Callout */}
        {completedResult && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold">
                  Differential Clearance Run Completed (
                  {completedResult.newRunId})
                </h4>
                <p className="text-xs text-emerald-800">
                  Carried forward {completedResult.carriedForward} previously
                  cleared findings. Dispatched live research for{" "}
                  {completedResult.dispatched} new/modified entities.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <div className="text-xs text-emerald-700 font-medium">
                  Actual Spend: ${completedResult.totalCostUsd.toFixed(3)}
                </div>
                <div className="text-xs font-bold text-emerald-900">
                  Saved: ${completedResult.costSavedUsd.toFixed(2)} USD
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sub-Tabs: Entity Deltas / Scene Diffs / Draft History & Audit */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveSubTab("entities")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeSubTab === "entities"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Entity Delta Analysis ({deltas.length})
          </button>
          <button
            onClick={() => setActiveSubTab("scenes")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeSubTab === "scenes"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Scene & Heading Changes ({MOCK_SCENE_DIFFS.length})
          </button>
          <button
            onClick={() => setActiveSubTab("audit")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeSubTab === "audit"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Revision Chain of Custody & Seals ({MOCK_REVISIONS.length})
          </button>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Untouched ({untouchedCount})</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Added ({addedCount})</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Modified ({modifiedCount})</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Deleted ({deletedCount})</span>
          </span>
        </div>
      </div>

      {/* Sub-Tab 1: Entity Delta Grid */}
      {activeSubTab === "entities" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Entity Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Revision Delta</th>
                  <th className="px-4 py-3">Prior Clearance Status</th>
                  <th className="px-4 py-3">Action Required</th>
                  <th className="px-4 py-3">Diff Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deltas.map((delta) => {
                  return (
                    <tr
                      key={delta.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {delta.canonicalName}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono text-[11px]">
                          {delta.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {delta.changeType === "UNTOUCHED" && (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>UNTOUCHED</span>
                          </span>
                        )}
                        {delta.changeType === "MODIFIED" && (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <RefreshCw className="w-3 h-3 text-amber-600" />
                            <span>MODIFIED</span>
                          </span>
                        )}
                        {delta.changeType === "ADDED" && (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <FilePlus2 className="w-3 h-3 text-blue-600" />
                            <span>ADDED</span>
                          </span>
                        )}
                        {delta.changeType === "DELETED" && (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <Trash2 className="w-3 h-3 text-rose-600" />
                            <span>DELETED</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {delta.priorStatus ? (
                          <span className="font-semibold text-slate-700">
                            {delta.priorStatus}{" "}
                            <span className="text-slate-400 font-normal">
                              ({delta.confidenceScore}%)
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">
                            None (New)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {delta.carryForwardAllowed ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Carry-Forward Cleared</span>
                          </span>
                        ) : delta.requiresResearch ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                            <Zap className="w-3.5 h-3.5 text-amber-600" />
                            <span>Research Required</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">Omit from Run</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs">
                        {delta.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Scene & Heading Changes */}
      {activeSubTab === "scenes" && (
        <div className="space-y-3">
          {MOCK_SCENE_DIFFS.map((scene, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-xl border transition-all ${
                scene.changeType === "ADDED"
                  ? "bg-blue-50/40 border-blue-200"
                  : scene.changeType === "MODIFIED"
                    ? "bg-amber-50/40 border-amber-200"
                    : scene.changeType === "DELETED"
                      ? "bg-rose-50/40 border-rose-200 opacity-60"
                      : "bg-white border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2.5">
                  <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono text-xs font-bold">
                    SCENE {scene.sceneNumber}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 font-mono">
                    {scene.heading}
                  </h4>
                </div>
                <div className="flex items-center space-x-2">
                  {scene.changeType === "ADDED" && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      + {scene.addedLines} lines added
                    </span>
                  )}
                  {scene.changeType === "MODIFIED" && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      +{scene.addedLines} / -{scene.removedLines} lines modified
                    </span>
                  )}
                  {scene.changeType === "DELETED" && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      -{scene.removedLines} lines deleted
                    </span>
                  )}
                  {scene.changeType === "UNTOUCHED" && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      Identical in both drafts
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-600 font-mono bg-white/70 p-2 rounded-lg border border-slate-100">
                {scene.excerpt}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Sub-Tab 3: Revision Chain of Custody & Certificate Seals */}
      {activeSubTab === "audit" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Draft Version Chain of Custody & SHA-256 Checksums
            </h3>
            <p className="text-xs text-slate-500">
              Cryptographically verified chain linking every script revision
              with legal clearance findings and certificate seals.
            </p>
          </div>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {MOCK_REVISIONS.map((rev) => (
              <div key={rev.id} className="relative group">
                <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-indigo-600 ring-4 ring-white border border-indigo-700" />
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 hover:border-indigo-300 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-bold ${rev.badgeBg} ${rev.badgeText}`}
                      >
                        Draft {rev.versionNumber} ({rev.revisionColor})
                      </span>
                      <span className="text-xs font-semibold text-slate-800">
                        {rev.name}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(rev.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 mt-2 pt-2 border-t border-slate-200/60 font-mono">
                    <div>
                      <span className="text-slate-400">Script Checksum: </span>
                      <span className="text-slate-800 font-semibold truncate block">
                        {rev.checksumSha256}
                      </span>
                    </div>
                    {rev.certificateHash ? (
                      <div>
                        <span className="text-emerald-600 font-semibold flex items-center space-x-1">
                          <Fingerprint className="w-3.5 h-3.5" />
                          <span>Clearance Seal Digest: </span>
                        </span>
                        <span className="text-slate-800 font-semibold truncate block">
                          {rev.certificateHash}
                        </span>
                      </div>
                    ) : (
                      <div className="text-amber-600 italic">
                        Draft pending final legal clearance seal
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
