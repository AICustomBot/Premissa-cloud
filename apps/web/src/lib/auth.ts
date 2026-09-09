/**
 * Firebase authentication for the product UI.
 *
 * This is the console's auth model (studio/firebase.ts) applied to apps/web,
 * which until now offered only a Google popup and initialised Firebase from a
 * checked-in config file. Two things change: the config arrives at runtime,
 * and password accounts are supported behind the same verification gate the
 * API enforces.
 *
 * The SDK owns the credential lifecycle: it holds the ID token in memory,
 * refreshes it before the one-hour expiry, and hands out a valid token from
 * getIdToken(). This module never reads, stores, or logs a token itself.
 *
 * Persistence is session-scoped rather than local. Firebase keeps a long-lived
 * refresh token for a signed-in user, and browserSessionPersistence confines it
 * to the browser tab, so closing the tab ends the session on a shared machine.
 * That is the right trade-off for a surface that reaches tenant clearance data.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import type { FirebaseWebConfig } from "./config";

/**
 * A named app rather than the default one. The outgoing src/lib/firebase.ts
 * still initialises the default app from its checked-in config; naming this
 * one keeps the two from colliding until that file is removed.
 */
const APP_NAME = "permissa-web";

let authInstance: Auth | null = null;

/** Firebase itself accepts six characters; eight is this app's floor. */
export const MIN_PASSWORD_LENGTH = 8;

export async function initAuth(config: FirebaseWebConfig): Promise<Auth> {
  if (authInstance) {
    return authInstance;
  }

  const existing = getApps().find((candidate) => candidate.name === APP_NAME);
  const app: FirebaseApp =
    existing ??
    initializeApp(
      {
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        appId: config.appId,
        ...(config.messagingSenderId
          ? { messagingSenderId: config.messagingSenderId }
          : {}),
      },
      APP_NAME,
    );

  const instance = getAuth(app);
  await setPersistence(instance, browserSessionPersistence);
  authInstance = instance;
  return instance;
}

export function currentAuth(): Auth | null {
  return authInstance;
}

export type Identity = {
  uid: string;
  email: string | null;
  displayName: string | null;
  /** From the `role` custom claim. Null means the API will default to PRODUCER. */
  role: "OWNER" | "PRODUCER" | "REVIEWER" | null;
  /** From the `orgId` custom claim. Null means no organization scope. */
  organizationId: string | null;
};

const KNOWN_ROLES = ["OWNER", "PRODUCER", "REVIEWER"] as const;

/**
 * Read identity from the token's claims rather than the user profile.
 *
 * Role and organization are authorisation inputs, so they come from the signed
 * token the API will itself verify. Nothing here is trusted for access
 * decisions: the API re-verifies every request, and this is only used to decide
 * what to render.
 */
export async function readIdentity(user: User): Promise<Identity> {
  const result = await user.getIdTokenResult();
  const claims = result.claims as Record<string, unknown>;
  const claimedRole =
    typeof claims.role === "string" ? claims.role.toUpperCase() : null;
  const role =
    claimedRole &&
    (KNOWN_ROLES as readonly string[]).includes(claimedRole)
      ? (claimedRole as Identity["role"])
      : null;

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role,
    organizationId:
      typeof claims.orgId === "string" ? claims.orgId : null,
  };
}

export function watchAuthState(
  instance: Auth,
  onChange: (user: User | null) => void,
): () => void {
  // onIdTokenChanged rather than onAuthStateChanged: it also fires on token
  // refresh and on claim changes, so a displayed role cannot go stale.
  return onIdTokenChanged(instance, onChange);
}

export async function signInWithGoogle(instance: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(instance, provider);
}

export async function signInWithEmailPassword(
  instance: Auth,
  email: string,
  password: string,
): Promise<void> {
  await signInWithEmailAndPassword(instance, email.trim(), password);
}

/**
 * Create a password account and send its verification mail in the same step,
 * so the user never has to ask for the mail they were always going to need.
 */
export async function registerWithEmailPassword(
  instance: Auth,
  email: string,
  password: string,
): Promise<void> {
  const credential = await createUserWithEmailAndPassword(
    instance,
    email.trim(),
    password,
  );
  await sendEmailVerification(credential.user);
}

export async function sendPasswordReset(
  instance: Auth,
  email: string,
): Promise<void> {
  await sendPasswordResetEmail(instance, email.trim());
}

export async function resendEmailVerification(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export function usesPasswordProvider(user: User): boolean {
  return user.providerData.some((entry) => entry.providerId === "password");
}

/**
 * True when this identity cannot call the API yet. Only password identities
 * can be in this state: a federated provider has already proven the address.
 */
export function needsEmailVerification(user: User): boolean {
  return usesPasswordProvider(user) && !user.emailVerified;
}

/**
 * Re-read the account after the user clicks the mailed link.
 *
 * `emailVerified` lives on the server-side account record, so the local user
 * must be reloaded. A force-refreshed token is then required: the existing one
 * still carries email_verified=false, and the API reads the token, not the
 * account.
 */
export async function refreshEmailVerification(user: User): Promise<boolean> {
  await user.reload();
  if (user.emailVerified) {
    await user.getIdToken(true);
  }
  return user.emailVerified;
}

export async function signOutOfApp(instance: Auth): Promise<void> {
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
      return "This sign-in method is not enabled for the Firebase project. Enable the Google and Email/Password providers under Authentication > Sign-in method.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "The Firebase API key is invalid or restricted from this origin. Check the key's HTTP referrer restrictions.";
    case "auth/network-request-failed":
      return "Could not reach Firebase Authentication. Check network connectivity and any API key restrictions.";
    case "auth/user-disabled":
      return "This account is disabled in Firebase Authentication.";
    case "auth/invalid-email":
      return "That is not a valid email address.";
    case "auth/missing-password":
      return "Enter your password.";
    // Firebase returns invalid-credential for a wrong password and for an
    // unknown address once email-enumeration protection is on. Keep the
    // message ambiguous on purpose: distinguishing them leaks account
    // existence.
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email address and password combination was not accepted.";
    case "auth/email-already-in-use":
      return "An account already exists for that address. Sign in instead, or reset the password.";
    case "auth/weak-password":
      return `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "auth/too-many-requests":
      return "Too many attempts from this device. Firebase has temporarily blocked further tries; wait a few minutes or reset the password.";
    case "auth/requires-recent-login":
      return "This action needs a fresh sign-in. Sign out and back in, then retry.";
    default:
      break;
  }

  if (err instanceof Error && err.message) {
    return code ? `${err.message} (${code})` : err.message;
  }
  return "Sign-in failed for an unknown reason.";
}
