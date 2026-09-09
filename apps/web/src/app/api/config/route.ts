import { NextResponse } from "next/server";

/**
 * Serves the public client configuration at request time.
 *
 * This exists so the Firebase web config and the API origin are never baked
 * into the client bundle: see the reasoning in src/lib/config.ts. Only the
 * four public Firebase fields (plus the optional sender id) are echoed, so a
 * service-account key or a provider token accidentally placed in the same
 * environment variable cannot be forwarded to a browser.
 */
export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = [
  "apiKey",
  "authDomain",
  "projectId",
  "appId",
  "messagingSenderId",
] as const;

const REQUIRED_FIELDS = ["apiKey", "authDomain", "projectId", "appId"] as const;

function publicFirebaseConfig(
  raw: string | undefined,
): { config: Record<string, string> | null; error: string | null } {
  if (!raw || !raw.trim()) {
    return {
      config: null,
      error:
        "PERMISSA_FIREBASE_WEB_CONFIG is not set on this service, so sign-in is disabled.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      config: null,
      error: "PERMISSA_FIREBASE_WEB_CONFIG is not valid JSON.",
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      config: null,
      error: "PERMISSA_FIREBASE_WEB_CONFIG is not a JSON object.",
    };
  }

  const source = parsed as Record<string, unknown>;
  const config: Record<string, string> = {};
  for (const field of PUBLIC_FIELDS) {
    const value = source[field];
    if (typeof value === "string" && value.trim()) {
      config[field] = value.trim();
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (!config[field]) {
      return {
        config: null,
        error: `PERMISSA_FIREBASE_WEB_CONFIG is missing ${field}.`,
      };
    }
  }

  return { config, error: null };
}

export async function GET() {
  const apiBaseUrl = (process.env.PERMISSA_API_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const { config, error } = publicFirebaseConfig(
    process.env.PERMISSA_FIREBASE_WEB_CONFIG,
  );

  return NextResponse.json(
    {
      apiBaseUrl,
      firebase: config,
      configError: error,
    },
    {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}
