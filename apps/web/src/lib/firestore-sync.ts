import {
  db,
  auth,
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
 * Initializes or fetches a project in Firestore.
 * If project does not exist yet, seeds it with initial data.
 */
export async function syncProjectToFirestore(
  project: ProjectSummary,
  entities: ClearanceItem[],
  user: TenantUser,
): Promise<void> {
  if (!auth.currentUser) {
    return;
  }
  const projectPath = `projects/${project.id}`;
  try {
    const projectRef = doc(db, "projects", project.id);
    const existingSnap = await getDoc(projectRef);

    if (!existingSnap.exists()) {
      // Seed initial project document
      const now = new Date().toISOString();
      await setDoc(projectRef, {
        id: project.id,
        organizationId: project.organizationId,
        title: project.title,
        jurisdiction: project.jurisdiction,
        createdBy: user.id,
        version: project.version,
        isRunApproved: false,
        budgetUsed: 0.42,
        createdAt: project.createdAt || now,
        updatedAt: now,
      });

      // Seed entities in subcollection
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
          initialProposedStatus: entity.initialProposedStatus,
          rationale: entity.rationale,
          rewriteSuggestion: entity.rewriteSuggestion || "",
          confirmedByProducer: Boolean(entity.confirmedByProducer),
          reviewerNotes: entity.reviewerNotes || "",
          updatedAt: now,
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, projectPath);
  }
}

/**
 * Updates a single clearance entity in Firestore subcollection
 */
export async function updateEntityInFirestore(
  projectId: string,
  entityId: string,
  updates: Partial<ClearanceItem>,
): Promise<void> {
  if (!auth.currentUser) {
    return;
  }
  const entityPath = `projects/${projectId}/entities/${entityId}`;
  try {
    const entityRef = doc(db, "projects", projectId, "entities", entityId);
    const now = new Date().toISOString();

    // Whitelisted fields matching security rules
    const payload: Record<string, any> = {
      updatedAt: now,
    };
    if (updates.confirmedByProducer !== undefined) {
      payload.confirmedByProducer = updates.confirmedByProducer;
    }
    if (updates.initialProposedStatus !== undefined) {
      payload.initialProposedStatus = updates.initialProposedStatus;
    }
    if (updates.reviewerNotes !== undefined) {
      payload.reviewerNotes = updates.reviewerNotes;
    }
    if (updates.canonicalName !== undefined) {
      payload.canonicalName = updates.canonicalName;
    }
    if (updates.rewriteSuggestion !== undefined) {
      payload.rewriteSuggestion = updates.rewriteSuggestion;
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
  if (!auth.currentUser) {
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
 * Saves a new or survivor clearance entity in Firestore subcollection
 */
export async function saveNewEntityToFirestore(
  projectId: string,
  entity: ClearanceItem,
): Promise<void> {
  if (!auth.currentUser) {
    return;
  }
  const entityPath = `projects/${projectId}/entities/${entity.id}`;
  try {
    const entityRef = doc(db, "projects", projectId, "entities", entity.id);
    const now = new Date().toISOString();
    await setDoc(entityRef, {
      id: entity.id,
      projectId,
      canonicalName: entity.canonicalName,
      type: entity.type,
      initialProposedStatus: entity.initialProposedStatus,
      rationale: entity.rationale,
      rewriteSuggestion: entity.rewriteSuggestion || "",
      confirmedByProducer: Boolean(entity.confirmedByProducer),
      reviewerNotes: entity.reviewerNotes || "",
      updatedAt: now,
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
  if (!auth.currentUser) {
    return;
  }
  const projectPath = `projects/${projectId}`;
  try {
    const projectRef = doc(db, "projects", projectId);
    await updateDoc(projectRef, {
      isRunApproved,
      version: currentVersion + 1,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, projectPath);
  }
}

/**
 * Appends a tamper-evident, content-free audit log entry in Firestore
 */
export async function appendAuditLogToFirestore(
  projectId: string,
  organizationId: string,
  actorId: string,
  action: string,
  logId: string,
): Promise<void> {
  if (!auth.currentUser) {
    return;
  }
  const logPath = `projects/${projectId}/auditLogs/${logId}`;
  try {
    const logRef = doc(db, "projects", projectId, "auditLogs", logId);
    await setDoc(logRef, {
      id: logId,
      organizationId,
      actorId,
      action,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, logPath);
  }
}

/**
 * Subscribes to real-time project entities from Firestore
 */
export function subscribeToProjectEntities(
  projectId: string,
  onEntitiesChange: (entities: Partial<ClearanceItem>[]) => void,
  onError?: (err: Error) => void,
) {
  if (!auth.currentUser) {
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
        console.warn("Firestore subscription error:", err);
      }
    },
  );
}

/**
 * Sync user profile to Firestore
 */
export async function syncUserProfileToFirestore(
  user: TenantUser,
): Promise<void> {
  if (!auth.currentUser) {
    return;
  }
  const userPath = `users/${user.id}`;
  try {
    const userRef = doc(db, "users", user.id);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organizationName,
        createdAt: new Date().toISOString(),
      });
    } else {
      await updateDoc(userRef, {
        name: user.name,
        role: user.role,
        organizationName: user.organizationName,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}
