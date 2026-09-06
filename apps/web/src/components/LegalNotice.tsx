import React from "react";
import { ShieldCheck, Scale, FileLock2 } from "lucide-react";

export const LegalNotice: React.FC = () => {
  return (
    <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-2 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
        <div className="flex items-start sm:items-center space-x-2">
          <div className="p-1 rounded-md bg-indigo-50 border border-indigo-200 shrink-0 mt-0.5 sm:mt-0">
            <Scale className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <p className="text-slate-600 text-xs">
            <strong className="text-slate-900 font-semibold">
              Legal Boundary Notice:
            </strong>{" "}
            PERMISSA produces clearance research and evidence for professional
            review. It does not provide legal advice or clearance certification.
            Every frame cleared before it ships.
          </p>
        </div>
        <div className="flex items-center space-x-3 shrink-0 text-slate-600 text-[11px]">
          <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-white border border-slate-200">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span className="font-medium">Gate &ge; 85 Req.</span>
          </div>
          <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-white border border-slate-200">
            <FileLock2 className="w-3 h-3 text-indigo-600" />
            <span className="font-medium">Deterministic Policy</span>
          </div>
        </div>
      </div>
    </div>
  );
};
