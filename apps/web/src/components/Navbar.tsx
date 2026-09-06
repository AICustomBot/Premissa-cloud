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
} from "lucide-react";

export type NavTab =
  "board" | "entities" | "script" | "review" | "report" | "ops" | "roadmap";

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  userRole: "PRODUCER" | "REVIEWER";
  onToggleRole: () => void;
  runStatus: "PRODUCER_REVIEW" | "APPROVED" | "REJECTED";
  budgetUsedUsd: number;
  budgetCapUsd: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  userRole,
  onToggleRole,
  runStatus,
  budgetUsedUsd,
  budgetCapUsd,
}) => {
  const tabs = [
    { id: "board", label: "Risk Board", icon: Layers },
    { id: "entities", label: "Entity Register", icon: ClipboardCheck },
    { id: "script", label: "Screenplay Ingestion", icon: FileText },
    { id: "review", label: "Legal Review", icon: UserCheck },
    { id: "report", label: "Clearance Report", icon: FileCheck2 },
    { id: "ops", label: "Operations & Safety", icon: Activity },
    { id: "roadmap", label: "Roadmap", icon: Milestone },
  ] as const;

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand Identity */}
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center shadow-xs">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1
                  id="brand-heading"
                  className="text-lg font-bold tracking-tight text-slate-900 m-0"
                >
                  PERMISSA
                </h1>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  v0.1
                </span>
              </div>
              <p className="text-[11px] text-slate-500 -mt-0.5">
                Evidence-Gated Screenplay Clearance
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav
            className="hidden md:flex items-center space-x-1 p-1 rounded-xl bg-slate-100/90 border border-slate-200 shadow-inner"
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
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 active:translate-y-[0.5px] ${
                    isActive
                      ? "bg-white text-slate-900 border border-slate-200/90 shadow-[0_1px_3px_rgba(15,23,42,0.08),inset_0_1px_0_#ffffff] font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/70 hover:shadow-2xs"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${isActive ? "text-indigo-600" : "text-slate-500"}`}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Controls: Role, Budget & Status */}
          <div className="flex items-center space-x-2.5">
            {/* Run Cost Cap */}
            <div className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 font-medium shadow-[inset_0_1px_0_#ffffff,0_1px_2px_rgba(15,23,42,0.04)]">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span>
                ${budgetUsedUsd.toFixed(2)} / ${budgetCapUsd.toFixed(2)}
              </span>
            </div>

            {/* Run State Badge */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{runStatus}</span>
            </div>

            {/* Role Switcher */}
            <button
              id="role-switch-btn"
              onClick={onToggleRole}
              title="Toggle role between Producer and Legal Reviewer"
              className={`btn-tactile flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                userRole === "REVIEWER"
                  ? "btn-tactile-purple"
                  : "btn-tactile-primary"
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-white" />
              <span>Role: {userRole}</span>
            </button>
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
