/**
 * Minimal API client for the PERMISSA operator console.
 *
 * Every call targets the deployed PERMISSA API. Nothing is computed locally:
 * clearance status, confidence and the evidence gate are server concerns, and
 * AGENTS.md forbids model-assigned status or client-side status derivation.
 *
 * The base URL is supplied at boot by studio/config.ts, which prefers the
 * runtime value served by server.js over the build-time one.
 */

let apiBaseUrl = "";

export function configureApi(baseUrl: string): void {
  apiBaseUrl = baseUrl.replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  token?: string,
  init?: RequestInit,
): Promise<T> {
  if (!apiBaseUrl) {
    throw new ApiError(
      "The API base URL is not configured. Set PERMISSA_API_BASE_URL on the console service, or VITE_API_BASE_URL for local development.",
    );
  }

  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  } catch (err: unknown) {
    // A network-level failure here is usually CORS or a private Cloud Run
    // service, not a bad token. Say so rather than guessing.
    throw new ApiError(
      `Could not reach ${apiBaseUrl}. Check that the API is deployed, publicly reachable, and permits this origin via CORS. (${
        err instanceof Error ? err.message : "network error"
      })`,
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError(
        "The API rejected this identity (401 AUTH_REQUIRED). Sign out and sign in again to obtain a fresh token.",
        401,
      );
    }
    if (response.status === 403) {
      throw new ApiError(
        "Authenticated, but not authorised for this resource (403 FORBIDDEN). This identity may be missing its role or organisation claim.",
        403,
      );
    }
    throw new ApiError(
      `API returned ${response.status} ${response.statusText}.`,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type HealthResult = Record<string, unknown>;

export function getHealth(): Promise<HealthResult> {
  return request<HealthResult>("/health");
}

/** Mirrors the API's project shape loosely; the console only displays fields. */
export type ProjectSummary = {
  id: string;
  title?: string;
  jurisdiction?: string;
  createdAt?: string;
  version?: number;
};

export type ProjectListResult = {
  items: ProjectSummary[];
  page?: { nextCursor: string | null; hasMore: boolean };
};

export function listProjects(token: string): Promise<ProjectListResult> {
  return request<ProjectListResult>("/projects", token);
}
