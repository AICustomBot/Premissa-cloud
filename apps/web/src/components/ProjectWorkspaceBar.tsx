"use client";

import React, { useState } from "react";
import {
  Building2,
  FolderPlus,
  History,
  Trash2,
  Shield,
  ChevronDown,
  Lock,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
  Cloud,
  LogIn,
  LogOut,
  Sparkles,
  Radio,
} from "lucide-react";
import { generateUuidV7 } from "@permissa/contracts";

export interface TenantUser {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: "OWNER" | "PRODUCER" | "REVIEWER";
  avatarColor?: string;
  isExternalTenant?: boolean;
}

export interface ProjectSummary {
  id: string;
  organizationId: string;
  title: string;
  jurisdiction: string;
  version: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface AuditRecord {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  metadataSummary: string;
}

const PRESET_USERS: TenantUser[] = [
  {
    id: "user-owner-1",
    name: "Elena Vance",
    email: "e.vance@apexentertainment.com",
    organizationId: "org-apex-01",
    organizationName: "Apex Pictures Entertainment",
    role: "OWNER",
  },
  {
    id: "user-producer-1",
    name: "Marcus Brody",
    email: "m.brody@apexentertainment.com",
    organizationId: "org-apex-01",
    organizationName: "Apex Pictures Entertainment",
    role: "PRODUCER",
  },
  {
    id: "user-reviewer-1",
    name: "Sarah Chen, Esq.",
    email: "s.chen@apexentertainment.com",
    organizationId: "org-apex-01",
    organizationName: "Apex Pictures Entertainment",
    role: "REVIEWER",
  },
  {
    id: "user-external-b",
    name: "David Sterling",
    email: "d.sterling@summitmedia.com",
    organizationId: "org-summit-02",
    organizationName: "Summit Media Productions",
    role: "OWNER",
    isExternalTenant: true,
  },
];

const INITIAL_PROJECTS: ProjectSummary[] = [
  {
    id: "01918a22-7901-72f1-a192-b7e8d249f011",
    organizationId: "org-apex-01",
    title: "The Final Witness (Feature)",
    jurisdiction: "US",
    version: 1,
    createdAt: "2026-09-01T10:00:00Z",
    deletedAt: null,
  },
  {
    id: "01918a24-85b3-76a0-8021-c4f9e110d022",
    organizationId: "org-apex-01",
    title: "Neon Horizon (Sci-Fi Thriller)",
    jurisdiction: "US",
    version: 1,
    createdAt: "2026-09-02T14:30:00Z",
    deletedAt: null,
  },
];

const INITIAL_AUDIT_LOGS: AuditRecord[] = [
  {
    id: "01918a22-7901-72f1-a192-b7e8d249f011",
    action: "PROJECT_CREATED",
    actor: "Elena Vance (OWNER)",
    timestamp: "2026-09-01T10:00:00Z",
    metadataSummary: "Jurisdiction: US | Characters: 18",
  },
  {
    id: "01918a23-3112-70b1-9f20-112e88a4421b",
    action: "ROLE_GRANTED",
    actor: "Elena Vance (OWNER)",
    timestamp: "2026-09-01T10:05:00Z",
    metadataSummary: "Target: Marcus Brody | Role: PRODUCER",
  },
  {
    id: "01918a23-5590-71a2-bf31-55c39177a33c",
    action: "ROLE_GRANTED",
    actor: "Elena Vance (OWNER)",
    timestamp: "2026-09-01T10:06:00Z",
    metadataSummary: "Target: Sarah Chen, Esq. | Role: REVIEWER",
  },
  {
    id: "01918a25-9001-74f0-8c20-88d4400e9910",
    action: "PREFLIGHT_INITIATED",
    actor: "Marcus Brody (PRODUCER)",
    timestamp: "2026-09-02T11:15:00Z",
    metadataSummary: "ScriptVersion: 1 | BudgetCap: $10.00",
  },
];

interface ProjectWorkspaceBarProps {
  currentUser: TenantUser;
  onSelectUser: (user: TenantUser) => void;
  activeProject: ProjectSummary;
  onSelectProject: (project: ProjectSummary) => void;
  onProjectDeleted: (projectId: string) => void;
  showNotification: (msg: string) => void;
  firestoreConnected?: boolean;
  isCloudSyncing?: boolean;
  firebaseAuthUser?: any;
  onGoogleSignIn?: () => void;
  onGoogleSignOut?: () => void;
}

export const ProjectWorkspaceBar: React.FC<ProjectWorkspaceBarProps> = ({
  currentUser,
  onSelectUser,
  activeProject,
  onSelectProject,
  onProjectDeleted,
  showNotification,
  firestoreConnected = true,
  isCloudSyncing = false,
  firebaseAuthUser = null,
  onGoogleSignIn,
  onGoogleSignOut,
}) => {
  const [projects, setProjects] = useState<ProjectSummary[]>(INITIAL_PROJECTS);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>(INITIAL_AUDIT_LOGS);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectJurisdiction, setNewProjectJurisdiction] = useState("US");

