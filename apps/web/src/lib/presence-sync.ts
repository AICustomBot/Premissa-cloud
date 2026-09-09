import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db, currentUser } from "./firebase";
import type { TenantUser } from "../components/ProjectWorkspaceBar";

export interface UserPresence {
  id: string;
  userId: string;
  userName: string;
  role: "PRODUCER" | "REVIEWER" | "OWNER";
  organizationName: string;
  avatarColor: string;
  activeTab: string;
  selectedEntityId?: string | null;
  lastActiveAt?: any;
}

/**
 * Broadcasts caller presence into Firestore subcollection /projects/{projectId}/presence/{userId}
 */
export async function broadcastUserPresence(
  projectId: string,
  user: TenantUser,
  activeTab: string,
  selectedEntityId?: string | null,
): Promise<void> {
  if (!currentUser()) {
    return;
  }
  try {
    const presenceRef = doc(db, "projects", projectId, "presence", user.id);
    await setDoc(
      presenceRef,
      {
        id: user.id,
        userId: user.id,
        userName: user.name,
        role: user.role,
        organizationName: user.organizationName,
        avatarColor:
          user.avatarColor ||
          (user.role === "REVIEWER" ? "bg-purple-600" : "bg-indigo-600"),
        activeTab,
        selectedEntityId: selectedEntityId || null,
        lastActiveAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("Presence broadcast warning (safely degraded):", err);
  }
}

/**
 * Removes user presence document when signing out or unmounting
 */
export async function removeUserPresence(
  projectId: string,
  userId: string,
): Promise<void> {
  if (!currentUser()) {
    return;
  }
  try {
    const presenceRef = doc(db, "projects", projectId, "presence", userId);
    await deleteDoc(presenceRef);
  } catch (err) {
    console.warn("Presence remove note:", err);
  }
}

/**
 * Subscribes in real-time to active presence documents for a project
 */
export function subscribeToProjectPresence(
  projectId: string,
  onPresenceUpdate: (users: UserPresence[]) => void,
) {
  if (!currentUser()) {
    return () => {};
  }

  const presenceCol = collection(db, "projects", projectId, "presence");
  return onSnapshot(
    presenceCol,
    (snapshot) => {
      const activeUsers: UserPresence[] = [];
      snapshot.forEach((docSnap) => {
        activeUsers.push(docSnap.data() as UserPresence);
      });
      onPresenceUpdate(activeUsers);
    },
    (err) => {
      console.warn("Presence subscription note:", err);
    },
  );
}
