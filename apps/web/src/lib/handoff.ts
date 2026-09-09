/**
 * Redeeming a console handoff on the dashboard origin.
 *
 * Sign-in happens on the console service. Firebase Auth stores its session per
 * origin, so the dashboard cannot see that session and must establish its own
 * from a custom token minted by the API (POST /v1/auth/handoff).
 *
 * The token arrives in the URL fragment. Fragments are never sent to a server,
 * so it does not reach a Cloud Run access log, a proxy log, or a Referer
 * header -- but it is still in the address bar and in session history, so it is
 * removed before anything is awaited and the callback entry is replaced rather
 * than pushed.
 */
import { signInWithCustomToken, type Auth } from "firebase/auth";

export const HANDOFF_FRAGMENT_KEY = "permissa_handoff";

/** The handoff token in this fragment, or null when there is none. */
export function readHandoffToken(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) {
    return null;
  }
  const token = new URLSearchParams(raw).get(HANDOFF_FRAGMENT_KEY);
  return token && token.trim() ? token : null;
}

/**
 * Remove the fragment without navigating or adding a history entry.
 *
 * Assigning location.hash = "" would leave a bare "#" and push an entry;
 * replaceState rewrites the current one in place.
 */
export function clearHandoffFragment(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

export async function completeHandoff(
  auth: Auth,
  customToken: string,
): Promise<void> {
  await signInWithCustomToken(auth, customToken);
}

/** Translate a redemption failure into the thing that actually needs fixing. */
export function describeHandoffError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";

  switch (code) {
    case "auth/invalid-custom-token":
      return "The sign-in token was not accepted. Start again from the sign-in page.";
    case "auth/custom-token-mismatch":
      // The single most likely misconfiguration: two Firebase web configs.
      return "The sign-in token was issued for a different Firebase project than this app is configured with. The console, the dashboard and the API must all use the same project.";
    case "auth/network-request-failed":
      return "Could not reach Firebase Authentication to complete sign-in. Check connectivity and any API key restrictions.";
    case "auth/unauthorized-domain":
      return "This origin is not an authorised domain for the Firebase project. Add it under Authentication > Settings > Authorised domains.";
    default:
      break;
  }

  if (err instanceof Error && err.message) {
    return code ? `${err.message} (${code})` : err.message;
  }
  return "Sign-in could not be completed.";
}
