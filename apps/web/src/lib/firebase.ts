/**
 * Firebase services for the PERMISSA dashboard.
 *
 * Initialisation is lazy and config-driven: the public Firebase web config
 * arrives at runtime from GET /config.json, exactly as the operator console
 * receives it from server.js. No Firebase config is imported into the client
 * bundle at build time -- Dockerfile.web fails the build if anything
 * AIza-prefixed lands in .next/static, and this module keeps that gate
 * intact.
 *
 * `auth` and `db` are assigned by initWebServices() and exported as live
 * bindings so the sync modules (firestore-sync, presence-sync) keep working
 * unchanged. Code that dereferences them is guarded by currentUser(), which
 * returns null until initialisation, so nothing touches Firestore or Auth
 * before the runtime config arrives.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from "firebase/firestore";

/** The public Firebase web configuration, as served by /config.json. */
export type WebFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
  /** Named Firestore database (e.g. premissadb). Omit for "(default)". */
  firestoreDatabaseId?: string;
};

let app: FirebaseApp | null = null;

export let auth: Auth;
export let db: Firestore;
export const googleProvider = new GoogleAuthProvider();

export function isFirebaseReady(): boolean {
  return app !== null;
}

/** The signed-in user, or null before initialisation or when signed out. */
export function currentUser(): User | null {
  return isFirebaseReady() ? auth.currentUser : null;
}

/**
 * Initialise the Firebase app, Auth and Firestore from the runtime config.
 * Idempotent: repeated calls return the existing instances.
 */
export function initWebServices(config: WebFirebaseConfig): {
  auth: Auth;
  db: Firestore;
} {
  if (app) {
    return { auth, db };
  }
  app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          appId: config.appId,
          ...(config.messagingSenderId
            ? { messagingSenderId: config.messagingSenderId }
            : {}),
        });
  db = config.firestoreDatabaseId
    ? getFirestore(app, config.firestoreDatabaseId)
    : getFirestore(app);
  auth = getAuth(app);
  return { auth, db };
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null | undefined;
    email?: string | null | undefined;
    emailVerified?: boolean | null | undefined;
    isAnonymous?: boolean | null | undefined;
    tenantId?: string | null | undefined;
    providerInfo?: {
      providerId?: string | null | undefined;
      email?: string | null | undefined;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const signedIn = currentUser();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: signedIn?.uid ?? null,
      email: signedIn?.email ?? null,
      emailVerified: signedIn?.emailVerified ?? null,
      isAnonymous: signedIn?.isAnonymous ?? null,
      tenantId: signedIn?.tenantId ?? null,
      providerInfo:
        signedIn?.providerData?.map((provider) => ({
          providerId: provider.providerId ?? null,
          email: provider.email ?? null,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validates connection to the provisioned Firestore database. Returns false
 * before initialisation: without the runtime config there is nothing to
 * connect to.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  if (!isFirebaseReady()) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.warn("Firestore client is offline or initializing.");
      return false;
    }
    // Return true if connected even if test doc does not exist
    return true;
  }
}

/**
 * Sign in with Google using popup
 */
export async function signInWithGoogle(): Promise<User | null> {
  if (!isFirebaseReady()) {
    throw new Error(
      "Sign-in is unavailable: the dashboard configuration could not be loaded.",
    );
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    if (
      error?.code === "auth/popup-closed-by-user" ||
      error?.code === "auth/cancelled-popup-request"
    ) {
      // Ignore user cancellation
      throw error;
    }
    console.error("Google sign-in error:", error);
    throw error;
  }
}

/**
 * Sign out current authenticated user
 */
export async function signOutUser(): Promise<void> {
  if (!isFirebaseReady()) {
    return;
  }
  await signOut(auth);
}
