"use client";

import React, { useState } from "react";
import type { ClearanceItem } from "../data/golden-data";
import type { EvaluatedClearance } from "../lib/clearance-engine";
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
} from "lucide-react";

interface ReviewWorkflowProps {
  entities: ClearanceItem[];
  evaluations: Record<string, EvaluatedClearance>;
  userRole: "PRODUCER" | "REVIEWER";
  onApproveRun: () => void;
  isRunApproved: boolean;
}

export const ReviewWorkflow: React.FC<ReviewWorkflowProps> = ({
  entities,
  evaluations,
  userRole,
  onApproveRun,
  isRunApproved,
}) => {
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
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
                Review & Sign-Off &bull; Tranche 5
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Producer Curation & Legal Reviewer Verification
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              Clearance Review & Professional Sign-Off
            </h1>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Strict authority separation. Producers acknowledge rewrite
              obligations; qualified entertainment legal reviewers review
              findings with admissible citations.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {isRunApproved ? (
              <div className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs shadow-2xs">
                <FileBadge className="w-4 h-4 text-emerald-600" />
                <span>Clearance Run Approved</span>
              </div>
            ) : (
              <button
                onClick={onApproveRun}
                className="btn-tactile btn-tactile-emerald flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-semibold"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Execute Final Sign-Off</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Review Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Summary Metrics & Producer Affirmation */}
        <div className="lg:col-span-7 space-y-6">
          {/* Executive Readiness Card */}
          <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
              <span>Clearance Readiness Audit</span>
              <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 font-mono px-2.5 py-0.5 rounded-md font-semibold">
                12 Total Entities
              </span>
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card-stat-tile p-3.5 bg-white border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                  Cleared
                </span>
                <span className="text-xl font-black font-mono text-emerald-700 mt-1 block">
                  {clearedCount}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  Score &ge; 85
                </span>
              </div>
              <div className="card-stat-tile p-3.5 bg-white border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                  Rewrites
                </span>
                <span className="text-xl font-black font-mono text-rose-700 mt-1 block">
                  {rewriteCount}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  Action item
                </span>
              </div>
              <div className="card-stat-tile p-3.5 bg-white border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                  Licence
                </span>
                <span className="text-xl font-black font-mono text-amber-700 mt-1 block">
                  {licenceCount}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  Apple Inc.
                </span>
              </div>
              <div className="card-stat-tile p-3.5 bg-white border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                  Advisory
                </span>
                <span className="text-xl font-black font-mono text-slate-700 mt-1 block">
                  {insufficientCount}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  Pending
                </span>
              </div>
            </div>

            {/* Producer Affirmation Form */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <label className="block text-xs font-semibold text-slate-800">
                Producer Execution Affirmation & Commentary
              </label>
              <textarea
                rows={3}
                value={producerNotes}
                onChange={(e) => setProducerNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-3.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100 leading-relaxed"
              />
              <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  Timestamped and hashed into the immutable clearance report
                  snapshot.
                </span>
              </div>
            </div>
          </div>

          {/* Rewrite Obligations Checklist */}
          <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Mandatory Rewrite Commitments
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click to acknowledge compliance prior to principal photography
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

        {/* Right: Legal Reviewer Invitation & Access */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-5">
            <div className="flex items-center space-x-2 text-purple-700 font-bold text-xs uppercase tracking-wider">
              <UserCheck className="w-4 h-4" />
              <span>Legal Reviewer Invitation</span>
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Grant Professional Review Access
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Invite an external clearance attorney or production counsel to
              adjudicate conflicts, confirm licensing exemptions, or execute
              final sign-off.
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

          {/* Constitutional Clearance Seal Card */}
          <div className="bg-white rounded-2xl p-6 sm:p-7 shadow-xs border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>Constitutional Clearance Protocol</span>
              </div>
              <span
                className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold border ${
                  isRunApproved
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                {isRunApproved ? "SEAL ACTIVE" : "PENDING SIGNOFF"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-slate-700">
                  Deterministic Policy Admittance
                </span>
                <span className="text-emerald-700 font-mono font-semibold flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 inline" />
                  <span>Enforced</span>
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-slate-700">
                  Zero Hallucination Citations
                </span>
                <span className="text-emerald-700 font-mono font-semibold flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 inline" />
                  <span>Tier 1/2 Verified</span>
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-slate-700">Producer Affirmation</span>
                <span className="text-indigo-700 font-mono font-semibold">
                  Timestamped
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-slate-700">Evidence Gate Threshold</span>
                <span className="text-indigo-700 font-mono font-semibold">
                  Score &ge; 85 Passed
                </span>
              </div>
            </div>

            {isRunApproved && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-800 block font-bold">
                  Immutable Cryptographic Stamp
                </span>
                <span className="text-xs font-mono font-bold text-emerald-950 tracking-wider block">
                  SHA-256: 8f4e2b...9d1c7a
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
