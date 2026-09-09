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
import { DifferentialClearanceView } from "../components/DifferentialClearanceView";
import { AuditLedgerView } from "../components/AuditLedgerView";
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
  initWebServices,
  testFirestoreConnection,
  signInWithGoogle,
  signOutUser,
  type WebFirebaseConfig,
} from "../lib/firebase";
import { consumeHandoffToken, getStoredHandoff } from "../lib/handoff";
import {
  syncProjectToFirestore,
  updateEntityInFirestore,
  deleteEntityInFirestore,
  saveNewEntityToFirestore,
  updateProjectApprovalInFirestore,
  appendAuditLogToFirestore,
  subscribeToProjectEntities,
  subscribeToProjectAuditLogs,
  syncUserProfileToFirestore,
} from "../lib/firestore-sync";
import {
  type HashChainedAuditEntry,
  INITIAL_HASH_CHAINED_AUDIT_LOG,
  createChainedAuditEntry,
} from "../lib/hash-chained-audit";
import {
  type UserPresence,
  broadcastUserPresence,
  subscribeToProjectPresence,
} from "../lib/presence-sync";
import { onAuthStateChanged, type User } from "firebase/auth";
import { generateUuidV7 } from "@permissa/contracts";
import type { ReviewerSignOffRecord } from "../lib/cryptographic-report";
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
  const [counselSignOff, setCounselSignOff] =
    useState<ReviewerSignOffRecord | null>(null);
  const [budgetUsed, setBudgetUsed] = useState<number>(0.42);
  const [notification, setNotification] = useState<string | null>(null);

  // Real-Time Multi-User Presence and Tamper-Evident Hash-Chained Audit Trail (Tranche 6)
  const [auditEntries, setAuditEntries] = useState<HashChainedAuditEntry[]>(
    INITIAL_HASH_CHAINED_AUDIT_LOG,
  );
  const [activePresences, setActivePresences] = useState<UserPresence[]>([]);

  // Cloud Persistence and Auth State
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(true);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(
    currentTab === "differential",
  );
  const [firebaseAuthUser, setFirebaseAuthUser] = useState<User | null>(null);
  const [firebaseReady, setFirebaseReady] = useState<boolean>(false);

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

  // Console handoff + lazy Firebase bootstrap.
  //
  // The Firebase web config arrives at runtime from GET /config.json; nothing
  // is baked into the bundle (the Dockerfile.web secret gate forbids it).
  // Without a config the dashboard keeps running on its golden fixture in
  // demo mode. A console handoff token in the URL fragment establishes the
  // signed-in identity for this tab; the API verifies the token server-side
  // on every call.
  useEffect(() => {
    const handoff = consumeHandoffToken() ?? getStoredHandoff();
    if (handoff) {
      setCurrentUser({
        id: handoff.uid,
        name: handoff.name ?? handoff.email?.split("@")[0] ?? "Console user",
        email: handoff.email ?? "",
        organizationId: handoff.organizationId ?? "org-apex-01",
        organizationName: "Apex Pictures Entertainment",
        role:
          handoff.role === "OWNER"
            ? "OWNER"
            : handoff.role === "REVIEWER"
              ? "REVIEWER"
              : "PRODUCER",
      });
      showNotification(
        `Signed in via PERMISSA Console as ${handoff.email ?? handoff.uid}.`,
      );
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    fetch("/config.json", {
      cache: "no-store",
      headers: { accept: "application/json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((config) => {
        if (cancelled || !config?.firebase) {
          return;
        }
        const services = initWebServices(
          config.firebase as WebFirebaseConfig,
        );
        setFirebaseReady(true);
        unsubscribe = onAuthStateChanged(services.auth, async (user) => {
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
            showNotification(
              `Signed in as ${user.email} (Tenant: Apex Pictures)`,
            );
          }
        });
      })
      .catch(() => {
        // Demo mode: no runtime config, no Firebase. The golden fixture below
        // keeps every tab fully explorable.
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Check Firestore connection status and sync project if authenticated
  useEffect(() => {
    let active = true;
    async function initFirebasePersistence() {
      // Firebase initialises lazily from the runtime config; until then the
      // dashboard runs on its golden fixture and no sync is attempted.
      if (!firebaseReady) {
        return;
      }
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
        if (active) setIsCloudSyncing(currentTab === "differential");
      }
    }
    initFirebasePersistence();
    return () => {
      active = currentTab === "differential";
    };
  }, [activeProject.id, firebaseAuthUser, firebaseReady]);

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

  // Subscribe to real-time hash-chained audit log entries
  useEffect(() => {
    if (!activeProject.id || !firebaseAuthUser) return;
    const unsub = subscribeToProjectAuditLogs(
      activeProject.id,
      (remoteLogs) => {
        if (remoteLogs && remoteLogs.length > 0) {
          setAuditEntries(remoteLogs);
        }
      },
    );
    return () => unsub();
  }, [activeProject.id, firebaseAuthUser]);

  // Real-time multi-user presence broadcasting and subscription
  useEffect(() => {
    if (!activeProject.id || !firebaseReady) return;
    const unsub = subscribeToProjectPresence(activeProject.id, (presences) => {
      setActivePresences(presences);
    });

    // Broadcast current user presence
    broadcastUserPresence(
      activeProject.id,
      currentUser,
      currentTab,
      selectedEntityId,
    );

    return () => unsub();
  }, [activeProject.id, currentUser, currentTab, selectedEntityId, firebaseReady]);

  // Helper to create and append cryptographically linked audit event
  const recordChainedAuditEvent = async (
    action: string,
    details: Record<string, string | number | boolean>,
  ) => {
    try {
      const newEntry = await createChainedAuditEntry(auditEntries, {
        id: generateUuidV7(),
        projectId: activeProject.id,
        organizationId: activeProject.organizationId,
        actorId: currentUser.id,
        actorRole: currentUser.role,
        actorName: currentUser.name,
        action,
        details,
      });
      setAuditEntries((prev) => [...prev, newEntry]);
      await appendAuditLogToFirestore(newEntry);
    } catch (err) {
      console.warn("Chained audit logging warning:", err);
    }
  };

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
        ? "All entities confirmed for research run (Synced to Firestore)"
        : "All entities unconfirmed",
    );
  };

  const handleMergeEntities = async (
    survivorId: string,
    mergedIds: string[],
    expectedVersions: Record<string, number>,
  ) => {
    const survivor = entities.find((e) => e.id === survivorId);
    if (!survivor) return;

    const mergedEntities = entities.filter((e) => mergedIds.includes(e.id));

    // Combine aliases
    const aliasSet = new Set<string>(survivor.aliases);
    for (const m of mergedEntities) {
      aliasSet.add(m.canonicalName);
      for (const a of m.aliases) {
        aliasSet.add(a);
      }
    }
    aliasSet.delete(survivor.canonicalName);
    const combinedAliases = Array.from(aliasSet).slice(0, 20);

    // Combine scene IDs
    const sceneSet = new Set<string>(survivor.sceneIds);
    for (const m of mergedEntities) {
      for (const s of m.sceneIds) {
        sceneSet.add(s);
      }
    }

    const totalMentions =
      survivor.mentionsCount +
      mergedEntities.reduce((sum, m) => sum + m.mentionsCount, 0);

    const updatedSurvivor: ClearanceItem = {
      ...survivor,
      aliases: combinedAliases,
      sceneIds: Array.from(sceneSet),
      mentionsCount: totalMentions,
      version: (survivor.version ?? 1) + 1,
    };

    setEntities((prev) => [
      updatedSurvivor,
      ...prev.filter((e) => e.id !== survivorId && !mergedIds.includes(e.id)),
    ]);

    try {
      await updateEntityInFirestore(activeProject.id, survivorId, {
        canonicalName: updatedSurvivor.canonicalName,
      });

      for (const mId of mergedIds) {
        await deleteEntityInFirestore(activeProject.id, mId);
      }

      await recordChainedAuditEvent("ENTITIES_MERGED", {
        survivorEntity: updatedSurvivor.canonicalName,
        mergedCount: mergedIds.length,
      });
    } catch (err) {
      console.warn("Firestore entity merge sync error:", err);
    }

    showNotification(
      `Merged ${mergedIds.length} entities into "${updatedSurvivor.canonicalName}" (Aliases mapped, version incremented)`,
    );
  };

  const handleUpdateEntity = async (updatedEntity: ClearanceItem) => {
    setEntities((prev) =>
      prev.map((e) => (e.id === updatedEntity.id ? updatedEntity : e)),
    );

    try {
      await updateEntityInFirestore(activeProject.id, updatedEntity.id, {
        canonicalName: updatedEntity.canonicalName,
      });
      await recordChainedAuditEvent("ENTITY_UPDATED", {
        entityName: updatedEntity.canonicalName,
        entityId: updatedEntity.id,
      });
    } catch (err) {
      console.warn("Firestore entity update error:", err);
    }

    showNotification(
      `Entity "${updatedEntity.canonicalName}" updated (v${updatedEntity.version ?? 1})`,
    );
  };

  const handleAddEntity = async (newEntity: ClearanceItem) => {
    setEntities((prev) => [newEntity, ...prev]);

    try {
      await saveNewEntityToFirestore(activeProject.id, newEntity);
      await recordChainedAuditEvent("ENTITY_CREATED", {
        entityName: newEntity.canonicalName,
        entityType: newEntity.type,
      });
    } catch (err) {
      console.warn("Firestore entity creation error:", err);
    }

    showNotification(
      `Registered candidate entity "${newEntity.canonicalName}" (Server UUIDv7 assigned)`,
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
      await updateEntityInFirestore(
        activeProject.id,
        entityId,
        {
          initialProposedStatus: newStatus,
          reviewerNotes: reason,
        },
        "REVIEWER",
      );
      // Append content-free audit trace
      await recordChainedAuditEvent("REVIEWER_OVERRIDE_APPLIED", {
        entityId,
        newStatus,
        reasonSummary: reason.slice(0, 80),
      });
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
      await recordChainedAuditEvent("SEARCH_COMPLETED", {
        entityId,
        citationsCount: citations.length,
        admittedStatus,
      });
    } catch (err) {
      console.warn("Firestore live research sync error:", err);
    }

    showNotification(
      `Live Parallel research citations synchronized to Cloud Firestore.`,
    );
  };

  const handleApproveRun = async (signOffRecord?: ReviewerSignOffRecord) => {
    setIsRunApproved(true);
    if (signOffRecord) {
      setCounselSignOff(signOffRecord);
    }
    try {
      await updateProjectApprovalInFirestore(
        activeProject.id,
        true,
        activeProject.version,
      );
      await recordChainedAuditEvent("CLEARANCE_RUN_SEALED", {
        reviewerName: signOffRecord
          ? signOffRecord.reviewerName
          : currentUser.name,
        jurisdiction: activeProject.jurisdiction,
        isApproved: true,
      });
    } catch (err) {
      console.warn("Firestore approval error:", err);
    }
    showNotification(
      signOffRecord
        ? `Clearance run officially approved & sealed by ${signOffRecord.reviewerName}.`
        : "Clearance run officially approved, sealed, and synced to Firestore.",
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
      if (
        err?.code === "auth/popup-closed-by-user" ||
        err?.code === "auth/cancelled-popup-request"
      ) {
        return;
      }
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
          activePresences={activePresences}
          currentUser={currentUser}
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
          <div
            id="app-toast-notification"
            role="status"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-700/80 shadow-xl text-white px-4 py-3 rounded-xl text-xs flex items-center space-x-2.5 animate-in fade-in slide-in-from-bottom-2"
          >
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-semibold">{notification}</span>
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
                  userRole={userRole}
                  onToggleConfirm={handleToggleConfirmEntity}
                  onConfirmAll={handleConfirmAllEntities}
                  onSelectEntity={(id) => setSelectedEntityId(id)}
                  onLaunchClearanceRun={handleLaunchClearanceRun}
                  onMergeEntities={handleMergeEntities}
                  onUpdateEntity={handleUpdateEntity}
                  onAddEntity={handleAddEntity}
                />
              )}

              {currentTab === "script" && (
                <ScreenplayViewer
                  onSelectEntity={(id) => setSelectedEntityId(id)}
                  onUpdateEntities={(newEntities) => setEntities(newEntities)}
                />
              )}

              {currentTab === "differential" && (
                <DifferentialClearanceView
                  userRole={userRole}
                  onTriggerNotification={showNotification}
                />
              )}

              {currentTab === "review" && (
                <ReviewWorkflow
                  entities={entities}
                  evaluations={evaluations}
                  userRole={userRole}
                  onApproveRun={handleApproveRun}
                  isRunApproved={isRunApproved}
                  onApplyOverride={handleApplyOverride}
                  onTriggerNotification={showNotification}
                />
              )}

              {currentTab === "report" && (
                <ClearanceReport
                  entities={entities}
                  evaluations={evaluations}
                  isApproved={isRunApproved}
                  projectTitle={activeProject.title}
                  jurisdiction={activeProject.jurisdiction}
                  signOffRecord={counselSignOff}
                />
              )}

              {currentTab === "audit" && (
                <AuditLedgerView
                  auditEntries={auditEntries}
                  projectTitle={activeProject.title}
                  projectId={activeProject.id}
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

              {currentTab === "roadmap" && (
                <RoadmapView
                  entities={entities}
                  evaluations={evaluations}
                  isApproved={isRunApproved}
                  onApproveRun={handleApproveRun}
                  onRecordAuditEvent={recordChainedAuditEvent}
                  onNavigateTab={(tab) => setCurrentTab(tab)}
                  auditEntries={auditEntries}
                  activeProject={activeProject}
                  currentUser={currentUser}
                />
              )}
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
