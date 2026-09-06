"use client";

import React, { useState } from "react";
import type { ClearanceItem } from "../data/golden-data";
import { generateUuidV7 } from "@permissa/contracts";
import {
  Users,
  Briefcase,
  Clapperboard,
  CheckCircle2,
  Plus,
  GitMerge,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Edit3,
  X,
  AlertTriangle,
} from "lucide-react";

interface EntityRegisterProps {
  entities: ClearanceItem[];
  userRole?: string;
  onToggleConfirm: (entityId: string) => void;
  onConfirmAll: () => void;
  onSelectEntity: (entityId: string) => void;
  onLaunchClearanceRun: () => void;
  onMergeEntities?: (
    survivorId: string,
    mergedIds: string[],
    expectedVersions: Record<string, number>,
  ) => Promise<void> | void;
  onUpdateEntity?: (entity: ClearanceItem) => Promise<void> | void;
  onAddEntity?: (newEntity: ClearanceItem) => Promise<void> | void;
}

export const EntityRegister: React.FC<EntityRegisterProps> = ({
  entities,
  userRole = "PRODUCER",
  onToggleConfirm,
  onConfirmAll,
  onSelectEntity,
  onLaunchClearanceRun,
  onMergeEntities,
  onUpdateEntity,
  onAddEntity,
}) => {
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Multi-select for merging
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [survivorId, setSurvivorId] = useState<string>("");

  // Edit / Curate modal
  const [editingEntity, setEditingEntity] = useState<ClearanceItem | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [editType, setEditType] =
    useState<ClearanceItem["type"]>("PERSON_CHARACTER");
  const [editAliases, setEditAliases] = useState<string[]>([]);
  const [newAliasInput, setNewAliasInput] = useState("");

  // Add Candidate modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] =
    useState<ClearanceItem["type"]>("PERSON_CHARACTER");
  const [newAliasesInput, setNewAliasesInput] = useState("");

  const isProducer = userRole === "PRODUCER" || userRole === "OWNER";

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
  const allConfirmed =
    entities.length > 0 && confirmedCount === entities.length;

  const toggleSelectForMerge = (id: string) => {
    setSelectedForMerge((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleOpenMergeModal = () => {
    if (selectedForMerge.length < 2) return;
    setSurvivorId(selectedForMerge[0] ?? "");
    setShowMergeModal(true);
  };

  const handleExecuteMerge = async () => {
    if (!survivorId || selectedForMerge.length < 2) return;
    const mergedIds = selectedForMerge.filter((id) => id !== survivorId);
    const expectedVersions: Record<string, number> = {};

    for (const id of selectedForMerge) {
      const ent = entities.find((e) => e.id === id);
      if (ent) {
        expectedVersions[id] = ent.version ?? 1;
      }
    }

    if (onMergeEntities) {
      await onMergeEntities(survivorId, mergedIds, expectedVersions);
    }

    setSelectedForMerge([]);
    setShowMergeModal(false);
  };

  const handleOpenEdit = (entity: ClearanceItem) => {
    setEditingEntity(entity);
    setEditName(entity.canonicalName);
    setEditType(entity.type);
    setEditAliases([...entity.aliases]);
    setNewAliasInput("");
  };

  const handleSaveEdit = async () => {
    if (!editingEntity || !editName.trim()) return;
    const updated: ClearanceItem = {
      ...editingEntity,
      canonicalName: editName.trim(),
      type: editType,
      aliases: editAliases,
      version: (editingEntity.version ?? 1) + 1,
    };
    if (onUpdateEntity) {
      await onUpdateEntity(updated);
    }
    setEditingEntity(null);
  };

  const handleAddAliasToEdit = () => {
    const trimmed = newAliasInput.trim();
    if (trimmed && !editAliases.includes(trimmed)) {
      setEditAliases([...editAliases, trimmed]);
      setNewAliasInput("");
    }
  };

  const handleRemoveAliasFromEdit = (aliasToRemove: string) => {
    setEditAliases(editAliases.filter((a) => a !== aliasToRemove));
  };

  const handleSaveNewEntity = async () => {
    if (!newName.trim()) return;
    const parsedAliases = newAliasesInput
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    const newEntity: ClearanceItem = {
      id: generateUuidV7(),
      canonicalName: newName.trim(),
      type: newType,
      aliases: parsedAliases,
      mentionsCount: 1,
      sceneIds: ["scene-1"],
      initialProposedStatus: "INSUFFICIENT_EVIDENCE",
      rationale:
        "Manually registered candidate entity. Awaiting Producer confirmation.",
      citations: [],
      confidenceInput: {
        authority: "NONE",
        independence: "SINGLE_SOURCE",
        match: "EXACT_CORROBORATED",
        freshnessValid: true,
        context: "COMPLETE",
        unresolvedConflict: false,
        providerFailed: false,
        budgetLimited: false,
        citationUnreachable: false,
        hasAdmissibleCitation: false,
        evidenceExpired: false,
      },
      confirmedByProducer: false,
      version: 1,
    };

    if (onAddEntity) {
      await onAddEntity(newEntity);
    }

    setNewName("");
    setNewAliasesInput("");
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Producer Confirmation Constitutional Gate Banner */}
      <div
        className={`border rounded-2xl p-5 shadow-xs transition-all ${
          allConfirmed
            ? "bg-emerald-50/70 border-emerald-200"
            : "bg-amber-50/70 border-amber-200"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div
              className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                allConfirmed
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {allConfirmed ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900">
                  {allConfirmed
                    ? "Producer Confirmation Gate Cleared"
                    : "Constitutional Gate Active: Producer Confirmation Required"}
                </h3>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-bold ${
                    allConfirmed
                      ? "bg-emerald-200 text-emerald-800"
                      : "bg-amber-200 text-amber-800"
                  }`}
                >
                  {confirmedCount} of {entities.length} Confirmed
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                {allConfirmed
                  ? "All canonical entities have been reviewed and verified by a Producer. Clearance research runs are authorized to proceed."
                  : "No clearance research runs can be scheduled or dispatched until a Producer reviews and confirms the extracted entity roster. Non-producer accounts cannot bypass this gate."}
              </p>
              {!isProducer && (
                <div className="mt-2 text-[11px] font-semibold text-amber-800 bg-amber-100/60 px-2.5 py-1 rounded-md inline-flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  <span>
                    Current Role: {userRole}. Only accounts with PRODUCER or
                    OWNER clearance can confirm entities or authorize runs.
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
            <button
              onClick={onConfirmAll}
              disabled={!isProducer}
              title={
                !isProducer
                  ? "Producer role required to confirm entities"
                  : undefined
              }
              className={`btn-tactile flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold ${
                !isProducer
                  ? "opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200"
                  : allConfirmed
                    ? "btn-tactile-secondary text-slate-700"
                    : "bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {allConfirmed ? "Unconfirm All" : "Confirm All Roster"}
              </span>
            </button>

            <button
              onClick={onLaunchClearanceRun}
              disabled={!allConfirmed}
              title={
                !allConfirmed
                  ? "Producer confirmation required before evaluating evidence gate"
                  : undefined
              }
              className={`btn-tactile flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold ${
                !allConfirmed
                  ? "opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200"
                  : "btn-tactile-primary"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Evaluate Evidence Gate</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Bulk Action Bar for Deduplication / Merge */}
      {selectedForMerge.length > 0 && (
        <div className="bg-slate-900 text-white rounded-xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 border border-slate-800 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <GitMerge className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white">
                {selectedForMerge.length} Entities Selected for Deduplication
              </span>
              <span className="text-[11px] text-slate-400 ml-2">
                (Consolidate name variations & map aliases with version control)
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedForMerge([])}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleOpenMergeModal}
              disabled={selectedForMerge.length < 2 || !isProducer}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                selectedForMerge.length < 2 || !isProducer
                  ? "opacity-50 cursor-not-allowed bg-slate-800 text-slate-500"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
              }`}
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Merge & Map Aliases</span>
            </button>
          </div>
        </div>
      )}

      {/* Header Banner & Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                Batch 3 Pipeline &bull; Candidate Extraction & Roster Gate
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Server-Side UUIDv7 Identification
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              Screenplay Entity Register
            </h1>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Canonical entities extracted from screenplay scenes. Producers
              curate aliases, merge duplicates, and enforce the confirmation
              gate before research synthesis.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0">
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-tactile btn-tactile-secondary flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700"
            >
              <Plus className="w-4 h-4 text-indigo-600" />
              <span>Add Candidate Entity</span>
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
          <div className="relative w-full sm:w-64" suppressHydrationWarning>
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search canonical name or alias..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              suppressHydrationWarning
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
                <th className="py-3.5 px-3 w-10 text-center">Merge</th>
                <th className="py-3.5 px-3 w-12 text-center">Gate</th>
                <th className="py-3.5 px-4">Canonical Name</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Aliases (Mapped Variations)</th>
                <th className="py-3.5 px-3 text-center">Version</th>
                <th className="py-3.5 px-3 text-center">Mentions</th>
                <th className="py-3.5 px-4">Scenes</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const isSelectedForMerge = selectedForMerge.includes(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`transition-colors group ${
                      isSelectedForMerge
                        ? "bg-indigo-50/50"
                        : "hover:bg-slate-50/70"
                    }`}
                  >
                    {/* Merge Selection Checkbox */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelectedForMerge}
                        onChange={() => toggleSelectForMerge(item.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>

                    {/* Producer Confirmation Checkbox */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => onToggleConfirm(item.id)}
                        disabled={!isProducer}
                        title={
                          !isProducer
                            ? "Producer role required to confirm"
                            : item.confirmedByProducer
                              ? "Confirmed by Producer (Click to revoke)"
                              : "Pending Producer confirmation"
                        }
                        className={`transition-colors ${
                          !isProducer
                            ? "cursor-not-allowed opacity-50 text-slate-300"
                            : "text-slate-400 hover:text-indigo-600"
                        }`}
                      >
                        {item.confirmedByProducer ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                        )}
                      </button>
                    </td>

                    {/* Canonical Name */}
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <button
                        onClick={() => onSelectEntity(item.id)}
                        className="hover:text-indigo-600 transition-colors text-left font-bold"
                      >
                        {item.canonicalName}
                      </button>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {item.id.length > 20
                          ? `${item.id.slice(0, 18)}...`
                          : item.id}
                      </div>
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
                      {item.aliases.length > 0 ? (
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
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          No aliases mapped
                        </span>
                      )}
                    </td>

                    {/* Version Precondition Badge */}
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        v{item.version ?? 1}
                      </span>
                    </td>

                    {/* Mentions */}
                    <td className="py-3 px-3 text-center font-mono text-indigo-700 font-bold">
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

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="btn-tactile btn-tactile-secondary px-2.5 py-1 rounded-md text-slate-700 text-[11px] font-semibold flex items-center space-x-1"
                        >
                          <Edit3 className="w-3 h-3 text-slate-500" />
                          <span>Curate</span>
                        </button>

                        <button
                          onClick={() => onSelectEntity(item.id)}
                          className="btn-tactile btn-tactile-secondary px-2.5 py-1 rounded-md text-indigo-700 text-[11px] font-semibold"
                        >
                          Inspect
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Merge & Deduplication Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Merge Entities & Map Aliases
                  </h3>
                  <p className="text-xs text-slate-500">
                    Consolidate name variations into one canonical record with
                    version preconditions.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMergeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-800 block">
                Select the Canonical Survivor Record:
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedForMerge.map((id) => {
                  const ent = entities.find((e) => e.id === id);
                  if (!ent) return null;
                  const isSurvivor = survivorId === id;
                  return (
                    <label
                      key={id}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        isSurvivor
                          ? "bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-200"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          name="survivor"
                          checked={isSurvivor}
                          onChange={() => setSurvivorId(id)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {ent.canonicalName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {ent.type} &bull; {ent.mentionsCount} mentions
                            &bull; v{ent.version ?? 1}
                          </div>
                        </div>
                      </div>
                      {isSurvivor && (
                        <span className="text-[10px] font-bold text-indigo-700 uppercase bg-indigo-100 px-2 py-0.5 rounded">
                          Canonical
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Summary of what will happen */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800">
                  Merge Transformation Rules:
                </div>
                <div>
                  &bull; The non-surviving entities will be mapped as aliases
                  into the survivor.
                </div>
                <div>
                  &bull; All scene mentions will be combined into the canonical
                  record.
                </div>
                <div>
                  &bull; Aggregate version will increment from{" "}
                  <code className="bg-slate-200 px-1 rounded">
                    v{entities.find((e) => e.id === survivorId)?.version ?? 1}
                  </code>{" "}
                  to{" "}
                  <code className="bg-slate-200 px-1 rounded">
                    v
                    {(entities.find((e) => e.id === survivorId)?.version ?? 1) +
                      1}
                  </code>
                  .
                </div>
                <div>
                  &bull; A content-free tamper-evident audit log entry will be
                  emitted.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowMergeModal(false)}
                className="btn-tactile btn-tactile-secondary px-4 py-2 rounded-lg text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteMerge}
                className="btn-tactile btn-tactile-primary px-4 py-2 rounded-lg text-xs font-semibold"
              >
                Confirm & Execute Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Curate / Edit Entity Modal */}
      {editingEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Curate Canonical Entity
                </h3>
                <p className="text-xs text-slate-500">
                  Manage naming, aliases, and category for clearance review.
                </p>
              </div>
              <button
                onClick={() => setEditingEntity(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Canonical Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Category Type
                </label>
                <select
                  value={editType}
                  onChange={(e) =>
                    setEditType(e.target.value as ClearanceItem["type"])
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-indigo-600 bg-white"
                >
                  <option value="PERSON_CHARACTER">Person / Character</option>
                  <option value="BRAND_BUSINESS_PRODUCT">
                    Brand / Business / Product
                  </option>
                  <option value="PRODUCTION_TITLE">Production Title</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Mapped Aliases ({editAliases.length})
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px] p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  {editAliases.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">
                      No aliases mapped
                    </span>
                  ) : (
                    editAliases.map((alias) => (
                      <span
                        key={alias}
                        className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] text-slate-700"
                      >
                        <span>{alias}</span>
                        <button
                          onClick={() => handleRemoveAliasFromEdit(alias)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Add alias (e.g. Voss, Layla)..."
                    value={newAliasInput}
                    onChange={(e) => setNewAliasInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddAliasToEdit();
                      }
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddAliasToEdit}
                    className="btn-tactile btn-tactile-secondary px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700"
                  >
                    Add Alias
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 pt-1">
                Precondition: Saving will increment entity version from{" "}
                <code className="font-mono">v{editingEntity.version ?? 1}</code>{" "}
                to{" "}
                <code className="font-mono">
                  v{(editingEntity.version ?? 1) + 1}
                </code>
                .
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingEntity(null)}
                className="btn-tactile btn-tactile-secondary px-4 py-2 rounded-lg text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="btn-tactile btn-tactile-primary px-4 py-2 rounded-lg text-xs font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Add Candidate Entity
                </h3>
                <p className="text-xs text-slate-500">
                  Register a canonical entity manually with server-side UUIDv7
                  identification.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Canonical Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Drone Systems"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Category Type
                </label>
                <select
                  value={newType}
                  onChange={(e) =>
                    setNewType(e.target.value as ClearanceItem["type"])
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-indigo-600 bg-white"
                >
                  <option value="PERSON_CHARACTER">Person / Character</option>
                  <option value="BRAND_BUSINESS_PRODUCT">
                    Brand / Business / Product
                  </option>
                  <option value="PRODUCTION_TITLE">Production Title</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Aliases (Comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Drone, ADS, Apex"
                  value={newAliasesInput}
                  onChange={(e) => setNewAliasesInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAddModal(false)}
                className="btn-tactile btn-tactile-secondary px-4 py-2 rounded-lg text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewEntity}
                disabled={!newName.trim()}
                className={`btn-tactile px-4 py-2 rounded-lg text-xs font-semibold ${
                  !newName.trim()
                    ? "opacity-50 cursor-not-allowed bg-slate-100 text-slate-400"
                    : "btn-tactile-primary"
                }`}
              >
                Create Entity
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
