/**
 * The product UI's only route to server state.
 *
 * apps/web previously read and wrote Firestore straight from the browser.
 * infra/firestore/firestore.rules denies client access by design -- the
 * clearance data model is enforced server-side, in apps/api, where the token
 * is verified and packages/policy runs. Those browser calls therefore fail in
 * any deployed environment, and because each call site logged a warning and
 * carried on, the UI looked healthy while nothing persisted.
 *
 * Only endpoints that apps/api implements today are exposed here. Anything
 * absent server-side is absent from this client rather than stubbed, so a
 * missing capability surfaces as a compile error instead of a plausible-looking
 * screen with no data behind it.
 */

import type { CanonicalEntity, ClearanceRun, Finding } from "@permissa/contracts";

/** RFC 9457 problem details, as returned by the API's exception filter. */
export type ProblemDetails = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  correlationId?: string;
  retryable?: boolean;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    init: {
      status: number;
      code: string;
      correlationId?: string | null;
      retryable?: boolean;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.correlationId = init.correlationId ?? null;
    this.retryable = init.retryable ?? false;
  }
}

/**
 * Turn a failed response into an ApiError.
 *
 * The API's own codes are preferred over HTTP status text: AUTH_REQUIRED and
 * EMAIL_NOT_VERIFIED both arrive as 401, and the UI must tell them apart to
 * show the right next step.
 */
export async function toApiError(response: Response): Promise<ApiError> {
  let problem: ProblemDetails = {};
  try {
    const body = (await response.json()) as unknown;
    if (body && typeof body === "object") {
      problem = body as ProblemDetails;
    }
  } catch {
    // A proxy or the platform can return a non-JSON error page. The status
    // code below is then all the information available.
  }

  const code = problem.code ?? `HTTP_${response.status}`;
  const message =
    problem.detail ??
    problem.title ??
    `The request failed with status ${response.status}.`;

  return new ApiError(message, {
    status: response.status,
    code,
    correlationId: problem.correlationId ?? null,
    retryable: problem.retryable ?? response.status >= 500,
  });
}

/** Join a base URL and a path without producing a double or missing slash. */
export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export type ApiClientOptions = {
  /** Origin plus version prefix, e.g. https://host/v1. */
  baseUrl: string;
  /**
   * Returns a currently valid Firebase ID token, or null when signed out.
   * A function rather than a value: the SDK rotates the token hourly, and a
   * captured string would expire mid-session.
   */
  getToken: () => Promise<string | null>;
};

export type ProjectRecord = {
  id: string;
  organizationId: string;
  title: string;
  jurisdiction: string;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AuditLogRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  actorId: string;
  action: string;
  timestamp: string;
  metadata: Record<string, string | number | boolean>;
};

export type ScriptHistoryEntry = {
  id: string;
  projectId: string;
  versionNumber: number;
  pageCount: number;
  sceneCount: number;
  createdAt: string;
};

export type CreateRunResponse = {
  run: ClearanceRun;
  confirmedEntityCount: number;
  deduplicated: boolean;
};

/**
 * The server researches entities inside the request, bounded by a wall-clock
 * budget, so a run can legitimately return with entities still pending.
 * `resumable` means call executeRun again; the checkpoint prevents repeated
 * work and repeated provider spend.
 */
export type ExecuteRunResponse = {
  runId: string;
  state: ClearanceRun["state"];
  entitiesCompleted: number;
  entitiesPending: number;
  findingsWritten: number;
  statusCounts: Record<string, number>;
  estimatedCostUsd: number;
  providerCallsUsed: number;
  failedEntityCount: number;
  resumable: boolean;
  stopReason:
    | "COMPLETED"
    | "COST_CAP_REACHED"
    | "TIME_BUDGET_REACHED"
    | "ENTITY_CAP_REACHED"
    | "ALL_ENTITIES_FAILED";
};

