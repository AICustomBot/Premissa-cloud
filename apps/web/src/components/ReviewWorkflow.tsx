"use client";

import React, { useState } from "react";
import type { ClearanceItem } from "../data/golden-data";
import type { EvaluatedClearance } from "../lib/clearance-engine";
import {
  computeSignOffDigest,
  type ReviewerSignOffRecord,
  type ProductionLicense,
  type LegalHoldItem,
} from "../lib/cryptographic-report";
import {
  UserCheck,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  Link,
  ShieldCheck,
  RotateCcw,
  FileCheck2,
  FileBadge,
  Scale,
  Lock,
  Plus,
  Trash2,
  Check,
  Building2,
  FileText,
  BadgeAlert,
  SlidersHorizontal,
} from "lucide-react";

interface ReviewWorkflowProps {
  entities: ClearanceItem[];
  evaluations: Record<string, EvaluatedClearance>;
  userRole: "PRODUCER" | "REVIEWER";
  onApproveRun: (signOffRecord?: ReviewerSignOffRecord) => void;
  isRunApproved: boolean;
  onApplyOverride?: (entityId: string, newStatus: any, reason: string) => void;
  onTriggerNotification?: (msg: string) => void;
}

export const ReviewWorkflow: React.FC<ReviewWorkflowProps> = ({
  entities,
  evaluations,
  userRole,
  onApproveRun,
  isRunApproved,
  onApplyOverride,
  onTriggerNotification,
}) => {
  const [activeTab, setActiveTab] = useState<
    "adjudication" | "licenses" | "holds" | "commitments" | "invitations"
  >("adjudication");

  // Invitations
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Producer notes & rewrite checklist
  const [producerNotes, setProducerNotes] = useState(
    "All identified rewrite candidates (Noor Haddad, Owen Reed, Appel One, FaceFrame) have been approved for script revision prior to production shoot.",
  );
  const [checkedCommitments, setCheckedCommitments] = useState<
    Record<number, boolean>
  >({
    0: true,
    1: true,
    2: true,
    3: true,
    4: true,
  });

  // Production Licenses State
  const [licenses, setLicenses] = useState<ProductionLicense[]>([
    {
      id: "lic-01",
      entityId: "item-3",
      entityName: "Apple Inc. (Appel One)",
      licensorName: "Apple Inc. Legal & Trademark Department",
      licenseCategory: "TRADEMARK",
      scope: "Prop depiction only; or complete fictionalization to PearOS.",
      status: "WAIVER_FILED",
      executionDate: "2026-09-02",
      financialConsideration: "$0 (Script rewritten per counsel)",
    },
    {
      id: "lic-02",
      entityId: "item-12",
      entityName: "The Final Witness",
      licensorName: "Writers Guild of America Title Registry",
      licenseCategory: "COPYRIGHT",
      scope:
        "Feature film title clearance worldwide in all media in perpetuity.",
      status: "EXECUTED",
      executionDate: "2026-08-15",
      documentRef: "WGA-TR-2026-091482",
    },
  ]);

  // Legal Holds State
  const [legalHolds, setLegalHolds] = useState<LegalHoldItem[]>([
    {
      id: "hold-01",
      entityId: "item-1",
      entityName: "Noor Haddad",
      holdType: "SCRIPT_AMENDMENT_REQUIRED",
      reason:
        "Character surname collision with living NY investigative journalist; hold active until Scene 2 script amendment filed.",
      placedBy: "Elena Vance, Esq.",
      placedAt: "2026-09-05T14:30:00Z",
      resolved: false,
    },
  ]);

  // New License Form Modal
  const [showAddLicenseModal, setShowAddLicenseModal] = useState(false);
  const [newLicEntityId, setNewLicEntityId] = useState(entities[0]?.id || "");
  const [newLicLicensor, setNewLicLicensor] = useState("");
  const [newLicCategory, setNewLicCategory] =
    useState<ProductionLicense["licenseCategory"]>("TRADEMARK");
  const [newLicScope, setNewLicScope] = useState(
    "Worldwide, all media in perpetuity including theatrical, SVOD, and home video.",
  );
  const [newLicStatus, setNewLicStatus] =
    useState<ProductionLicense["status"]>("EXECUTED");

  // Formal Sign-Off Modal State
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [attorneyName, setAttorneyName] = useState("Elena Vance, Esq.");
  const [lawFirmOrDept, setLawFirmOrDept] = useState(
    "Apex Pictures Entertainment Legal Division",
  );
  const [barNumber, setBarNumber] = useState("NY Bar #5819204 (Admitted 2012)");
  const [jurisdictionAttestation, setJurisdictionAttestation] = useState(
    "New York State Unified Court System & Federal Entertainment Practice",
  );
  const [affirmationChecked, setAffirmationChecked] = useState(true);

  // Adjudication Quick-Actions
  const handleQuickAdjudicate = (
    entityId: string,
    newStatus: string,
    reason: string,
  ) => {
    if (onApplyOverride) {
      onApplyOverride(entityId, newStatus, reason);
    }
    if (onTriggerNotification) {
      onTriggerNotification(`Counsel adjudicated entity to: ${newStatus}`);
    }
  };

  const handleCreateLicense = (e: React.FormEvent) => {
    e.preventDefault();
    const targetEntity = entities.find((ent) => ent.id === newLicEntityId);
    const newLicense: ProductionLicense = {
      id: `lic-${Date.now()}`,
      entityId: newLicEntityId,
      entityName: targetEntity?.canonicalName || "Unknown Entity",
      licensorName: newLicLicensor || "Third-Party Licensor",
      licenseCategory: newLicCategory,
      scope: newLicScope,
      status: newLicStatus,
      executionDate: new Date().toISOString().slice(0, 10),
    };
    setLicenses((prev) => [newLicense, ...prev]);
    setShowAddLicenseModal(false);
    setNewLicLicensor("");
    if (onTriggerNotification) {
      onTriggerNotification(
        `Production license recorded for ${newLicense.entityName}`,
      );
    }
  };

  const handleToggleHoldResolved = (holdId: string) => {
    setLegalHolds((prev) =>
      prev.map((h) => (h.id === holdId ? { ...h, resolved: !h.resolved } : h)),
    );
    if (onTriggerNotification) {
      onTriggerNotification("Legal hold status updated.");
    }
  };

  const handleExecuteSignOff = async () => {
    if (!affirmationChecked) return;

    const signOffRecord: Omit<ReviewerSignOffRecord, "signatureDigestSha256"> =
      {
        reviewerName: attorneyName,
        organization: lawFirmOrDept,
        barOrCredentialId: barNumber,
        jurisdiction: jurisdictionAttestation,
        signedAt: new Date().toISOString(),
        affirmationStatement:
          "I hereby confirm that all 12 screenplay entities have been scrutinized under entertainment copyright, trademark, and false light standards. Subject to execution of the four documented rewrite remedies, the script is cleared for principal photography and E&O insurance submission.",
      };

    const signatureDigestSha256 = await computeSignOffDigest(signOffRecord);

    const completeRecord: ReviewerSignOffRecord = {
      ...signOffRecord,
      signatureDigestSha256,
    };

    onApproveRun(completeRecord);
    setShowSignOffModal(false);
    if (onTriggerNotification) {
      onTriggerNotification(
        `Clearance run officially approved and sealed by ${attorneyName}.`,
      );
    }
  };

  const toggleCommitment = (idx: number) => {
    setCheckedCommitments((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const commitmentsList = [
    {
      name: "Noor Haddad",
      remedy:
        "Fictionalize surname to avoid defamation match with active investigative reporter.",
    },
    {
      name: "Owen Reed",
      remedy:
        "Rename to avoid collision with living cyber investigator in NY jurisdiction.",
    },
    {
      name: "Appel One",
      remedy:
        "Eliminate phonetic brand pun to extinguish Lanham Act trademark confusion.",
    },
    {
      name: "FaceFrame",
      remedy:
        "Replace commercial facial recognition trademark with fictional software entity.",
    },
    {
      name: "Witness Protocol",
      remedy:
        "Retitle internal film to avoid festival collision with Tribeca 2025 entry.",
    },
  ];

  const completedCommitmentsCount = commitmentsList.filter(
    (_, idx) => checkedCommitments[idx],
  ).length;

  const clearedCount = entities.filter((e) => {
    const ev = evaluations[e.id];
    return (
      (ev ? ev.admittedStatus : e.initialProposedStatus) === "RESEARCH_CLEARED"
    );
  }).length;

  const rewriteCount = entities.filter((e) => {
    const ev = evaluations[e.id];
    return (
      (ev ? ev.admittedStatus : e.initialProposedStatus) === "NEEDS_REWRITE"
    );
  }).length;

  const licenceCount = entities.filter((e) => {
    const ev = evaluations[e.id];
    return (
      (ev ? ev.admittedStatus : e.initialProposedStatus) === "NEEDS_LICENCE"
    );
  }).length;

  const insufficientCount = entities.filter((e) => {
    const ev = evaluations[e.id];
    return (
      (ev ? ev.admittedStatus : e.initialProposedStatus) ===
      "INSUFFICIENT_EVIDENCE"
    );
  }).length;

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewerEmail.trim()) return;
    setInvitedEmail(reviewerEmail);
  };

  const inviteUrl = `https://permissa.app/review/invitation?token=inv_7f9b8c2d&project=the-final-witness`;

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                Review &amp; Sign-Off &bull; Tranche 5
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Production Counsel &amp; Legal Reviewer Verification
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              Legal Clearance Review &amp; Approval Flow
            </h1>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Enforce constitutional separation of powers. Producers acknowledge
              rewrite obligations; qualified entertainment legal reviewers
              verify claim admissions, issue licenses, or place formal
              restrictions.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {isRunApproved ? (
              <div className="flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs shadow-2xs">
                <FileBadge className="w-4 h-4 text-emerald-600" />
                <span>Production Run Approved &amp; Sealed</span>
              </div>
            ) : (
              <button
                onClick={() => setShowSignOffModal(true)}
                className="btn-tactile btn-tactile-emerald flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-semibold"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Execute Formal Sign-Off</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reviewer Navigation Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 p-1.5 flex flex-wrap gap-1.5 shadow-2xs">
        <button
          onClick={() => setActiveTab("adjudication")}
          className={`flex-1 min-w-[130px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "adjudication"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          1. Claim Adjudication
        </button>
        <button
          onClick={() => setActiveTab("licenses")}
          className={`flex-1 min-w-[130px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "licenses"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          2. Licenses Ledger ({licenses.length})
        </button>
        <button
          onClick={() => setActiveTab("holds")}
          className={`flex-1 min-w-[130px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "holds"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          3. Legal Holds ({legalHolds.filter((h) => !h.resolved).length})
        </button>
        <button
          onClick={() => setActiveTab("commitments")}
          className={`flex-1 min-w-[130px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "commitments"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          4. Rewrite Commitments
        </button>
        <button
          onClick={() => setActiveTab("invitations")}
          className={`flex-1 min-w-[130px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "invitations"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          5. Invite Legal Counsel
        </button>
      </div>

      {/* TAB 1: CLAIM ADJUDICATION */}
      {activeTab === "adjudication" && (
        <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                <Scale className="w-4 h-4 text-indigo-600" />
                <span>Production Counsel Claim Adjudication</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Review automated research findings and promote or override
                statuses with admissible evidence.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-500">Current Authority:</span>
              <span
                className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                  userRole === "REVIEWER"
                    ? "bg-purple-100 text-purple-800 border border-purple-200"
                    : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                }`}
              >
                {userRole === "REVIEWER"
                  ? "Legal Reviewer Mode"
                  : "Producer Mode"}
              </span>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card-stat-tile p-3.5 bg-white border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                Research Cleared
              </span>
              <span className="text-xl font-black font-mono text-emerald-700 mt-1 block">
                {clearedCount}
              </span>
              <span className="text-[10px] text-slate-400">
                Score &ge; 85 Passed
              </span>
            </div>
            <div className="card-stat-tile p-3.5 bg-white border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                Rewrites Required
              </span>
              <span className="text-xl font-black font-mono text-amber-700 mt-1 block">
                {rewriteCount}
              </span>
              <span className="text-[10px] text-slate-400">Action item</span>
            </div>
            <div className="card-stat-tile p-3.5 bg-white border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                Licenses Required
              </span>
              <span className="text-xl font-black font-mono text-blue-700 mt-1 block">
                {licenceCount}
              </span>
              <span className="text-[10px] text-slate-400">
                Agreement filed
              </span>
            </div>
            <div className="card-stat-tile p-3.5 bg-white border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                Advisory / Low
              </span>
              <span className="text-xl font-black font-mono text-slate-700 mt-1 block">
                {insufficientCount}
              </span>
              <span className="text-[10px] text-slate-400">
                Producer choice
              </span>
            </div>
          </div>

          {/* Adjudication Entity Cards */}
          <div className="space-y-3">
            {entities.map((item) => {
              const ev = evaluations[item.id];
              const status = ev
                ? ev.admittedStatus
                : item.initialProposedStatus;
              const score = ev?.confidence.finalScore ?? 50;

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-200 transition-colors shadow-2xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <span className="font-bold text-slate-900 text-sm">
                        {item.canonicalName}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 uppercase">
                        {item.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        Scenes: {item.sceneIds.join(", ")}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-semibold text-slate-600">
                        Score: {score}/100
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          status === "RESEARCH_CLEARED"
                            ? "bg-emerald-100 text-emerald-800"
                            : status === "NEEDS_LICENCE"
                              ? "bg-blue-100 text-blue-800"
                              : status === "NEEDS_REWRITE"
                                ? "bg-amber-100 text-amber-800"
                                : status === "BLOCKED"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.rationale}
                  </p>

                  {item.rewriteSuggestion && (
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
                      <strong>Prescribed Rewrite:</strong>{" "}
                      {item.rewriteSuggestion}
                    </div>
                  )}

                  {/* Counsel Quick Adjudication Controls */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      Counsel Adjudication Actions:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() =>
                          handleQuickAdjudicate(
                            item.id,
                            "RESEARCH_CLEARED",
                            "Admitted by Legal Reviewer: Statutory registry search clear; no actionable conflict.",
                          )
                        }
                        className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 transition-colors"
                      >
                        Clear (Admit)
                      </button>
                      <button
                        onClick={() =>
                          handleQuickAdjudicate(
                            item.id,
                            "NEEDS_LICENCE",
                            "Adjudicated: Requires commercial clearance or standard release agreement.",
                          )
                        }
                        className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 text-[10px] font-bold border border-blue-200 transition-colors"
                      >
                        Issue License Req
                      </button>
                      <button
                        onClick={() =>
                          handleQuickAdjudicate(
                            item.id,
                            "NEEDS_REWRITE",
                            "Adjudicated: Script modification required prior to principal photography.",
                          )
                        }
                        className="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200 transition-colors"
                      >
                        Order Rewrite
                      </button>
                      <button
                        onClick={() =>
                          handleQuickAdjudicate(
                            item.id,
                            "BLOCKED",
                            "Adjudicated: Serious trademark / false light infringement risk. Excluded from production.",
                          )
                        }
                        className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-200 transition-colors"
                      >
                        Final Block
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTION LICENSES LEDGER */}
      {activeTab === "licenses" && (
        <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>Production Licenses &amp; Releases Ledger</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Formally record and track third-party trademark licenses,
                location releases, and copyright waivers.
              </p>
            </div>

            <button
              onClick={() => setShowAddLicenseModal(true)}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Record New License</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase text-[11px]">
                  <th className="p-3.5">Entity / Asset</th>
                  <th className="p-3.5">Licensor Entity</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Scope &amp; Rights Granted</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Execution Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {licenses.map((lic) => (
                  <tr
                    key={lic.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="p-3.5 font-bold text-slate-900">
                      {lic.entityName}
                    </td>
                    <td className="p-3.5 text-slate-700">{lic.licensorName}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[10px] text-slate-700">
                        {lic.licenseCategory}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600 text-[11px] max-w-xs leading-relaxed">
                      {lic.scope}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          lic.status === "EXECUTED"
                            ? "bg-emerald-100 text-emerald-800"
                            : lic.status === "WAIVER_FILED"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {lic.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-500 text-[11px]">
                      {lic.executionDate || "Pending"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LEGAL HOLDS & RESTRICTIONS */}
      {activeTab === "holds" && (
        <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
              <Lock className="w-4 h-4 text-rose-600" />
              <span>Production Legal Holds &amp; Clearance Restrictions</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict embargoes prohibiting shooting or prop fabrication until
              specific screenplay amendments are confirmed by counsel.
            </p>
          </div>

          <div className="space-y-3">
            {legalHolds.map((hold) => (
              <div
                key={hold.id}
                className={`p-4 rounded-xl border transition-all space-y-2 ${
                  hold.resolved
                    ? "bg-slate-50/70 border-slate-200 opacity-60"
                    : "bg-rose-50/60 border-rose-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 text-sm">
                      {hold.entityName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        hold.resolved
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {hold.resolved
                        ? "HOLD RESOLVED"
                        : hold.holdType.replace(/_/g, " ")}
                    </span>
                  </div>

                  <button
                    onClick={() => handleToggleHoldResolved(hold.id)}
                    className="px-3 py-1 rounded text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors"
                  >
                    {hold.resolved ? "Re-open Hold" : "Mark as Resolved"}
                  </button>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed">
                  <strong>Grounds:</strong> {hold.reason}
                </p>

                <div className="text-[11px] text-slate-500 flex items-center space-x-3 pt-1">
                  <span>Placed By: {hold.placedBy}</span>
                  <span>&bull;</span>
                  <span>
                    Timestamp: {new Date(hold.placedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: REWRITE COMMITMENTS */}
      {activeTab === "commitments" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Mandatory Rewrite Commitments
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click to acknowledge compliance prior to principal
                    photography
                  </p>
                </div>
                <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 font-mono px-2.5 py-1 rounded-md font-bold">
                  {completedCommitmentsCount}/{commitmentsList.length}{" "}
                  Acknowledged
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(completedCommitmentsCount / commitmentsList.length) * 100}%`,
                  }}
                />
              </div>

              <div className="space-y-2.5 pt-1">
                {commitmentsList.map((item, idx) => {
                  const isChecked = !!checkedCommitments[idx];
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleCommitment(idx)}
                      className={`card-interactive flex items-start space-x-3.5 p-3.5 select-none ${
                        isChecked
                          ? "bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-400/30"
                          : "bg-white hover:bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                          isChecked
                            ? "bg-emerald-600 text-white shadow-2xs"
                            : "border border-slate-300 bg-white"
                        }`}
                      >
                        {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1">
                        <span className="font-bold text-slate-900 text-xs">
                          {item.name}:
                        </span>{" "}
                        <span className="text-slate-600 text-xs leading-relaxed">
                          {item.remedy}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-3.5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Producer Affirmation Commentary
              </h3>
              <textarea
                rows={4}
                value={producerNotes}
                onChange={(e) => setProducerNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-3.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100 leading-relaxed"
              />
              <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  Hashed into the immutable clearance report snapshot upon
                  sign-off.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: INVITE LEGAL COUNSEL */}
      {activeTab === "invitations" && (
        <div className="max-w-2xl bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-5">
          <div className="flex items-center space-x-2 text-purple-700 font-bold text-xs uppercase tracking-wider">
            <UserCheck className="w-4 h-4" />
            <span>Legal Reviewer Invitation</span>
          </div>
          <h3 className="text-base font-bold text-slate-900">
            Grant External Production Counsel Access
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Invite an independent entertainment clearance attorney or studio
            legal counsel to review findings, confirm licensing exemptions, and
            sign off.
          </p>

          <form onSubmit={handleSendInvite} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1.5">
                Counsel Email Address
              </label>
              <input
                type="email"
                placeholder="legal.counsel@studioentertainment.com"
                value={reviewerEmail}
                onChange={(e) => setReviewerEmail(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-100"
              />
            </div>

            <button
              type="submit"
              className="btn-tactile btn-tactile-purple w-full flex items-center justify-center space-x-2 py-2.5 rounded-lg text-xs font-semibold"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Issue Secure Review Invitation</span>
            </button>
          </form>

          {invitedEmail && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2.5 text-xs">
              <div className="flex items-center space-x-2 text-purple-900 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-purple-600" />
                <span>Invitation dispatched to {invitedEmail}</span>
              </div>
              <div className="flex items-center justify-between bg-white border border-purple-200 p-2 rounded-lg text-[11px] font-mono text-slate-700">
                <span className="truncate mr-2">{inviteUrl}</span>
                <button
                  onClick={handleCopyLink}
                  className="text-purple-600 hover:text-purple-800 shrink-0 font-medium transition-colors"
                >
                  {copiedLink ? "Copied!" : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Record New License Modal */}
      {showAddLicenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Record Production License Agreement
              </h3>
              <button
                onClick={() => setShowAddLicenseModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCreateLicense}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Target Entity
                </label>
                <select
                  value={newLicEntityId}
                  onChange={(e) => setNewLicEntityId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                >
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.canonicalName} ({e.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Licensor / Rights Owner
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apple Inc. Legal Department"
                  value={newLicLicensor}
                  onChange={(e) => setNewLicLicensor(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    License Category
                  </label>
                  <select
                    value={newLicCategory}
                    onChange={(e) =>
                      setNewLicCategory(
                        e.target.value as ProductionLicense["licenseCategory"],
                      )
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="TRADEMARK">Trademark</option>
                    <option value="COPYRIGHT">Copyright</option>
                    <option value="LOCATION_RELEASE">Location Release</option>
                    <option value="PERSONALITY_RIGHTS">
                      Personality Rights
                    </option>
                    <option value="MUSIC_SYNC">Music Synchronization</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={newLicStatus}
                    onChange={(e) =>
                      setNewLicStatus(
                        e.target.value as ProductionLicense["status"],
                      )
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="EXECUTED">Executed &amp; Filed</option>
                    <option value="WAIVER_FILED">Waiver Filed</option>
                    <option value="IN_NEGOTIATION">In Negotiation</option>
                    <option value="DRAFT_ISSUED">Draft Issued</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Scope &amp; Territory
                </label>
                <textarea
                  rows={2}
                  value={newLicScope}
                  onChange={(e) => setNewLicScope(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddLicenseModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs"
                >
                  Save License Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Formal Counsel Sign-Off Modal */}
      {showSignOffModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2 text-emerald-700">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">
                  Execute Production Counsel Sign-Off
                </h3>
              </div>
              <button
                onClick={() => setShowSignOffModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This action represents official production legal counsel clearance
              attestation. Once executed, an immutable cryptographic digest will
              be stamped to the legal clearance binder.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Certifying Attorney / Counsel Name
                </label>
                <input
                  type="text"
                  value={attorneyName}
                  onChange={(e) => setAttorneyName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Law Firm / Studio Legal Division
                  </label>
                  <input
                    type="text"
                    value={lawFirmOrDept}
                    onChange={(e) => setLawFirmOrDept(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    State Bar / Credential ID
                  </label>
                  <input
                    type="text"
                    value={barNumber}
                    onChange={(e) => setBarNumber(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Jurisdiction &amp; Practice
                </label>
                <input
                  type="text"
                  value={jurisdictionAttestation}
                  onChange={(e) => setJurisdictionAttestation(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-2.5">
                <input
                  type="checkbox"
                  id="affirmation"
                  checked={affirmationChecked}
                  onChange={(e) => setAffirmationChecked(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label
                  htmlFor="affirmation"
                  className="text-[11px] text-emerald-950 font-medium leading-relaxed select-none cursor-pointer"
                >
                  I certify under applicable professional ethics standards that
                  I have examined the evidence citations, evaluated the 12
                  candidate entities, and confirm that upon execution of the
                  four registered rewrite remedies, the screenplay is cleared
                  for production.
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSignOffModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!affirmationChecked}
                onClick={handleExecuteSignOff}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs shadow-xs transition-colors"
              >
                Seal &amp; Attest Clearance Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