  // Multi-tenant check: is user in the same organization as the project?
  const isCrossTenant =
    currentUser.organizationId !== activeProject.organizationId;
  const isOwner = currentUser.role === "OWNER" && !isCrossTenant;

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;

    const newId = generateUuidV7();
    const now = new Date().toISOString();

    const created: ProjectSummary = {
      id: newId,
      organizationId: currentUser.organizationId,
      title: newProjectTitle.trim(),
      jurisdiction: newProjectJurisdiction,
      version: 1,
      createdAt: now,
      deletedAt: null,
    };

    setProjects((prev) => [created, ...prev]);
    onSelectProject(created);

    // Audit log (content-free)
    const audit: AuditRecord = {
      id: generateUuidV7(),
      action: "PROJECT_CREATED",
      actor: `${currentUser.name} (${currentUser.role})`,
      timestamp: now,
      metadataSummary: `Jurisdiction: ${newProjectJurisdiction} | TitleChars: ${newProjectTitle.length}`,
    };
    setAuditLogs((prev) => [audit, ...prev]);

    setShowCreateModal(false);
    setNewProjectTitle("");
    showNotification(
      `Project "${created.title}" provisioned with server UUIDv7.`,
    );
  };

  const handleDeleteActiveProject = () => {
    if (!isOwner) {
      showNotification(
        "Action forbidden: Only organization OWNER can delete projects.",
      );
      return;
    }

    const now = new Date().toISOString();
    const updated = {
      ...activeProject,
      deletedAt: now,
      version: activeProject.version + 1,
    };
    setProjects((prev) =>
      prev.map((p) => (p.id === activeProject.id ? updated : p)),
    );

    // Audit log
    const audit: AuditRecord = {
      id: generateUuidV7(),
      action: "PROJECT_DELETED",
      actor: `${currentUser.name} (OWNER)`,
      timestamp: now,
      metadataSummary: `SoftDelete | Version: ${updated.version}`,
    };
    setAuditLogs((prev) => [audit, ...prev]);

    onProjectDeleted(activeProject.id);
    showNotification(
      `Project deleted and recorded in immutable audit timeline.`,
    );
  };

  return (
    <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-2 print:hidden">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5 text-xs">
        {/* Left: Organization & Project Selector */}
        <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
          {/* Organization Badge */}
          <div className="flex items-center space-x-2 px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 shadow-2xs">
            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
            <span className="font-semibold text-slate-800">
              {currentUser.organizationName}
            </span>
            {currentUser.isExternalTenant && (
              <span className="px-1.5 py-0.2 text-[10px] rounded bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                External Tenant
              </span>
            )}
          </div>

          {/* Project Switcher */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 text-[11px] font-medium uppercase tracking-wider">
              Project:
            </span>
            <select
              value={activeProject.id}
              onChange={(e) => {
                const found = projects.find((p) => p.id === e.target.value);
                if (found) onSelectProject(found);
              }}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-600 cursor-pointer shadow-2xs font-medium"
            >
              {projects.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  className="bg-white text-slate-900"
                >
                  {p.title} {p.deletedAt ? "(DELETED)" : ""}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-tactile btn-tactile-secondary flex items-center space-x-1 px-2.5 py-1 rounded-lg text-indigo-700 font-semibold"
              title="Create new isolated project"
            >
              <FolderPlus className="w-3.5 h-3.5 text-indigo-600" />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Right: Tenant Identity Simulation, Cloud Sync & Audit Controls */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* Cloud Persistence Indicator */}
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium shadow-2xs transition-all ${
              firestoreConnected
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-amber-50 border-amber-200 text-amber-700"
            }`}
            title="Provisioned Google Cloud Firestore database"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>
              {isCloudSyncing
                ? "Syncing..."
                : firestoreConnected
                  ? "Firestore Online"
                  : "Offline"}
            </span>
          </div>

          {/* Parallel Web Systems Connector */}
          <div
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold bg-blue-50 border-blue-200 text-blue-700 shadow-2xs"
            title="Parallel Web Systems (parallel.ai) live web & legal registry search connector"
          >
            <Radio className="w-3.5 h-3.5 text-blue-600" />
            <span>Parallel API</span>
          </div>

          {/* Google Auth Status / Action */}
          {firebaseAuthUser ? (
            <div className="flex items-center space-x-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span
                className="text-slate-800 text-xs font-medium max-w-[120px] truncate"
                title={firebaseAuthUser.email || ""}
              >
                {firebaseAuthUser.displayName || firebaseAuthUser.email}
              </span>
              <button
                onClick={onGoogleSignOut}
                className="text-[10px] text-slate-500 hover:text-rose-600 flex items-center space-x-1 pl-1 transition-colors active:translate-y-[0.5px]"
                title="Sign out of Google account"
              >
                <LogOut className="w-3 h-3" />
                <span>Exit</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onGoogleSignIn}
              className="btn-tactile btn-tactile-primary flex items-center space-x-1.5 px-3 py-1 rounded-lg font-semibold text-xs"
              title="Sign in with your Google account via Firebase Auth"
            >
              <LogIn className="w-3 h-3" />
              <span>Google Sign-In</span>
            </button>
          )}

          {/* Identity Switcher (Demonstrating Tranche 1 Auth & RBAC) */}
          <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs">
            <span className="text-[11px] text-slate-500 font-medium">
              RBAC:
            </span>
            <select
              value={currentUser.id}
              onChange={(e) => {
                const user = PRESET_USERS.find((u) => u.id === e.target.value);
                if (user) onSelectUser(user);
              }}
              className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none cursor-pointer"
            >
              {PRESET_USERS.map((u) => (
                <option
                  key={u.id}
                  value={u.id}
                  className="bg-white text-slate-800"
                >
                  {u.name} ({u.role}) —{" "}
                  {u.isExternalTenant ? "Tenant B" : "Tenant A"}
                </option>
              ))}
            </select>
          </div>

          {/* Audit Timeline Button */}
          <button
            onClick={() => setShowAuditModal(true)}
            className="btn-tactile btn-tactile-secondary flex items-center space-x-1 px-2.5 py-1 rounded-lg text-slate-700 text-xs font-medium"
            title="View content-free audit timeline (Tranche 1 exit criteria)"
          >
            <History className="w-3.5 h-3.5 text-slate-500" />
            <span>Audit Trail</span>
          </button>

          {/* Delete Project Button (OWNER only) */}
          <button
            onClick={handleDeleteActiveProject}
            disabled={!isOwner}
            className={`btn-tactile flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
              isOwner
                ? "btn-tactile-danger"
                : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50"
            }`}
            title={
              isOwner
                ? "Soft-delete project and emit audit event"
                : "Requires OWNER role. Producers and Reviewers cannot delete projects."
            }
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Cross-Tenant Isolation Warning Banner if External Tenant is Selected */}
      {isCrossTenant && (
        <div className="mt-2.5 p-3 rounded-lg bg-rose-950/40 border border-rose-500/50 flex items-start space-x-3 text-rose-200 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-rose-100 flex items-center space-x-2">
              <span>
                Tranche 1 Isolation Guardrail: Cross-Tenant Access Blocked (RFC
                9457)
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/30">
                403 FORBIDDEN
              </span>
            </div>
            <p className="text-rose-300/90 text-[11px] mt-0.5">
              Active identity belongs to{" "}
              <strong>{currentUser.organizationName}</strong>, whereas this
              project belongs to <strong>Apex Pictures Entertainment</strong>.
              Cross-tenant reads and writes are strictly prohibited.
            </p>
          </div>
          <button
            onClick={() => onSelectUser(PRESET_USERS[0]!)}
            className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs whitespace-nowrap transition-colors"
          >
            Switch to Authorized User
          </button>
        </div>
      )}

      {/* Audit Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-xl p-6 text-slate-800 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                  <History className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-base">
                    Project Audit Trail
                  </h3>
                  <p className="text-xs text-slate-500">
                    Content-free, immutable log of administrative and clearance
                    milestones
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {auditLogs.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-indigo-700 font-mono">
                        {entry.action}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {entry.id.slice(0, 18)}...
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px]">
                      By:{" "}
                      <span className="text-slate-900 font-medium">
                        {entry.actor}
                      </span>
                    </p>
                    <p className="text-slate-500 text-[10px]">
                      Metadata: {entry.metadataSummary}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center space-x-1.5 text-emerald-600 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Verified Content-Free per Engineering Constitution</span>
              </span>
              <button
                onClick={() => setShowAuditModal(false)}
                className="btn-tactile btn-tactile-secondary px-4 py-1.5 rounded-lg text-slate-800 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl p-6 text-slate-800 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200">
                  <FolderPlus className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-base">
                    New Clearance Project
                  </h3>
                  <p className="text-xs text-slate-500">
                    Creates an isolated project aggregate with UUIDv7
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Operation Darkstar"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Legal Jurisdiction
                </label>
                <select
                  value={newProjectJurisdiction}
                  onChange={(e) => setNewProjectJurisdiction(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="US">
                    United States (US Federal & State Law)
                  </option>
                </select>
              </div>

              <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100 text-[11px] text-indigo-800">
                Will be created under organization:{" "}
                <strong>{currentUser.organizationName}</strong>. Creator
                automatically receives the <strong>OWNER</strong> role grant.
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-tactile btn-tactile-secondary px-3.5 py-1.5 rounded-lg text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-tactile btn-tactile-primary px-4 py-1.5 rounded-lg text-xs font-semibold"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
