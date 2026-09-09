import {
  db,
  auth,
  currentUser,
  OperationType,
  handleFirestoreError,
  testFirestoreConnection,
} from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import type { ClearanceItem } from "../data/golden-data";
import type {
  ProjectSummary,
  TenantUser,
  AuditRecord,
} from "../components/ProjectWorkspaceBar";

export interface SyncStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  error: string | null;
}

/**
 * Ensures tenant organization exists in Firestore before project creation
 */
export async function ensureOrganizationInFirestore(
  orgId: string,
  orgName: string,
  ownerId: string,
): Promise<void> {
  if (!currentUser()) return;
  const orgPath = `organizations/${orgId}`;
  try {
    const orgRef = doc(db, "organizations", orgId);
    const snap = await getDoc(orgRef);
    if (!snap.exists()) {
      await setDoc(orgRef, {
        id: orgId,
        name: orgName,
        ownerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.warn("Organization check/init note:", error);
  }
}

/**
 * Initializes or fetches a project in Firestore.
 * If project does not exist yet, seeds it with initial data conforming to security rules.
 */
export async function syncProjectToFirestore(
  project: ProjectSummary,
  entities: ClearanceItem[],
  user: TenantUser,
): Promise<void> {
  if (!currentUser()) {
    return;
  }
  const projectPath = `projects/${project.id}`;
  try {
    // Ensure organization document exists for membership checks
    await ensureOrganizationInFirestore(
      project.organizationId,
      user.organizationName || "Apex Pictures Entertainment",
      auth.currentUser!.uid,
    );

    const projectRef = doc(db, "projects", project.id);
    const existingSnap = await getDoc(projectRef);

    if (!existingSnap.exists()) {
      // Seed initial project document strictly matching isValidProject rule:
      // version: 1, budgetUsed: 0, isRunApproved: false, server timestamps
      await setDoc(projectRef, {
        id: project.id,
        organizationId: project.organizationId,
        title: project.title,
        jurisdiction: "US",
        createdBy: auth.currentUser!.uid,
        version: 1,
        isRunApproved: false,
        budgetUsed: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Seed candidate entities in subcollection adhering to client-create rule
      for (const entity of entities) {
        const entityRef = doc(
          db,
          "projects",
          project.id,
          "entities",
          entity.id,
        );
        await setDoc(entityRef, {
          id: entity.id,
          projectId: project.id,
          canonicalName: entity.canonicalName,
          type: entity.type,
          initialProposedStatus: "INSUFFICIENT_EVIDENCE",
          rationale:
            entity.rationale || "Candidate entity awaiting evidence gate.",
          rewriteSuggestion: entity.rewriteSuggestion || "",
          confirmedByProducer: false,
          reviewerNotes: "",
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    console.warn("Project sync deferred:", error);
  }
}

/**
 * Updates a single clearance entity in Firestore subcollection respecting role boundaries
 */
export async function updateEntityInFirestore(
  projectId: string,
  entityId: string,
  updates: Partial<ClearanceItem>,
  role: "PRODUCER" | "REVIEWER" = "PRODUCER",
): Promise<void> {
  if (!currentUser()) {
    return;
  }
  const entityPath = `projects/${projectId}/entities/${entityId}`;
  try {
    const entityRef = doc(db, "projects", projectId, "entities", entityId);

    // Whitelisted fields matching security rules role partitioning
    const payload: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (role === "PRODUCER") {
      // PRODUCER: confirmedByProducer, canonicalName, type, rewriteSuggestion, rationale, updatedAt
      if (updates.confirmedByProducer !== undefined) {
        payload.confirmedByProducer = updates.confirmedByProducer;
      }
      if (updates.canonicalName !== undefined) {
        payload.canonicalName = updates.canonicalName;
      }
      if (updates.type !== undefined) {
        payload.type = updates.type;
      }
      if (updates.rewriteSuggestion !== undefined) {
        payload.rewriteSuggestion = updates.rewriteSuggestion;
      }
      if (updates.rationale !== undefined) {
        payload.rationale = updates.rationale;
      }
    } else {
      // REVIEWER: initialProposedStatus, reviewerNotes, updatedAt
      if (updates.initialProposedStatus !== undefined) {
        payload.initialProposedStatus = updates.initialProposedStatus;
      }
      if (updates.reviewerNotes !== undefined) {
        payload.reviewerNotes = updates.reviewerNotes;
      }
    }

    await updateDoc(entityRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, entityPath);
  }
}

/**
 * Deletes a single clearance entity from Firestore subcollection
 */
export async function deleteEntityInFirestore(
  projectId: string,
  entityId: string,
): Promise<void> {
  if (!currentUser()) {
    return;
  }
  const entityPath = `projects/${projectId}/entities/${entityId}`;
  try {
    const entityRef = doc(db, "projects", projectId, "entities", entityId);
    await deleteDoc(entityRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, entityPath);
  }
}

/**
 * Saves a new candidate clearance entity in Firestore subcollection
 */
export async function saveNewEntityToFirestore(
  projectId: string,
  entity: ClearanceItem,
): Promise<void> {
  if (!currentUser()) {
    return;
  }
  const entityPath = `projects/${projectId}/entities/${entity.id}`;
  try {
    const entityRef = doc(db, "projects", projectId, "entities", entity.id);
    await setDoc(entityRef, {
      id: entity.id,
      projectId,
      canonicalName: entity.canonicalName,
      type: entity.type,
      initialProposedStatus: "INSUFFICIENT_EVIDENCE",
      rationale: entity.rationale || "Candidate entity awaiting evidence gate.",
      rewriteSuggestion: entity.rewriteSuggestion || "",
      confirmedByProducer: false,
      reviewerNotes: "",
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, entityPath);
  }
}

/**
 * Updates project run approval state in Firestore
 */
export async function updateProjectApprovalInFirestore(
  projectId: string,
  isRunApproved: boolean,
  currentVersion: number,
): Promise<void> {
  if (!currentUser()) {
    return;
  }
  const projectPath = `projects/${projectId}`;
  try {
    const projectRef = doc(db, "projects", projectId);
    await updateDoc(projectRef, {
      isRunApproved,
      version: currentVersion + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, projectPath);
  }
}

import type { HashChainedAuditEntry } from "./hash-chained-audit";

/**
 * Appends a tamper-evident, hash-chained audit log entry to Firestore
 */
export async function appendAuditLogToFirestore(
  entry: HashChainedAuditEntry,
): Promise<void> {
  if (!currentUser()) {
    return;
  }
  const logPath = `projects/${entry.projectId}/auditLogs/${entry.id}`;
  try {
    const logRef = doc(db, "projects", entry.projectId, "auditLogs", entry.id);
    await setDoc(logRef, {
      id: entry.id,
      sequence: entry.sequence,
      projectId: entry.projectId,
      organizationId: entry.organizationId,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      previousEntryHash: entry.previousEntryHash,
      entryHash: entry.entryHash,
      timestamp: serverTimestamp(),
      details: entry.details,
    });
  } catch (error) {
    console.warn("Audit trail Firestore append note:", error);
  }
}

/**
 * Subscribes to real-time hash-chained audit log entries
 */
export function subscribeToProjectAuditLogs(
  projectId: string,
  onLogsChange: (entries: HashChainedAuditEntry[]) => void,
) {
  if (!currentUser()) {
    return () => {};
  }
  const logsRef = collection(db, "projects", projectId, "auditLogs");

  return onSnapshot(
    logsRef,
    (snapshot) => {
      const logs: HashChainedAuditEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as HashChainedAuditEntry;
        logs.push(data);
      });
      // Sort by sequence monotonic order
      logs.sort((a, b) => a.sequence - b.sequence);
      if (logs.length > 0) {
        onLogsChange(logs);
      }
    },
    (err) => {
      console.warn("Audit logs subscription note:", err);
    },
  );
}

/**
 * Subscribes to real-time project entities from Firestore
 */
export function subscribeToProjectEntities(
  projectId: string,
  onEntitiesChange: (entities: Partial<ClearanceItem>[]) => void,
  onError?: (err: Error) => void,
) {
  if (!currentUser()) {
    return () => {};
  }
  const collectionPath = `projects/${projectId}/entities`;
  const entitiesRef = collection(db, "projects", projectId, "entities");

  return onSnapshot(
    entitiesRef,
    (snapshot) => {
      const items: Partial<ClearanceItem>[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as Partial<ClearanceItem>);
      });
      onEntitiesChange(items);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
      try {
        handleFirestoreError(error, OperationType.GET, collectionPath);
      } catch (err) {
        console.warn("Firestore subscription note:", err);
      }
    },
  );
}

/**
 * Sync user profile to Firestore adhering to isValidUserProfile rule
 */
export async function syncUserProfileToFirestore(
  user: TenantUser,
): Promise<void> {
  const signedIn = currentUser();
  if (!signedIn) {
    return;
  }
  const userPath = `users/${signedIn.uid}`;
  try {
    const userRef = doc(db, "users", signedIn.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        id: signedIn.uid,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organizationName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      // Changed keys can only be name, organizationName, updatedAt
      await updateDoc(userRef, {
        name: user.name,
        organizationName: user.organizationName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.warn("User profile sync note:", error);
  }
}
