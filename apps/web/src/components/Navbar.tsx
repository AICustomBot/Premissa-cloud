"use client";

import React from "react";
import {
  ShieldAlert,
  Coins,
  UserCheck,
  Layers,
  ClipboardCheck,
  FileText,
  FileCheck2,
  Activity,
  Milestone,
  GitCompare,
  ShieldCheck,
} from "lucide-react";
import { PresenceBar } from "./PresenceBar";
import type { UserPresence } from "../lib/presence-sync";
import type { TenantUser } from "./ProjectWorkspaceBar";

export type NavTab =
  | "board"
  | "entities"
  | "script"
  | "differential"
  | "review"
  | "report"
  | "audit"
  | "ops"
  | "roadmap";

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  userRole: "PRODUCER" | "REVIEWER";
  onToggleRole: () => void;
  runStatus: "PRODUCER_REVIEW" | "APPROVED" | "REJECTED";
  budgetUsedUsd: number;
  budgetCapUsd: number;
  activePresences?: UserPresence[];
  currentUser?: TenantUser;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  userRole,
  onToggleRole,
  runStatus,
  budgetUsedUsd,
  budgetCapUsd,
  activePresences = [],
  currentUser,
}) => {
  const tabs = [
    { id: "board", label: "Risk Board", icon: Layers, tooltip: "Risk Board" },
    {
      id: "entities",
      label: "Entities",
      icon: ClipboardCheck,
      tooltip: "Entity Register",
    },
    {
      id: "script",
      label: "Script",
      icon: FileText,
      tooltip: "Screenplay Ingestion",
    },
    {
      id: "differential",
      label: "Delta",
      icon: GitCompare,
      tooltip: "Revision Delta",
    },
    { id: "review", label: "Review", icon: UserCheck, tooltip: "Legal Review" },
    {
      id: "report",
      label: "Report",
      icon: FileCheck2,
      tooltip: "Clearance Report",
    },
    { id: "audit", label: "Audit", icon: ShieldCheck, tooltip: "Audit Ledger" },
    {
      id: "ops",
      label: "Operations",
      icon: Activity,
      tooltip: "Operations & Safety",
    },
    { id: "roadmap", label: "Roadmap", icon: Milestone, tooltip: "Roadmap" },
  ] as const;

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[64px] py-1.5 gap-3">
          {/* Logo & Brand Identity */}
          <div className="flex items-center space-x-3 shrink-0">
            <div
              id="brand-logo-icon"
              className="h-9 w-9 rounded-xl bg-indigo-600 border border-indigo-500/40 flex items-center justify-center shadow-xs text-white"
            >
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1
                  id="brand-heading"
                  className="text-base font-bold tracking-tight text-slate-900 m-0 leading-none"
                >
                  PERMISSA
                </h1>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  v0.1
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-none hidden sm:block">
                Evidence-Gated Screenplay Clearance
              </p>
            </div>
          </div>

          {/* Navigation Links - Simple, Clean & Responsive */}
          <nav
            className="hidden md:flex items-center space-x-1 p-1 rounded-xl bg-slate-100/90 border border-slate-200/90 shadow-inner overflow-x-auto scrollbar-none shrink"
            aria-label="Main Navigation"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  onClick={() => onTabChange(tab.id as NavTab)}
                  aria-current={isActive ? "page" : undefined}
                  title={tab.tooltip}
                  className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 active:translate-y-[0.5px] shrink-0 ${
                    isActive
                      ? "bg-white text-slate-900 border border-slate-200/90 shadow-[0_1px_3px_rgba(15,23,42,0.08),inset_0_1px_0_#ffffff] font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/70 hover:shadow-2xs"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-indigo-600" : "text-slate-500"}`}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Controls: Role, Live Multi-User Sync, Budget & Status */}
          <div className="flex items-center space-x-3 shrink-0">
            {/* Run Cost & Status Badge */}
            <div className="hidden xl:flex items-center space-x-2">
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{runStatus}</span>
              </div>
              <div className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs text-slate-700 font-medium shadow-[inset_0_1px_0_#ffffff,0_1px_2px_rgba(15,23,42,0.04)]">
                <Coins className="w-3.5 h-3.5 text-amber-500" />
                <span>${budgetUsedUsd.toFixed(2)}</span>
              </div>
            </div>

            {/* Role Switcher with Live Multi-User Sync Label directly underneath */}
            <div className="flex flex-col items-end shrink-0 justify-center">
              <button
                id="role-switch-btn"
                onClick={onToggleRole}
                title="Toggle role between Producer and Legal Reviewer"
                className={`btn-tactile flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  userRole === "REVIEWER"
                    ? "btn-tactile-purple"
                    : "btn-tactile-primary"
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-white" />
                <span>Role: {userRole}</span>
              </button>

              {/* (Live Multi-user Sync) Label directly under Role Button */}
              <div
                id="live-multiuser-sync-status"
                title={`${activePresences.length + 1} active collaborators in workspace`}
                className="flex items-center space-x-1 text-[10px] font-medium text-emerald-700 mt-1 cursor-default select-none"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>(Live Multi-user Sync)</span>
                {activePresences.length > 0 && (
                  <span className="text-slate-400 font-normal">
                    · {activePresences.length + 1}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex md:hidden overflow-x-auto py-2 space-x-1.5 border-t border-slate-100 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id as NavTab)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all active:translate-y-[0.5px] ${
                  isActive
                    ? "bg-white text-slate-900 border border-slate-200 shadow-2xs font-semibold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${isActive ? "text-indigo-600" : "text-slate-500"}`}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
