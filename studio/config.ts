/**
 * Console runtime configuration.
 *
 * The Firebase web config (apiKey, authDomain, projectId, appId) is a public
 * client identifier rather than a secret: every browser that loads any Firebase
 * app receives it. It is nonetheless fetched at runtime instead of being baked
 * into the bundle, for one concrete reason -- Dockerfile.console fails the
 * build if anything matching `AIza[0-9A-Za-z_-]{30,}` appears in dist/, and
 * Gemini API keys share that prefix. That guard is the last line of defence for
 * a genuine secret, so it stays intact and the config arrives over HTTP.
 *
 * `vite dev` does not run server.js, so local development falls back to
 * build-time environment variables.
 */

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
};

export type ConsoleConfig = {
  /** Origin plus version prefix, e.g. https://host/v1. No trailing slash. */
  apiBaseUrl: string;
  /** Null when sign-in cannot be offered. */
  firebase: FirebaseWebConfig | null;
  /** Why sign-in is unavailable, if it is. */
  configError: string | null;
};

const RUNTIME_CONFIG_PATH = "/__/config.json";

const REQUIRED_FIELDS = [
  "apiKey",
  "authDomain",
  "projectId",
  "appId",
] as const;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

/**
 * Accept a candidate config only if every required field is a non-empty
 * string. A half-populated config produces confusing SDK errors much later.
 */
function coerceFirebaseConfig(raw: unknown): FirebaseWebConfig | null {
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
  return {
    apiKey: (source.apiKey as string).trim(),
    authDomain: (source.authDomain as string).trim(),
    projectId: (source.projectId as string).trim(),
    appId: (source.appId as string).trim(),
    messagingSenderId:
      typeof messagingSenderId === "string" && messagingSenderId.trim()
        ? messagingSenderId.trim()
        : undefined,
  };
}

function parseJsonEnv(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function loadConsoleConfig(): Promise<ConsoleConfig> {
  // Build-time values: used by `vite dev`, and as a fallback if the runtime
  // endpoint is unavailable.
  let apiBaseUrl = stripTrailingSlash(
    ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").trim(),
  );
  let firebase = coerceFirebaseConfig(
    parseJsonEnv(import.meta.env.VITE_FIREBASE_WEB_CONFIG),
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
    // Expected under `vite dev`, where /__/config.json does not exist. The
    // build-time fallback above already applies.
  }

  if (!firebase) {
    configError =
      configError ??
      "Firebase web configuration is unavailable, so sign-in is disabled.";
  } else {
    configError = null;
  }

  return { apiBaseUrl, firebase, configError };
}
