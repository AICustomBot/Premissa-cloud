/**
 * Legacy applet Firebase layer. Slated for deletion.
 *
 * This module predates the three-service topology. It is still imported by
 * ClientPage.tsx, firestore-sync.ts and presence-sync.ts, so it cannot be
 * removed until those are rewired onto src/lib/auth.ts and the API. What it
 * can stop doing is leaking a credential-shaped literal into the client
 * bundle, and crashing the server render.
 *
 * History, so the next reader does not undo either fix:
 *
 *   1. It used to import firebase-applet-config.json, which carried a real
 *      AIza-prefixed Firebase web API key. Next inlined that into the /
 *      chunk and the container build failed at the secret gate -- correctly,
 *      because Gemini API keys share the AIza prefix and that guard is the
 *      last thing standing between a genuine secret and a public URL.
 *   2. Removing the key then broke the server render: firebase/auth asserts
 *      on apiKey inside initializeAuth, so getAuth(app) threw
 *      auth/invalid-api-key at module load and GET / answered 500. Hence the
 *      signed-out stand-in below rather than a real Auth instance.
 *
 * The dashboard does not own a Firebase session. permissa-console is the
 * login surface; it forwards an authenticated operator here through the
 * custom-token handoff at /auth/callback, and src/lib/auth.ts establishes
 * the real session against a separately named Firebase app configured at
 * runtime from /api/config.
 *
 * The identifiers below are not secrets. A project id, app id, sender id and
 * auth domain are shipped to every browser by any Firebase app; they are
 * inlined only so this module keeps a stable shape until it is deleted.
 */
import { initializeApp, getApps, getApp } from "firebase/app";
import { GoogleAuthProvider, type Auth, type User } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";

/**
 * No apiKey. Supplying one would put it back in the bundle; omitting it makes
 * the inability to reach Firebase explicit rather than latent.
 */
const legacyAppConfig = {
  projectId: "aicustombot",
  appId: "1:1080010918804:web:2ec5aa2ea18daf24245d81",
  authDomain: "aicustombot.firebaseapp.com",
  messagingSenderId: "1080010918804",
  storageBucket: "aicustombot.firebasestorage.app",
};

/**
 * The production database. The retired value here was
 * ai-studio-permissa-c6dfc351-5d1e-4392-902d-ec4b5d09ea49, a scratch database
 * from the AI Studio applet that no longer exists.
 */
const FIRESTORE_DATABASE_ID = "premissadb";

const app = getApps().length > 0 ? getApp() : initializeApp(legacyAppConfig);

export const db = getFirestore(app, FIRESTORE_DATABASE_ID);

type AuthStateObserver =
  | ((user: User | null) => void)
  | { next?: (user: User | null) => void };

function notifySignedOut(observer: AuthStateObserver): () => void {
  const next = typeof observer === "function" ? observer : observer?.next;
  if (typeof next === "function") {
    // Asynchronous, matching the real SDK: subscribers must not be invoked
    // during their own subscribe call.
    void Promise.resolve().then(() => next(null));
  }
  return () => {};
}

/**
 * A permanently signed-out stand-in for Auth.
 *
 * Constructing a real Auth instance is impossible without an API key, and
 * attempting it takes the server render down with it. This exposes the only
 * surface the legacy callers touch -- currentUser, the two change observers
 * and signOut -- and reports the truth: nobody is signed in through this app.
 *
 * firebase/auth's modular onAuthStateChanged is a thin delegation to
 * auth.onAuthStateChanged, so ClientPage.tsx's subscription resolves normally
 * and receives null.
 *
 * Consequence, and it is the desired one: every function in firestore-sync.ts
 * and presence-sync.ts early-returns on !auth.currentUser, so they no-op
 * rather than firing writes at a deny-all ruleset and swallowing the
 * rejection.
 */
const signedOutAuth = {
  app,
  name: app.name,
  currentUser: null as User | null,
  languageCode: null,
  tenantId: null,
  onAuthStateChanged: (observer: AuthStateObserver) =>
    notifySignedOut(observer),
  onIdTokenChanged: (observer: AuthStateObserver) => notifySignedOut(observer),
  beforeAuthStateChanged: () => () => {},
  signOut: async () => {},
};

export const auth = signedOutAuth as unknown as Auth;

/**
 * Inert. Kept only so the module's export shape stays stable until it is
 * deleted; no sign-in flow runs on the dashboard.
 */
export const googleProvider = new GoogleAuthProvider();

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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
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
 * Reports whether this legacy app can reach Firestore. It cannot: there is no
 * API key and the ruleset denies everything. Returning false is the truthful
 * answer, and it stops the UI claiming a cloud connection it does not have.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error) {
    console.warn(
      "Legacy Firestore layer is not connected. This is expected: it has no " +
        "API key and the ruleset denies all access. Durable state lives behind " +
        "the API.",
      error,
    );
    return false;
  }
}

/**
 * Sign-in does not happen on the dashboard. permissa-console is the login
 * surface and forwards an authenticated operator here through the
 * custom-token handoff, so this path is a programming error rather than a
 * user-facing flow.
 */
export async function signInWithGoogle(): Promise<User | null> {
  throw new Error(
    "Sign-in is handled by the PERMISSA console, not the dashboard. The " +
      "console forwards an authenticated session to /auth/callback.",
  );
}

/**
 * This app never holds a session, so there is nothing to tear down. The real
 * sign-out is signOutOfApp in src/lib/auth.ts.
 */
export async function signOutUser(): Promise<void> {
  console.warn(
    "signOutUser touched the legacy Firebase layer, which holds no session. " +
      "Use signOutOfApp from src/lib/auth.ts.",
  );
}
