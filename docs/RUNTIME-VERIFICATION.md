# Runtime verification checklist

Complete before tranche 3. Record the exact resolved values in this file.

Rule: no implementation may hardcode an unverified model, package or endpoint.
Until a row is confirmed, the adapter must fail closed rather than guess.

| Item | To confirm | Recorded value | State |
| --- | --- | --- | --- |
| Gemini model IDs | Available fast and strong model identifiers on the regional Vertex AI endpoint | `gemini-2.5-flash` (fast), `gemini-2.5-pro` (strong) | Confirmed |
| Vertex endpoint | `us-central1` regional host and required IAM role | `us-central1-aiplatform.googleapis.com`, `roles/aiplatform.user` | Confirmed |
| ADK package | Supported TypeScript/HTTP path and version | `@google/genai` TypeScript SDK, server-side routes only | **Unresolved — see note 2** |
| Parallel SDK | Package name, version, auth header, rate limits | REST `https://api.parallel.ai/v1/search`, header `x-api-key`, 30 req/min | Confirmed |
| Parallel spend cap | Provider-side financial ceiling configured | $10.00 hard stop per run, $5.00 soft pause, usage ledger logged | Confirmed — see note 3 |
| Grafana MCP | Server URL, auth method, allowlisted tool names | None. Currently OpenTelemetry gRPC to Cloud Run logs with a content-free filter. | **Unresolved — see note 4** |
| Cloud Run Jobs | Max timeout and checkpoint-safe termination signal | 600s timeout, SIGTERM handler checkpoints entity state to Firestore | Confirmed — see note 1 |
| Cloud Tasks | OIDC target configuration for the coordinator | Service account OIDC token invoking `/api/worker/clearance` | Confirmed |
| Firebase Admin | Token verification and custom claim strategy | Admin SDK `verifyIdToken()`, claims `{ role: 'PRODUCER' \| 'REVIEWER' \| 'OWNER' }` | Confirmed — see note 5 |

## Notes

1. **Job timeout corrected to 600s.** An earlier revision of this file recorded
   `3600s`, which is six times the frozen ten-minute maximum run duration and
   would silently break the cost model. The frozen ceiling governs; if a longer
   timeout is genuinely required, amend the product specification and the cost
   model first.

2. **ADK versus `@google/genai` is an open decision.** ADR-0004 specifies a
   Google ADK root orchestrator with three specialists, and both the README and
   the competition track description advertise that topology. The bare
   `@google/genai` SDK is not ADK and abandons that topology. Resolve by either
   adopting ADK or superseding ADR-0004 and correcting the README. Do not leave
   the code and the advertised architecture in disagreement.

3. **Spend caps are not yet in the cost model.** The $10 hard stop and $5 soft
   pause do not appear in the frozen cost model, which is denominated against
   the $100 Google Cloud credit. Record them there so the two documents agree.
   Enforcement must be server-side; `budgetUsed` is not client-writable, see
   `firestore.rules`.

4. **Grafana Cloud MCP is still unverified.** The recorded value describes
   OpenTelemetry to Cloud Run logs, which is a different thing and does not
   answer the question asked. No OpenTelemetry instrumentation exists in the
   codebase yet either. Until the server URL, auth method and allowlisted tool
   names are confirmed, remove Grafana Cloud MCP from the README stack table or
   mark it as planned.

5. **Region is single, not dual.** An earlier revision recorded both
   `europe-west1` and `us-central1`. The frozen decision, the Terraform, and the
   deploy workflow all specify `us-central1` only, and the product operates
   under US jurisdiction exclusively. Running inference in `europe-west1` would
   contradict both the residency posture and the jurisdiction scope, which is
   also enforced in `firestore.rules`.
