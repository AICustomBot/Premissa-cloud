/**
 * Minimal API client for the AI Studio operator console.
 *
 * Every call targets the deployed PERMISSA API. Nothing is computed locally:
 * clearance status, confidence and the evidence gate are server concerns, and
 * AGENTS.md forbids model-assigned status or client-side status derivation.
 */

export const API_BASE_URL: string = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""
).replace(/\/$/, "");

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
  if (!API_BASE_URL) {
    throw new ApiError(
      "VITE_API_BASE_URL is not configured. Set it in the AI Studio environment settings to the deployed API origin.",
    );
  }

  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch (err: unknown) {
    // A network-level failure here is usually CORS or a private Cloud Run
    // service, not a bad token. Say so rather than guessing.
    throw new ApiError(
      `Could not reach ${API_BASE_URL}. Check that the API is deployed, publicly reachable, and permits this origin via CORS. (${
        err instanceof Error ? err.message : "network error"
      })`,
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError(
        "Rejected by the API (401 AUTH_REQUIRED). Supply a valid Firebase ID token.",
        401,
      );
    }
    if (response.status === 403) {
      throw new ApiError(
        "Authenticated, but not authorised for this resource (403 FORBIDDEN).",
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
