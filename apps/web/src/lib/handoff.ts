/**
 * Console -> dashboard session handoff (Option A).
 *
 * After sign-in, the operator console redirects to `/#handoff=<id token>`.
 * The token travels in the URL fragment, which is never sent to a server and
 * never written to an access log. It is stored in sessionStorage (tab-scoped,
 * matching the console's browserSessionPersistence) and the URL is scrubbed
 * immediately so the token cannot leak through a copied link or a reload.
 *
 * The token authenticates API calls, which the API verifies server-side. This
 * module only decodes the payload for display; no trust decision is made in
 * the browser. When the token expires (one hour), the user returns to the
 * console for a fresh handoff.
 */

export type HandoffIdentity = {
  uid: string;
  email: string | null;
  name: string | null;
  /** From the `role` custom claim. Null means the API defaults to PRODUCER. */
  role: string | null;
  /** From the `orgId` custom claim. Null means no organisation scope. */
  organizationId: string | null;
  token: string;
  /** Expiry in seconds since the epoch, from the token's `exp` claim. */
  expiresAt: number;
};

const STORAGE_KEY = "permissa.console-handoff";

function decodePayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toIdentity(
  token: string,
  claims: Record<string, unknown>,
): HandoffIdentity | null {
  if (typeof claims.exp !== "number") {
    return null;
  }
  const uid =
    typeof claims.user_id === "string"
      ? claims.user_id
      : typeof claims.sub === "string"
        ? claims.sub
        : null;
  if (!uid) {
    return null;
  }
  return {
    uid,
    email: typeof claims.email === "string" ? claims.email : null,
    name: typeof claims.name === "string" ? claims.name : null,
    role: typeof claims.role === "string" ? claims.role : null,
    organizationId: typeof claims.orgId === "string" ? claims.orgId : null,
    token,
    expiresAt: claims.exp,
  };
}

function isExpired(identity: HandoffIdentity): boolean {
  return identity.expiresAt * 1000 <= Date.now();
}

/**
 * Read and remove a handoff token from the URL fragment. Returns the decoded
 * identity, or null when there is no handoff, the token is malformed, or it
 * expired in transit. A valid token is persisted to sessionStorage so an
 * in-tab reload keeps the session.
 */
export function consumeHandoffToken(): HandoffIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }
  const match = window.location.hash.match(/(?:^|#|&)handoff=([^&]+)/);
  if (!match) {
    return null;
  }
  // Scrub first, before anything can read or copy the URL again.
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
  const claims = decodePayload(decodeURIComponent(match[1]));
  if (!claims) {
    return null;
  }
  const identity = toIdentity(decodeURIComponent(match[1]), claims);
  if (!identity || isExpired(identity)) {
    return null;
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Storage unavailable (private mode quota); the in-memory identity still
    // applies for this page load.
  }
  return identity;
}

/** The stored handoff identity for this tab, or null when absent or expired. */
export function getStoredHandoff(): HandoffIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const identity = JSON.parse(raw) as HandoffIdentity;
    if (!identity?.token || isExpired(identity)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return identity;
  } catch {
    return null;
  }
}

/** Drop the stored handoff (sign-out on the dashboard side). */
export function clearHandoff(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
