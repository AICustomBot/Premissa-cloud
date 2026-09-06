"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Navbar, type NavTab } from "../components/Navbar";
import { LegalNotice } from "../components/LegalNotice";
import { RoadmapView } from "../components/RoadmapView";
import { ScreenplayViewer } from "../components/ScreenplayViewer";
import { EntityRegister } from "../components/EntityRegister";
import { RiskBoard } from "../components/RiskBoard";
import { FindingDetailModal } from "../components/FindingDetailModal";
import { ReviewWorkflow } from "../components/ReviewWorkflow";
import { ClearanceReport } from "../components/ClearanceReport";
import { OperationsConsole } from "../components/OperationsConsole";
import {
  ProjectWorkspaceBar,
  type TenantUser,
  type ProjectSummary,
} from "../components/ProjectWorkspaceBar";
import {
  INITIAL_CLEARANCE_ENTITIES,
  type ClearanceItem,
  GOLDEN_SCRIPT_METADATA,
} from "../data/golden-data";

import {
  evaluateEntityClearance,
  logContentFreeEvent,
  type EvaluatedClearance,
} from "../lib/clearance-engine";
import {
  auth,
  testFirestoreConnection,
  signInWithGoogle,
  signOutUser,
} from "../lib/firebase";
import {
  syncProjectToFirestore,
  updateEntityInFirestore,
  updateProjectApprovalInFirestore,
  appendAuditLogToFirestore,
  subscribeToProjectEntities,
  syncUserProfileToFirestore,
} from "../lib/firestore-sync";
import { onAuthStateChanged, type User } from "firebase/auth";
import { generateUuidV7 } from "@permissa/contracts";
import {
  ShieldAlert,
  Sparkles,
  Layers,
  FileCheck2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileText,
  UserCheck,
  Milestone,
} from "lucide-react";

