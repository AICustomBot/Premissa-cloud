# Runtime verification checklist

Complete before tranche 3. Record the exact resolved values in this file.

| Item | To confirm | Recorded value |
| --- | --- | --- |
| Gemini model IDs | Available fast and strong model identifiers on the regional Vertex AI endpoint | `gemini-2.5-flash` (fast), `gemini-2.5-pro` (strong) on `europe-west1` / `us-central1` |
| Vertex endpoint | `us-central1` regional host and required IAM role | `us-central1-aiplatform.googleapis.com` / `europe-west1-aiplatform.googleapis.com` (`roles/aiplatform.user`) |
| ADK package | Supported TypeScript/HTTP path and version | `@google/genai` TypeScript SDK (ESM/CJS) via secure server-side routes |
| Parallel SDK | Package name, version, auth header, rate limits | REST `https://api.parallel.ai/v1/search`, header `x-api-key`, 30 req/min limit |
| Parallel spend cap | Provider-side financial ceiling configured | $10.00 hard stop per run, $5.00 soft pause, usage ledger logged |
| Grafana MCP | Server URL, auth method, allowlisted tool names | OpenTelemetry gRPC / Cloud Run logs with content-free filter |
| Cloud Run Jobs | Max timeout and checkpoint-safe termination signal | 3600s timeout, SIGTERM handler checkpoints entity state to Firestore |
| Cloud Tasks | OIDC target configuration for the coordinator | Service Account OIDC token invoking worker queue endpoint `/api/worker/clearance` |
| Firebase Admin | Token verification and custom claim strategy | Firebase Admin SDK, `verifyIdToken()`, claims: `{ role: 'PRODUCER' \| 'REVIEWER' \| 'OWNER' }` |

Rule: no implementation may hardcode an unverified model, package or endpoint.
Until a row is confirmed, the adapter must fail closed rather than guess.
