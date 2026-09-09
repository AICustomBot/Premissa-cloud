/**
 * Firebase authentication for the operator console.
 *
 * The SDK owns the credential lifecycle: it holds the ID token in memory,
 * refreshes it before the one-hour expiry, and hands out a valid token from
 * getIdToken(). This module never reads, stores, or logs a token itself.
 *
 * Persistence is deliberately session-scoped rather than local. Firebase keeps
 * a long-lived refresh token for a signed-in user, and browserSessionPersistence
 * confines it to the browser tab, so closing the tab ends the session on a
 * shared workstation. That is the correct trade-off for a console that reaches
 * tenant clearance data.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserSessionPersistence,
  getAuth,
  onIdTokenChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import type { FirebaseWebConfig } from "./config.js";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export async function initAuth(config: FirebaseWebConfig): Promise<Auth> {
  if (auth) {
    return auth;
  }
  app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
    ...(config.messagingSenderId
      ? { messagingSenderId: config.messagingSenderId }
      : {}),
  });
  const instance = getAuth(app);
  await setPersistence(instance, browserSessionPersistence);
  auth = instance;
  return instance;
}

export type ConsoleIdentity = {
  uid: string;
  email: string | null;
  displayName: string | null;
  /** From the `role` custom claim. Null means the API will default to PRODUCER. */
  role: string | null;
  /** From the `orgId` custom claim. Null means no organization scope. */
  organizationId: string | null;
};

/**
 * Read the identity from the token's claims, not from the user profile.
 *
 * Role and organization are authorisation inputs, so they are taken from the
 * signed token that the API will itself verify. Nothing here is trusted for
 * access decisions: the API re-verifies every request.
 */
export async function readIdentity(user: User): Promise<ConsoleIdentity> {
  const result = await user.getIdTokenResult();
  const claims = result.claims as Record<string, unknown>;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: typeof claims.role === "string" ? claims.role : null,
    organizationId: typeof claims.orgId === "string" ? claims.orgId : null,
  };
}

export function watchAuthState(
  instance: Auth,
  onChange: (user: User | null) => void,
): () => void {
  // onIdTokenChanged rather than onAuthStateChanged: it also fires on token
  // refresh and on claim changes, so the displayed role cannot go stale.
  return onIdTokenChanged(instance, onChange);
}

export async function signInWithGoogle(instance: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  // Always let the operator pick an account. Silent reuse of a personal Google
  // session is the wrong default for a shared operator console.
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(instance, provider);
}

export async function signOutOfConsole(instance: Auth): Promise<void> {
  await signOut(instance);
}

/** A valid ID token, refreshed by the SDK if the current one is near expiry. */
export function getIdToken(user: User, forceRefresh = false): Promise<string> {
  return user.getIdToken(forceRefresh);
}

/**
 * Translate a Firebase error into the setting that actually needs changing.
 * The raw codes are accurate but say nothing about where to go.
 */
export function describeAuthError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";

  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/popup-blocked":
      return "The browser blocked the sign-in popup. Allow popups for this site and try again.";
    case "auth/unauthorized-domain":
      return "This origin is not an authorised domain for the Firebase project. Add it under Authentication > Settings > Authorised domains.";
    case "auth/operation-not-allowed":
      return "Google sign-in is not enabled for this Firebase project. Enable the Google provider under Authentication > Sign-in method.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "The Firebase API key is invalid or restricted from this origin. Check the key's HTTP referrer restrictions.";
    case "auth/network-request-failed":
      return "Could not reach Firebase Authentication. Check network connectivity and any API key restrictions.";
    case "auth/user-disabled":
      return "This account is disabled in Firebase Authentication.";
    default:
      break;
  }

  if (err instanceof Error && err.message) {
    return code ? `${err.message} (${code})` : err.message;
  }
  return "Sign-in failed for an unknown reason.";
}
