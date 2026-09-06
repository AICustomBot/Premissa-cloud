"use client";

import React from "react";
import {
  GOLDEN_SCRIPT_METADATA,
  type ClearanceItem,
} from "../data/golden-data";
import type { EvaluatedClearance } from "../lib/clearance-engine";
import {
  Printer,
  FileCheck2,
  ShieldCheck,
  Hash,
  Clock,
  MapPin,
  ExternalLink,
  Download,
} from "lucide-react";

interface ClearanceReportProps {
  entities: ClearanceItem[];
  evaluations: Record<string, EvaluatedClearance>;
  isApproved: boolean;
}

export const ClearanceReport: React.FC<ClearanceReportProps> = ({
  entities,
  evaluations,
  isApproved,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const reportId = "rep_0191c4a0-7b2a-7193-8412-f018a38c2014";
  const runId = "run_0191c4a0-7b2a-7193-8412-f018a38c2013";
  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
              Clearance Report &bull; Tranche 6
            </span>
            <span className="text-xs text-slate-500 font-mono">{reportId}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
            Official Screenplay Clearance Report
          </h1>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Immutable snapshot containing executive clearance findings, rewrite
            worksheet, and evidence appendix.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* Printable Document Container */}
      <div className="bg-white rounded-2xl p-8 sm:p-12 shadow-xs border border-slate-200 space-y-8 print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
        {/* Document Letterhead */}
        <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-black tracking-tight text-slate-900">
                PERMISSA
              </span>
              <span className="text-xs text-slate-500">
                &bull; Production Clearance Services
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Every frame cleared before it ships.
            </p>
          </div>

          <div className="text-right text-xs text-slate-500 space-y-1 font-mono">
            <div>Report ID: {reportId.slice(0, 16)}...</div>
            <div>Date: {generatedDate}</div>
            <div>Jurisdiction: US Entertainment Law</div>
          </div>
        </div>

        {/* Project Metadata Block */}
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">
              Project Title
            </span>
            <span className="font-bold text-slate-900 mt-1 block">
              {GOLDEN_SCRIPT_METADATA.title}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">
              Page Count
            </span>
            <span className="font-bold text-slate-900 mt-1 block">
              {GOLDEN_SCRIPT_METADATA.pageCount} Pages (6 Scenes)
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">
              Source Digest (SHA256)
            </span>
            <span className="font-mono text-indigo-700 mt-1 block truncate">
              {GOLDEN_SCRIPT_METADATA.checksumSha256.slice(0, 16)}...
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">
              Sign-Off State
            </span>
            <span className="font-bold text-emerald-700 mt-1 block">
              {isApproved ? "APPROVED FOR PRODUCTION" : "PRODUCER REVIEW"}
            </span>
          </div>
        </div>

        {/* Legal Disclaimer Box */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-relaxed">
          <strong className="text-slate-900">Mandatory Notice:</strong> This
          document reflects automated deterministic evidence research and
          reviewer collation. PERMISSA produces clearance research and evidence
          for professional review. It does not provide legal advice or clearance
          certification.
        </div>

        {/* Section 1: Executive Status Table */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            1. Executive Findings Matrix
          </h2>

          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase text-[11px]">
                  <th className="p-3.5">Canonical Entity</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Admitted Status</th>
                  <th className="p-3.5 text-center">Score</th>
                  <th className="p-3.5">Clearance Assessment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entities.map((item) => {
                  const ev = evaluations[item.id];
                  const status = ev
                    ? ev.admittedStatus
                    : item.initialProposedStatus;
                  const score = ev?.confidence.finalScore ?? 50;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="p-3.5 font-bold text-slate-900">
                        {item.canonicalName}
                      </td>
                      <td className="p-3.5 text-slate-500">
                        {item.type.replace(/_/g, " ")}
                      </td>
                      <td className="p-3.5">
                        <span className="font-mono text-[11px] font-bold text-indigo-700">
                          {status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-mono text-slate-900 font-semibold">
                        {score}/100
                      </td>
                      <td className="p-3.5 text-slate-600 text-[11px] max-w-xs leading-relaxed">
                        {item.rationale}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Rewrite Worksheet */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            2. Production Rewrite Worksheet
          </h2>
          <p className="text-xs text-slate-500">
            Mandatory modifications required to eliminate copyright, trademark,
            and false-light exposure.
          </p>

          <div className="space-y-2.5">
            {entities
              .filter((e) => e.rewriteSuggestion)
              .map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-rose-50/50 border border-rose-200 rounded-xl text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-800">
                      {item.canonicalName} ({item.type.replace(/_/g, " ")})
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      Scenes: {item.sceneIds.join(", ")}
                    </span>
                  </div>
                  <div className="text-slate-700 text-[11px] leading-relaxed">
                    <strong className="text-rose-900">Required Action:</strong>{" "}
                    {item.rewriteSuggestion}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Section 3: Evidence Appendix */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            3. Evidence Appendix & Content Hashes
          </h2>
          <div className="space-y-2 text-xs">
            {entities.map((item) => (
              <div
                key={item.id}
                className="text-slate-600 text-[11px] space-y-1"
              >
                <span className="font-semibold text-slate-900">
                  {item.canonicalName}:
                </span>
                {item.citations.map((c) => (
                  <div
                    key={c.id}
                    className="pl-3 font-mono text-[10px] text-slate-500"
                  >
                    &bull; [{c.sourceTier}] {c.title} &mdash; {c.domain} (Hash:{" "}
                    {c.contentHash})
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