export function createApiClient(options: ApiClientOptions) {
  const { baseUrl, getToken } = options;

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    if (!baseUrl) {
      throw new ApiError(
        "The PERMISSA API base URL is not configured for this deployment.",
        { status: 0, code: "API_BASE_URL_MISSING" },
      );
    }

    const token = await getToken();
    if (!token) {
      throw new ApiError("Sign in to continue.", {
        status: 401,
        code: "AUTH_REQUIRED",
      });
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    };
    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(joinUrl(baseUrl, path), {
      method: init.method ?? "GET",
      headers,
      cache: "no-store",
      ...(init.body !== undefined
        ? { body: JSON.stringify(init.body) }
        : {}),
    });

    if (!response.ok) {
      throw await toApiError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    // -- projects ---------------------------------------------------------
    listProjects: (limit = 25, cursor?: string) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) {
        params.set("cursor", cursor);
      }
      return request<{
        items: ProjectRecord[];
        page: { nextCursor: string | null; hasMore: boolean };
      }>(`/projects?${params.toString()}`);
    },

    createProject: (input: {
      title: string;
      jurisdiction: string;
      organizationId?: string;
    }) =>
      request<ProjectRecord>("/projects", { method: "POST", body: input }),

    getProject: (projectId: string) =>
      request<ProjectRecord>(`/projects/${projectId}`),

    deleteProject: (projectId: string) =>
      request<{ status: string; message: string }>(`/projects/${projectId}`, {
        method: "DELETE",
      }),

    getAuditLogs: (projectId: string) =>
      request<AuditLogRecord[]>(`/projects/${projectId}/audit`),

    // -- entities ---------------------------------------------------------
    listEntities: (projectId: string, scriptVersionId: string) =>
      request<CanonicalEntity[]>(
        `/projects/${projectId}/scripts/${scriptVersionId}/entities`,
      ),

    patchEntity: (
      projectId: string,
      scriptVersionId: string,
      entityId: string,
      patch: {
        expectedVersion: number;
        canonicalName?: string;
        type?: CanonicalEntity["type"];
        aliases?: string[];
      },
    ) =>
      request<CanonicalEntity>(
        `/projects/${projectId}/scripts/${scriptVersionId}/entities/${entityId}`,
        { method: "PATCH", body: patch },
      ),

    confirmEntities: (
      projectId: string,
      scriptVersionId: string,
      confirmedEntityIds: string[],
    ) =>
      request<{ confirmedCount: number }>(
        `/projects/${projectId}/scripts/${scriptVersionId}/entities/confirm`,
        { method: "POST", body: { confirmedEntityIds } },
      ),

    mergeEntities: (
      projectId: string,
      scriptVersionId: string,
      input: {
        survivorId: string;
        mergedIds: string[];
        expectedVersions: Record<string, number>;
      },
    ) =>
      request<CanonicalEntity>(
        `/projects/${projectId}/scripts/${scriptVersionId}/entities/merge`,
        { method: "POST", body: input },
      ),

    // -- runs -------------------------------------------------------------
    createRun: (
      projectId: string,
      input: { scriptVersionId: string; jurisdiction?: string; idempotencyKey?: string },
    ) =>
      request<CreateRunResponse>(`/projects/${projectId}/runs`, {
        method: "POST",
        body: input,
      }),

    listRuns: (projectId: string) =>
      request<{ projectId: string; total: number; runs: ClearanceRun[] }>(
        `/projects/${projectId}/runs`,
      ),

    getRun: (projectId: string, runId: string) =>
      request<ClearanceRun>(`/projects/${projectId}/runs/${runId}`),

    executeRun: (projectId: string, runId: string) =>
      request<ExecuteRunResponse>(
        `/projects/${projectId}/runs/${runId}/execute`,
        { method: "POST" },
      ),

    // -- research ---------------------------------------------------------
    getFindings: (projectId: string, runId: string) =>
      request<{ runId: string; totalFindings: number; findings: Finding[] }>(
        `/projects/${projectId}/research/runs/${runId}/findings`,
      ),

    getUsageLedger: (projectId: string, runId: string) =>
      request<{
        runId: string;
        totalEntries: number;
        totalCostUsd: number;
        entries: Array<Record<string, unknown>>;
      }>(`/projects/${projectId}/research/runs/${runId}/ledger`),

    // -- review and reports ----------------------------------------------
    requestReview: (projectId: string, runId: string) =>
      request<unknown>(`/projects/${projectId}/reviews/runs/${runId}/request`, {
        method: "POST",
      }),

    approveRun: (projectId: string, runId: string, reason?: string) =>
      request<unknown>(`/projects/${projectId}/reviews/runs/${runId}/approve`, {
        method: "POST",
        body: reason ? { reason } : {},
      }),

    listReports: (projectId: string) =>
      request<{
        projectId: string;
        total: number;
        reports: Array<Record<string, unknown>>;
        fullReports: Array<Record<string, unknown>>;
      }>(`/projects/${projectId}/reports`),

    generateReport: (projectId: string, runId: string) =>
      request<Record<string, unknown>>(
        `/projects/${projectId}/reports/generate/${runId}`,
        { method: "POST" },
      ),

    // -- scripts ----------------------------------------------------------
    getScriptHistory: (projectId: string) =>
      request<ScriptHistoryEntry[]>(`/projects/${projectId}/scripts/history`),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
