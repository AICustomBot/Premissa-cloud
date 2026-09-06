"use client";

import React, { useState } from "react";
import {
  GOLDEN_SCRIPT_METADATA,
  GOLDEN_SCENES,
  type SceneItem,
} from "../data/golden-data";
import {
  FileText,
  ShieldCheck,
  Languages,
  AlertTriangle,
  Hash,
  Clock,
  MapPin,
  Sparkles,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

interface ScreenplayViewerProps {
  onSelectEntity?: (entityId: string) => void;
}

export const ScreenplayViewer: React.FC<ScreenplayViewerProps> = ({
  onSelectEntity,
}) => {
  const [activeSceneId, setActiveSceneId] = useState<string>("scene-1");
  const [searchQuery, setSearchQuery] = useState("");

  const activeScene =
    GOLDEN_SCENES.find((s) => s.id === activeSceneId) ?? GOLDEN_SCENES[0]!;

  const filteredScenes = GOLDEN_SCENES.filter(
    (s) =>
      s.heading.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.summary.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Script Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                Script Ingestion &bull; Tranche 2
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {GOLDEN_SCRIPT_METADATA.version}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              {GOLDEN_SCRIPT_METADATA.title}
            </h1>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Genre: {GOLDEN_SCRIPT_METADATA.genre} &bull; Jurisdiction:{" "}
              {GOLDEN_SCRIPT_METADATA.jurisdiction} &bull;{" "}
              {GOLDEN_SCRIPT_METADATA.pageCount} Pages &bull;{" "}
              {GOLDEN_SCRIPT_METADATA.sceneCount} Scenes
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
              <Languages className="w-4 h-4 text-indigo-600" />
              <span className="text-slate-700 font-medium">
                Bilingual (EN / AR)
              </span>
            </div>
            <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-800 font-medium">
                Injection Filter Active
              </span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-500">
              <Hash className="w-3.5 h-3.5" />
              <span>
                {GOLDEN_SCRIPT_METADATA.checksumSha256.slice(0, 12)}...
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Screenplay Content Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Scene Outline Nav */}
        <div className="lg:col-span-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter scenes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100"
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

          <div className="space-y-2.5">
            {filteredScenes.map((scene) => {
              const isSelected = scene.id === activeSceneId;
              return (
                <button
                  key={scene.id}
                  onClick={() => setActiveSceneId(scene.id)}
                  className={`card-interactive w-full text-left p-4 select-none ${
                    isSelected
                      ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/25 shadow-xs"
                      : "bg-white hover:bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                      SCENE {scene.ordinal}
                    </span>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono font-semibold">
                        {scene.detectedEntityIds.length} entities
                      </span>
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{scene.timeOfDay}</span>
                      </div>
                    </div>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 mt-2 line-clamp-1 font-mono">
                    {scene.heading}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {scene.summary}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Screenplay Scene Reader */}
        <div className="lg:col-span-8">
          <div className="card-panel p-6 sm:p-8 font-mono text-sm space-y-6">
            {/* Scene Header */}
            <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2 text-xs text-indigo-600 font-sans font-semibold uppercase tracking-wider">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{activeScene.location}</span>
                  <span>&bull;</span>
                  <span>{activeScene.timeOfDay}</span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-1.5">
                  {activeScene.heading}
                </h2>
              </div>

              {/* Prev / Next Scene Switcher */}
              <div className="flex items-center space-x-2 font-sans shrink-0">
                {(() => {
                  const currentIndex = GOLDEN_SCENES.findIndex(
                    (s) => s.id === activeSceneId,
                  );
                  const prevScene = GOLDEN_SCENES[currentIndex - 1];
                  const nextScene = GOLDEN_SCENES[currentIndex + 1];
                  return (
                    <>
                      <button
                        onClick={() =>
                          prevScene && setActiveSceneId(prevScene.id)
                        }
                        disabled={!prevScene}
                        className="btn-tactile btn-tactile-secondary p-1.5 rounded-lg text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Previous Scene"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-slate-600 font-mono font-semibold">
                        {currentIndex + 1} / {GOLDEN_SCENES.length}
                      </span>
                      <button
                        onClick={() =>
                          nextScene && setActiveSceneId(nextScene.id)
                        }
                        disabled={!nextScene}
                        className="btn-tactile btn-tactile-secondary p-1.5 rounded-lg text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Next Scene"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Script Dialogue & Action */}
            <div className="space-y-4 max-w-2xl mx-auto py-2">
              {activeScene.lines.map((line, idx) => {
                if (line.speaker) {
                  return (
                    <div key={idx} className="space-y-1.5 my-4">
                      <div className="text-center font-bold text-slate-500 text-xs tracking-widest uppercase font-sans">
                        {line.speaker}
                      </div>
                      {line.isArabic ? (
                        <div
                          className="text-center text-rose-900 font-sans text-lg font-bold py-3 px-4 bg-rose-50 border border-rose-200 rounded-xl"
                          dir="rtl"
                        >
                          {line.text}
                          <span
                            className="block text-xs font-mono text-slate-500 font-normal mt-1"
                            dir="ltr"
                          >
                            (Arabic Warning: &quot;This image is
                            fabricated&quot;)
                          </span>
                        </div>
                      ) : (
                        <div className="text-center text-slate-800 text-xs sm:text-sm px-6 max-w-md mx-auto leading-relaxed">
                          {line.text}
                        </div>
                      )}
                    </div>
                  );
                }

                // Action / Description / Neutralized Injection Line
                const isInjectionLine = line.text.includes(
                  "INJECTION STRING DETECTED",
                );
                return (
                  <div
                    key={idx}
                    className={`text-xs sm:text-sm text-slate-600 leading-relaxed ${
                      isInjectionLine
                        ? "p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-sans"
                        : "italic"
                    }`}
                  >
                    {isInjectionLine && (
                      <div className="flex items-center space-x-1.5 font-bold mb-1 text-amber-800">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Deterministic Security Filter Applied</span>
                      </div>
                    )}
                    {line.text}
                  </div>
                );
              })}
            </div>

            {/* Detected Entities Footer */}
            <div className="mt-8 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-2 font-sans">
              <span className="text-xs text-slate-600 font-medium mr-1">
                Entities detected in scene (click to inspect evidence):
              </span>
              {activeScene.detectedEntityIds.map((entId) => (
                <button
                  key={entId}
                  onClick={() => onSelectEntity && onSelectEntity(entId)}
                  className="btn-tactile btn-tactile-secondary text-[11px] px-2.5 py-1 rounded-md text-indigo-700 font-mono flex items-center space-x-1.5 group cursor-pointer font-semibold"
                  title={`Inspect clearance finding for ${entId}`}
                >
                  <span>{entId}</span>
                  <ExternalLink className="w-3 h-3 text-indigo-500 group-hover:scale-110 transition-transform" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
