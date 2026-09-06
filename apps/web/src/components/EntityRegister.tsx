"use client";

import React, { useState } from "react";
import type { ClearanceItem } from "../data/golden-data";
import {
  Users,
  Briefcase,
  Clapperboard,
  CheckCircle2,
  Plus,
  GitMerge,
  Search,
  Filter,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";

interface EntityRegisterProps {
  entities: ClearanceItem[];
  onToggleConfirm: (entityId: string) => void;
  onConfirmAll: () => void;
  onSelectEntity: (entityId: string) => void;
  onLaunchClearanceRun: () => void;
}

export const EntityRegister: React.FC<EntityRegisterProps> = ({
  entities,
  onToggleConfirm,
  onConfirmAll,
  onSelectEntity,
  onLaunchClearanceRun,
}) => {
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityType, setNewEntityType] = useState<ClearanceItem["type"]>(
    "BRAND_BUSINESS_PRODUCT",
  );

  const filtered = entities.filter((e) => {
    const matchesType = selectedType === "ALL" || e.type === selectedType;
    const matchesSearch =
      e.canonicalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.aliases.some((a) =>
        a.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    return matchesType && matchesSearch;
  });

  const confirmedCount = entities.filter((e) => e.confirmedByProducer).length;
  const allConfirmed = confirmedCount === entities.length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                Entity Register &bull; Tranche 3
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Screenplay Curation & Normalization
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              Curated Entity Register
            </h1>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              12 canonical entities extracted from <em>The Final Witness</em>.
              Producers curate aliases and confirm identity before clearance
              research proceeds.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0">
            <button
              onClick={onConfirmAll}
              className="btn-tactile btn-tactile-secondary flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{allConfirmed ? "Uncheck All" : "Confirm All 12"}</span>
            </button>

            <button
              onClick={onLaunchClearanceRun}
              className="btn-tactile btn-tactile-primary flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold"
            >
              <Sparkles className="w-4 h-4" />
              <span>Evaluate Evidence Gate</span>
            </button>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Category Chips */}
          <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 scrollbar-none">
            {[
              { id: "ALL", label: "All Entities", count: entities.length },
              {
                id: "PERSON_CHARACTER",
                label: "Characters",
                count: entities.filter((e) => e.type === "PERSON_CHARACTER")
                  .length,
              },
              {
                id: "BRAND_BUSINESS_PRODUCT",
                label: "Brands & Products",
                count: entities.filter(
                  (e) => e.type === "BRAND_BUSINESS_PRODUCT",
                ).length,
              },
              {
                id: "PRODUCTION_TITLE",
                label: "Titles",
                count: entities.filter((e) => e.type === "PRODUCTION_TITLE")
                  .length,
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                className={`btn-tactile px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  selectedType === t.id
                    ? "btn-tactile-primary"
                    : "btn-tactile-secondary text-slate-700"
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          {/* Search Field */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search canonical name or alias..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100"
            />
          </div>
        </div>
      </div>

      {/* Entity Table */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-xs border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 w-12 text-center">Confirm</th>
                <th className="py-3.5 px-4">Canonical Name</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Aliases</th>
                <th className="py-3.5 px-4 text-center">Mentions</th>
                <th className="py-3.5 px-4">Scenes</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => onToggleConfirm(item.id)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        {item.confirmedByProducer ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                        )}
                      </button>
                    </td>

                    {/* Name */}
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <button
                        onClick={() => onSelectEntity(item.id)}
                        className="hover:text-indigo-600 transition-colors text-left font-bold"
                      >
                        {item.canonicalName}
                      </button>
                    </td>

                    {/* Type Badge */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${
                          item.type === "PERSON_CHARACTER"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : item.type === "BRAND_BUSINESS_PRODUCT"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {item.type === "PERSON_CHARACTER" && (
                          <Users className="w-3 h-3 mr-1" />
                        )}
                        {item.type === "BRAND_BUSINESS_PRODUCT" && (
                          <Briefcase className="w-3 h-3 mr-1" />
                        )}
                        {item.type === "PRODUCTION_TITLE" && (
                          <Clapperboard className="w-3 h-3 mr-1" />
                        )}
                        <span>{item.type.replace(/_/g, " ")}</span>
                      </span>
                    </td>

                    {/* Aliases */}
                    <td className="py-3 px-4 text-slate-500">
                      <div className="flex flex-wrap gap-1">
                        {item.aliases.map((alias, aIdx) => (
                          <span
                            key={aIdx}
                            className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] text-slate-700 font-medium"
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Mentions */}
                    <td className="py-3 px-4 text-center font-mono text-indigo-700 font-bold">
                      {item.mentionsCount}
                    </td>

                    {/* Scenes */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {item.sceneIds.map((scId) => (
                          <span
                            key={scId}
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono border border-slate-200"
                          >
                            {scId.replace("scene-", "Sc.")}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onSelectEntity(item.id)}
                        className="btn-tactile btn-tactile-secondary px-2.5 py-1 rounded-md text-indigo-700 text-[11px] font-semibold"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
