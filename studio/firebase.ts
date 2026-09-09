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
 *
 * Two providers are offered. Google proves the email address itself. Password
 * does not, so a password account is only usable once the address is verified;
 * the API enforces that, and this module exposes the state and the actions
 * (resend, re-check) needed to get out of it.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
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
import type { FirebaseWebConfig } from "./config.js";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** Firebase itself accepts six characters; eight is the console's floor. */
export const MIN_PASSWORD_LENGTH = 8;

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

export async function signInWithEmailPassword(
  instance: Auth,
  email: string,
  password: string,
): Promise<void> {
  await signInWithEmailAndPassword(instance, email.trim(), password);
}

/**
 * Create a password account and send its verification mail in the same step.
 *
 * Sending it here rather than on first rejection means the operator never has
 * to ask for the mail they were always going to need.
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
 * True when this identity cannot call the API yet.
 *
 * Only password identities can be in this state: a federated provider has
 * already proven the address.
 */
export function needsEmailVerification(user: User): boolean {
  return usesPasswordProvider(user) && !user.emailVerified;
}

/**
 * Re-read the account after the operator clicks the mailed link.
 *
 * `emailVerified` lives on the server-side account record, so the local user
 * must be reloaded. A force-refreshed token is then required: the existing one
 * still carries email_verified=false and the API reads the token, not the
 * account.
 */
export async function refreshEmailVerification(user: User): Promise<boolean> {
  await user.reload();
  if (user.emailVerified) {
    await user.getIdToken(true);
  }
  return user.emailVerified;
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
