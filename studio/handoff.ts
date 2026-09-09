/**
 * Requesting the dashboard handoff from the console.
 *
 * The console is the sign-in surface; the dashboard is a different Cloud Run
 * service on a different origin, so the Firebase session established here is
 * invisible there. The API mints a custom token that can cross, and this
 * module asks for it and builds the URL that carries it.
 */
import { getApiBaseUrl } from "./api.js";

/**
 * The fragment key the dashboard reads the token from.
 *
 * A fragment rather than a query parameter, deliberately: fragments are never
 * sent to a server, never appear in a Referer header, and never reach a Cloud
 * Run access log or a proxy log.
 */
export const HANDOFF_FRAGMENT_KEY = "permissa_handoff";

export type HandoffResponse = {
  uid: string;
  customToken: string;
  expiresInSeconds: number;
  dashboardUrl: string | null;
  callbackPath: string;
};

function messageFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : null;
}

/** Ask the API for a token this identity can present on the dashboard origin. */
export async function requestHandoff(
  idToken: string,
): Promise<HandoffResponse> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "The API base URL is not configured, so no dashboard handoff can be requested.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/auth/handoff`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${idToken}`,
      },
    });
  } catch (err: unknown) {
    throw new Error(
      `Could not reach ${baseUrl} to request the dashboard handoff. Check that the API permits this origin via CORS. (${
        err instanceof Error ? err.message : "network error"
      })`,
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const reason = messageFromBody(body);

    if (reason === "HANDOFF_SIGNING_DENIED") {
      throw new Error(
        "The API could not sign a handoff token. Its runtime service account " +
          "needs roles/iam.serviceAccountTokenCreator on itself.",
      );
    }
    if (response.status === 401) {
      throw new Error(
        `The API rejected this session (401${
          reason ? ` ${reason}` : ""
        }). Sign out and sign in again.`,
      );
    }
    throw new Error(
      `The API returned ${response.status} for the dashboard handoff${
        reason ? `: ${reason}` : "."
      }`,
    );
  }

  const body = (await response.json()) as Partial<HandoffResponse>;
  if (typeof body.customToken !== "string" || !body.customToken) {
    throw new Error("The API returned no handoff token.");
  }

  return {
    uid: typeof body.uid === "string" ? body.uid : "",
    customToken: body.customToken,
    expiresInSeconds:
      typeof body.expiresInSeconds === "number" ? body.expiresInSeconds : 3600,
    dashboardUrl:
      typeof body.dashboardUrl === "string" && body.dashboardUrl.trim()
        ? body.dashboardUrl.trim().replace(/\/$/, "")
        : null,
    callbackPath:
      typeof body.callbackPath === "string" &&
      body.callbackPath.startsWith("/")
        ? body.callbackPath
        : "/auth/callback",
  };
}

/** The dashboard URL that redeems this handoff, or null if none is configured. */
export function buildHandoffUrl(response: HandoffResponse): string | null {
  if (!response.dashboardUrl) {
    return null;
  }
  return `${response.dashboardUrl}${response.callbackPath}#${HANDOFF_FRAGMENT_KEY}=${encodeURIComponent(
    response.customToken,
  )}`;
}
