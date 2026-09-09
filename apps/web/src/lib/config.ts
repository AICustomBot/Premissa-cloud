/**
 * Product UI runtime configuration.
 *
 * The Firebase web config (apiKey, authDomain, projectId, appId) is a public
 * client identifier, not a secret: every browser that loads any Firebase app
 * receives it. It is nonetheless fetched at runtime rather than inlined at
 * build time, for the same reason as the operator console -- the container
 * build fails if anything matching `AIza[0-9A-Za-z_-]{30,}` appears in the
 * built output, and Gemini API keys share that prefix. Keeping the config out
 * of the bundle leaves that guard intact as the last line of defence for a
 * genuine secret.
 *
 * `next dev` serves /api/config from the same process, so local development
 * uses the identical path. The NEXT_PUBLIC_* values remain only as a fallback
 * for a static export, where no server route exists.
 */

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
};

export type WebConfig = {
  /** Origin plus version prefix, e.g. https://host/v1. No trailing slash. */
  apiBaseUrl: string;
  /** Null when sign-in cannot be offered. */
  firebase: FirebaseWebConfig | null;
  /** Why sign-in is unavailable, if it is. */
  configError: string | null;
};

const RUNTIME_CONFIG_PATH = "/api/config";

const REQUIRED_FIELDS = ["apiKey", "authDomain", "projectId", "appId"] as const;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

/**
 * Accept a candidate config only if every required field is a non-empty
 * string. A half-populated config produces confusing SDK errors much later,
 * far from the missing value that caused them.
 */
export function coerceFirebaseConfig(raw: unknown): FirebaseWebConfig | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const source = raw as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    const value = source[field];
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }
  }
  const messagingSenderId = source.messagingSenderId;
  const config: FirebaseWebConfig = {
    apiKey: (source.apiKey as string).trim(),
    authDomain: (source.authDomain as string).trim(),
    projectId: (source.projectId as string).trim(),
    appId: (source.appId as string).trim(),
  };
  if (typeof messagingSenderId === "string" && messagingSenderId.trim()) {
    config.messagingSenderId = messagingSenderId.trim();
  }
  return config;
}

export function parseJsonEnv(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function loadWebConfig(): Promise<WebConfig> {
  let apiBaseUrl = stripTrailingSlash(
    (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim(),
  );
  let firebase = coerceFirebaseConfig(
    parseJsonEnv(process.env.NEXT_PUBLIC_FIREBASE_WEB_CONFIG),
  );
  let configError: string | null = null;

  try {
    const response = await fetch(RUNTIME_CONFIG_PATH, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (response.ok) {
      const body = (await response.json()) as {
        apiBaseUrl?: unknown;
        firebase?: unknown;
        configError?: unknown;
      };
      if (typeof body.apiBaseUrl === "string" && body.apiBaseUrl.trim()) {
        apiBaseUrl = stripTrailingSlash(body.apiBaseUrl.trim());
      }
      const runtimeFirebase = coerceFirebaseConfig(body.firebase);
      if (runtimeFirebase) {
        firebase = runtimeFirebase;
      } else if (typeof body.configError === "string") {
        configError = body.configError;
      }
    }
  } catch {
    // A static export has no /api/config. The NEXT_PUBLIC_* fallback above
    // already applies, and the missing-config branch below reports it.
  }

  if (!firebase) {
    configError =
      configError ??
      "Firebase web configuration is unavailable, so sign-in is disabled.";
  } else {
    configError = null;
  }

  if (!apiBaseUrl) {
    configError =
      configError ??
      "The PERMISSA API base URL is not configured, so no data can be loaded.";
  }

  return { apiBaseUrl, firebase, configError };
}