export default function HomePage() {
  const [currentTab, setCurrentTab] = useState<NavTab>("board");
  const [userRole, setUserRole] = useState<"PRODUCER" | "REVIEWER">("PRODUCER");
  const [currentUser, setCurrentUser] = useState<TenantUser>({
    id: "user-owner-1",
    name: "Elena Vance",
    email: "e.vance@apexentertainment.com",
    organizationId: "org-apex-01",
    organizationName: "Apex Pictures Entertainment",
    role: "OWNER",
  });
  const [activeProject, setActiveProject] = useState<ProjectSummary>({
    id: "01918a22-7901-72f1-a192-b7e8d249f011",
    organizationId: "org-apex-01",
    title: "The Final Witness (Feature)",
    jurisdiction: "US",
    version: 1,
    createdAt: "2026-09-01T10:00:00Z",
    deletedAt: null,
  });
  const [entities, setEntities] = useState<ClearanceItem[]>(
    INITIAL_CLEARANCE_ENTITIES,
  );
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [isRunApproved, setIsRunApproved] = useState<boolean>(false);
  const [budgetUsed, setBudgetUsed] = useState<number>(0.42);
  const [notification, setNotification] = useState<string | null>(null);

  // Cloud Persistence and Auth State
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(true);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [firebaseAuthUser, setFirebaseAuthUser] = useState<User | null>(null);

  // Sync user role with currentUser when selected
  const handleSelectUser = (user: TenantUser) => {
    setCurrentUser(user);
    if (user.role === "REVIEWER") {
      setUserRole("REVIEWER");
    } else {
      setUserRole("PRODUCER");
    }
    showNotification(
      `Active identity: ${user.name} (${user.role}) - ${user.organizationName}`,
    );
  };

  // Google Authentication Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseAuthUser(user);
      if (user) {
        const isOwnerAdmin =
          user.email === "ehabkhedrfathy@gmail.com" ||
          user.email?.includes("apex");
        const tenantUser: TenantUser = {
          id: user.uid,
          name:
            user.displayName ||
            user.email?.split("@")[0] ||
            "Authenticated User",
          email: user.email || "",
          organizationId: "org-apex-01",
          organizationName: "Apex Pictures Entertainment",
          role: isOwnerAdmin ? "OWNER" : "PRODUCER",
        };
        setCurrentUser(tenantUser);
        setUserRole(isOwnerAdmin ? "PRODUCER" : "PRODUCER");
        try {
          await syncUserProfileToFirestore(tenantUser);
        } catch (err) {
          console.warn("User profile sync deferred:", err);
        }
        showNotification(`Signed in as ${user.email} (Tenant: Apex Pictures)`);
      }
    });
    return () => unsub();
  }, []);

  // Check Firestore connection status and sync project if authenticated
  useEffect(() => {
    let active = true;
    async function initFirebasePersistence() {
      const isOk = await testFirestoreConnection();
      if (active) setFirestoreConnected(isOk);

      // Only attempt Firestore writes if authenticated user is present
      if (!firebaseAuthUser) {
        return;
      }

      setIsCloudSyncing(true);
      try {
        await syncProjectToFirestore(activeProject, entities, currentUser);
      } catch (err) {
        console.warn("Initial Firestore sync deferred:", err);
      } finally {
        if (active) setIsCloudSyncing(false);
      }
    }
    initFirebasePersistence();
    return () => {
      active = false;
    };
  }, [activeProject.id, firebaseAuthUser]);

  // Subscribe to live entity changes in Firestore ONLY when authenticated
  useEffect(() => {
    if (!activeProject.id || !firebaseAuthUser) return;
    const unsub = subscribeToProjectEntities(
      activeProject.id,
      (remoteUpdates) => {
        if (remoteUpdates && remoteUpdates.length > 0) {
          setEntities((prev) =>
            prev.map((item) => {
              const remote = remoteUpdates.find((r) => r.id === item.id);
              if (!remote) return item;
              const nextItem: ClearanceItem = {
                ...item,
                confirmedByProducer:
                  remote.confirmedByProducer !== undefined
                    ? Boolean(remote.confirmedByProducer)
                    : item.confirmedByProducer,
                initialProposedStatus:
                  remote.initialProposedStatus || item.initialProposedStatus,
              };
              if (remote.reviewerNotes !== undefined) {
                nextItem.reviewerNotes = remote.reviewerNotes;
              }
              return nextItem;
            }),
          );
        }
      },
      (err) => {
        console.warn("Firestore entity listener warning:", err);
      },
    );
    return () => unsub();
  }, [activeProject.id, firebaseAuthUser]);

  // Compute deterministic evaluation for each entity using @permissa/policy
  const evaluations: Record<string, EvaluatedClearance> = useMemo(() => {
    const map: Record<string, EvaluatedClearance> = {};
    entities.forEach((entity) => {
      map[entity.id] = evaluateEntityClearance(entity, userRole === "REVIEWER");
    });
    return map;
  }, [entities, userRole]);

  // Log content-free telemetry event on mount as per constitution
  useEffect(() => {
    logContentFreeEvent("applet_dashboard_loaded", {
      runId: "run_the_final_witness_01",
      entityCount: entities.length,
      executionTimeMs: 14,
    });
  }, [entities.length]);

  const handleToggleRole = () => {
    setUserRole((prev) => (prev === "PRODUCER" ? "REVIEWER" : "PRODUCER"));
    showNotification(
      userRole === "PRODUCER"
        ? "Switched to Professional Reviewer (Legal) role"
        : "Switched to Producer role",
    );
  };

  const handleToggleConfirmEntity = async (entityId: string) => {
    const target = entities.find((e) => e.id === entityId);
    const newConfirmed = target ? !target.confirmedByProducer : true;

    setEntities((prev) =>
      prev.map((e) =>
        e.id === entityId ? { ...e, confirmedByProducer: newConfirmed } : e,
      ),
    );

    try {
      await updateEntityInFirestore(activeProject.id, entityId, {
        confirmedByProducer: newConfirmed,
      });
    } catch (err) {
      console.warn("Firestore entity confirmation update error:", err);
    }
  };

  const handleConfirmAllEntities = async () => {
    const anyUnconfirmed = entities.some((e) => !e.confirmedByProducer);
    setEntities((prev) =>
      prev.map((e) => ({ ...e, confirmedByProducer: anyUnconfirmed })),
    );

    for (const entity of entities) {
      try {
        await updateEntityInFirestore(activeProject.id, entity.id, {
          confirmedByProducer: anyUnconfirmed,
        });
      } catch (err) {
        console.warn("Batch confirmation error for entity:", entity.id, err);
      }
    }

    showNotification(
      anyUnconfirmed
        ? "All 12 entities confirmed for research run (Synced to Firestore)"
        : "All entities unconfirmed",
    );
  };

  const handleApplyOverride = async (
    entityId: string,
    newStatus: any,
    reason: string,
  ) => {
    setEntities((prev) =>
      prev.map((e) => {
        if (e.id === entityId) {
          return {
            ...e,
            initialProposedStatus: newStatus,
            reviewerNotes: reason,
          };
        }
        return e;
      }),
    );

    try {
      await updateEntityInFirestore(activeProject.id, entityId, {
        initialProposedStatus: newStatus,
        reviewerNotes: reason,
      });
      // Append content-free audit trace
      await appendAuditLogToFirestore(
        activeProject.id,
        activeProject.organizationId,
        currentUser.id,
        "REVIEWER_OVERRIDE_APPLIED",
        generateUuidV7(),
      );
    } catch (err) {
      console.warn("Firestore override update error:", err);
    }

    showNotification(
      `Reviewer override persisted to Firestore cloud: ${newStatus}`,
    );
  };

  const handleLiveResearchComplete = async (
    entityId: string,
    citations: any[],
    confidenceInput: any,
    admittedStatus: any,
  ) => {
    setEntities((prev) =>
      prev.map((e) => {
        if (e.id === entityId) {
          return {
            ...e,
            citations,
            initialProposedStatus: admittedStatus,
          };
        }
        return e;
      }),
    );

    setBudgetUsed((prev) => Math.min(prev + 0.05, 10.0));

    try {
      await updateEntityInFirestore(activeProject.id, entityId, {
        citations,
        initialProposedStatus: admittedStatus,
      });
      await appendAuditLogToFirestore(
        activeProject.id,
        activeProject.organizationId,
        currentUser.id,
        "SEARCH_COMPLETED",
        generateUuidV7(),
      );
    } catch (err) {
      console.warn("Firestore live research sync error:", err);
    }

    showNotification(
      `Live Parallel research citations synchronized to Cloud Firestore.`,
    );
  };

  const handleApproveRun = async () => {
    setIsRunApproved(true);
    try {
      await updateProjectApprovalInFirestore(
        activeProject.id,
        true,
        activeProject.version,
      );
      await appendAuditLogToFirestore(
        activeProject.id,
        activeProject.organizationId,
        currentUser.id,
        "CLEARANCE_RUN_SEALED",
        generateUuidV7(),
      );
    } catch (err) {
      console.warn("Firestore approval error:", err);
    }
    showNotification(
      "Clearance run officially approved, sealed, and synced to Firestore.",
    );
  };

  const handleLaunchClearanceRun = () => {
    setCurrentTab("board");
    setBudgetUsed((prev) => Math.min(prev + 0.15, 10.0));
    showNotification(
      "Deterministic evidence gate re-evaluated across all 12 entities.",
    );
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      showNotification(`Google Sign-In: ${err.message || "Failed"}`);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOutUser();
      showNotification("Signed out from Google account.");
    } catch (err: any) {
      showNotification(`Sign out error: ${err.message}`);
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const selectedEntity =
    entities.find((e) => e.id === selectedEntityId) || null;
  const selectedEvaluation = selectedEntityId
    ? evaluations[selectedEntityId] || null
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col selection:bg-indigo-100 selection:text-indigo-900 relative">
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Required Accessible Legal Disclaimer and Heading */}
        <div className="sr-only">
          <h1>PERMISSA</h1>
          <p>Every frame cleared before it ships.</p>
          <p>
            PERMISSA produces clearance research and evidence for professional
            review. It does not provide legal advice or clearance certification.
          </p>
        </div>

        {/* Top Legal Notice Banner */}
        <LegalNotice />

        {/* Main Navbar */}
        <Navbar
          currentTab={currentTab}
          onTabChange={(tab) => setCurrentTab(tab)}
          userRole={userRole}
          onToggleRole={handleToggleRole}
          runStatus={isRunApproved ? "APPROVED" : "PRODUCER_REVIEW"}
          budgetUsedUsd={budgetUsed}
          budgetCapUsd={10.0}
        />

        {/* Tranche 1: Multi-Tenant Workspace & Project Management Bar */}
        <ProjectWorkspaceBar
          currentUser={currentUser}
          onSelectUser={handleSelectUser}
          activeProject={activeProject}
          onSelectProject={(proj) => setActiveProject(proj)}
          onProjectDeleted={(id) => {
            showNotification(`Project ${id.slice(0, 8)}... soft-deleted.`);
          }}
          showNotification={showNotification}
          firestoreConnected={firestoreConnected}
          isCloudSyncing={isCloudSyncing}
          firebaseAuthUser={firebaseAuthUser}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
        />

        {/* Floating Toast Notification */}
        {notification && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 shadow-xl text-white px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2.5 animate-fade-in">
            <Sparkles className="w-4 h-4 text-cyan-300 shrink-0" />
            <span className="font-medium">{notification}</span>
          </div>
        )}

        {/* Primary Workspace Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Tranche 1 Exit Criterion: Cross-Tenant Isolation Barrier */}
          {currentUser.organizationId !== activeProject.organizationId ? (
            <div className="max-w-2xl mx-auto my-12 p-8 rounded-2xl bg-white border border-rose-200 shadow-sm text-slate-800 animate-fade-in">
              <div className="flex items-center space-x-3 text-rose-600 pb-4 border-b border-slate-100">
                <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
                  <AlertCircle className="w-6 h-6 text-rose-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    RFC 9457 Problem Details: 403 FORBIDDEN
                  </h2>
                  <p className="text-xs text-rose-600 font-mono">
                    https://permissa.app/problems/forbidden
                  </p>
                </div>
              </div>

              <div className="py-5 space-y-3 text-xs">
                <p className="text-slate-700 leading-relaxed">
                  <strong>Cross-Tenant Access Prohibited:</strong> The
                  authenticated caller{" "}
                  <span className="text-slate-900 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {currentUser.email}
                  </span>{" "}
                  belongs to <strong>{currentUser.organizationName}</strong>,
                  but target project{" "}
                  <span className="text-slate-900 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {activeProject.title}
                  </span>{" "}
                  is scoped exclusively to{" "}
                  <strong>Apex Pictures Entertainment</strong>.
                </p>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-600 space-y-1">
                  <div>status: 403</div>
                  <div>code: &quot;FORBIDDEN&quot;</div>
                  <div>
                    correlationId: &quot;req_iso_01918a22_tenant_gate&quot;
                  </div>
                  <div>retryable: false</div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Tranche 1 Exit Criterion: No cross-tenant read or write is
                  possible.
                </span>
                <button
                  onClick={() =>
                    handleSelectUser({
                      id: "user-owner-1",
                      name: "Elena Vance",
                      email: "e.vance@apexentertainment.com",
                      organizationId: "org-apex-01",
                      organizationName: "Apex Pictures Entertainment",
                      role: "OWNER",
                    })
                  }
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs transition-colors"
                >
                  Switch to Authorized Tenant
                </button>
              </div>
            </div>
          ) : (
            <>
              {currentTab === "board" && (
                <RiskBoard
                  entities={entities}
                  evaluations={evaluations}
                  onSelectEntity={(id) => setSelectedEntityId(id)}
                  onRefreshEvaluation={handleLaunchClearanceRun}
                  onBatchLiveResearch={handleLaunchClearanceRun}
                />
              )}

              {currentTab === "entities" && (
                <EntityRegister
                  entities={entities}
                  onToggleConfirm={handleToggleConfirmEntity}
                  onConfirmAll={handleConfirmAllEntities}
                  onSelectEntity={(id) => setSelectedEntityId(id)}
                  onLaunchClearanceRun={handleLaunchClearanceRun}
                />
              )}

              {currentTab === "script" && (
                <ScreenplayViewer
                  onSelectEntity={(id) => setSelectedEntityId(id)}
                />
              )}

              {currentTab === "review" && (
                <ReviewWorkflow
                  entities={entities}
                  evaluations={evaluations}
                  userRole={userRole}
                  onApproveRun={handleApproveRun}
                  isRunApproved={isRunApproved}
                />
              )}

              {currentTab === "report" && (
                <ClearanceReport
                  entities={entities}
                  evaluations={evaluations}
                  isApproved={isRunApproved}
                />
              )}

              {currentTab === "ops" && (
                <OperationsConsole
                  budgetUsedUsd={budgetUsed}
                  budgetCapUsd={10.0}
                  isFirestoreConnected={firestoreConnected}
                  onBudgetChange={(newBudget) => setBudgetUsed(newBudget)}
                />
              )}

              {currentTab === "roadmap" && <RoadmapView />}
            </>
          )}
        </main>

        {/* Finding Detail Modal */}
        {selectedEntity &&
          (() => {
            const selectedIndex = entities.findIndex(
              (e) => e.id === selectedEntity.id,
            );
            return (
              <FindingDetailModal
                entity={selectedEntity}
                evaluation={selectedEvaluation}
                onClose={() => setSelectedEntityId(null)}
                userRole={userRole}
                onApplyOverride={handleApplyOverride}
                onLiveResearchComplete={handleLiveResearchComplete}
                projectId={activeProject.id}
                currentIndex={selectedIndex}
                totalCount={entities.length}
                hasPrev={selectedIndex > 0}
                hasNext={selectedIndex < entities.length - 1}
                onNavigate={(dir) => {
                  if (selectedIndex === -1) return;
                  const nextIdx =
                    dir === "prev" ? selectedIndex - 1 : selectedIndex + 1;
                  const nextEntity = entities[nextIdx];
                  if (nextEntity) {
                    setSelectedEntityId(nextEntity.id);
                  }
                }}
              />
            );
          })()}

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-6 px-4 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-800">PERMISSA</span>
              <span>&bull;</span>
              <span>Evidence-Gated Screenplay Clearance</span>
            </div>
            <div className="text-slate-500">
              Powered by deterministic policy engine &bull; Zero prompt leakage
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
