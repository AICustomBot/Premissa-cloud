import { NextResponse } from "next/server";

/**
 * Runtime client configuration for the dashboard (GET /config.json).
 *
 * The dashboard mirrors the operator console: the Firebase web config and the
 * API origin are public by construction, but they are served at runtime from
 * PERMISSA_* environment variables instead of being baked into the bundle.
 * Dockerfile.web fails the build if anything AIza-prefixed lands in
 * .next/static -- the guard that stops a Gemini key reaching a public URL,
 * since Gemini keys share that prefix -- so this endpoint is how the browser
 * receives its config.
 */

export const dynamic = "force-dynamic";

// Allowlist, not a passthrough. Echoing the whole environment value would
// turn a deployment mistake into a public credential leak; only these fields
// can ever leave this process.
const PUBLIC_FIREBASE_FIELDS = [
  "apiKey",
  "authDomain",
  "projectId",
  "appId",
  "messagingSenderId",
] as const;

const REQUIRED_FIREBASE_FIELDS = [
  "apiKey",
  "authDomain",
  "projectId",
  "appId",
] as const;

function buildFirebasePayload(): {
  firebase: Record<string, string> | null;
  configError: string | null;
} {
  const raw = (process.env.PERMISSA_FIREBASE_WEB_CONFIG ?? "").trim();

  if (!raw) {
    return {
      firebase: null,
      configError:
        "PERMISSA_FIREBASE_WEB_CONFIG is not set on this service, so sign-in is disabled.",
    };
  }

  // Refuse rather than serve. If a service account key is ever pasted into
  // this variable by mistake, it must not reach a browser.
  if (/BEGIN [A-Z ]*PRIVATE KEY/.test(raw)) {
    console.error(
      "PERMISSA_FIREBASE_WEB_CONFIG contains private key material. Refusing to serve it.",
    );
    return {
      firebase: null,
      configError: "The dashboard configuration is invalid and was not served.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      firebase: null,
      configError: "PERMISSA_FIREBASE_WEB_CONFIG is not valid JSON.",
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      firebase: null,
      configError: "PERMISSA_FIREBASE_WEB_CONFIG is not a JSON object.",
    };
  }

  const source = parsed as Record<string, unknown>;
  const firebase: Record<string, string> = {};
  for (const field of PUBLIC_FIREBASE_FIELDS) {
    const value = source[field];
    if (typeof value === "string" && value.trim()) {
      firebase[field] = value.trim();
    }
  }

  const missing = REQUIRED_FIREBASE_FIELDS.filter((field) => !firebase[field]);
  if (missing.length > 0) {
    return {
      firebase: null,
      configError:
        "PERMISSA_FIREBASE_WEB_CONFIG is missing: " + missing.join(", "),
    };
  }

  // The named production database (premissadb) is chosen server-side; the
  // client only needs the id, never a connection string or credential.
  const firestoreDatabaseId = (
    process.env.PERMISSA_FIRESTORE_DATABASE_ID ?? ""
  ).trim();
  if (firestoreDatabaseId) {
    firebase.firestoreDatabaseId = firestoreDatabaseId;
  }

  return { firebase, configError: null };
}

export async function GET() {
  const apiBaseUrl = (process.env.PERMISSA_API_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const consoleUrl = (process.env.PERMISSA_CONSOLE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const { firebase, configError } = buildFirebasePayload();

  return NextResponse.json(
    {
      apiBaseUrl,
      consoleUrl: consoleUrl || null,
      firebase,
      configError,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
