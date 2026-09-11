# Secret inventory and rotation policy

## Owner

**Ehab Khedr** (`ehab@aicustombot.net`) owns every entry below: rotation,
verification and the log at the end of this document. There is no second
operator, so there is no handover procedure to write down yet — that gap is
itself a GA risk and belongs with PRM-P5.1.

## Why this exists

`docs/DEPLOYMENT-RUNBOOK.md` records that `GEMINI_API_KEY`, `PARALLEL_API_KEY`
and `GRAFANA_MCP_TOKEN` were once set as **literal environment values** on Cloud
Run. Cloud Audit Logs capture the full request body of a service update and
cannot be edited or purged. Those three values are therefore permanently
readable by anyone holding `roles/logging.viewer` on project `aicustombot`, for
the retention life of the log.

There is no remediation other than rotation. Removing the values from the
service spec — already done — changes nothing about the historical record.

## Inventory

| Secret | Consumed by | Storage today | Exposure | Cadence |
|---|---|---|---|---|
| `parallel-api-key` | `permissa-api` (Parallel Search) | Secret Manager, mounted via `--set-secrets` in `deploy.yml` | In audit logs | Rotate now, then every 90 days |
| `gemini-api-key` | `permissa-api` (Gemini specialist) | Secret Manager, mounted via `--set-secrets` in `deploy.yml` | In audit logs | Rotate now, then every 90 days |
| `GRAFANA_MCP_TOKEN` | Nothing. `GRAFANA_MCP_ENABLED=false` and no service spec references it | Unmanaged | In audit logs | Revoke outright; do not reissue until Grafana is actually wired |
| Firebase web config | Console and dashboard browsers | `FIREBASE_WEB_CONFIG` repository variable | Public by design | Not a secret. Restrict by referrer instead — see `CLIENT-CONFIG.md` |
| Workload Identity Federation | GitHub Actions → `permissa-deploy@` | No key material exists | None | Keyless. Review the attribute condition each quarter (PRM-P3.3) |
| Firebase Admin | `permissa-api` runtime | Attached service account, no exported key | None | Keyless. Never create a JSON key for `firebase-adminsdk-fbsvc@` |

The last three rows are the point of the table as much as the first three: the
only long-lived secrets in this system are the two provider keys. Keep it that
way.

## Rotation procedure

Run for each of `parallel-api-key` and `gemini-api-key`. Substitute the secret
name and the provider console.

**1. Issue a new key at the provider.** Parallel: dashboard → API Keys. Gemini:
<https://aistudio.google.com/apikey>. Do not delete the old one yet.

**2. Add it as a new Secret Manager version.** Piping from stdin keeps the
value out of shell history and out of the audit log's request body.

```bash
printf '%s' 'NEW_KEY_VALUE' | gcloud secrets versions add parallel-api-key \
  --project aicustombot --data-file=-
```

If the secret does not exist yet:

```bash
gcloud secrets create parallel-api-key --project aicustombot --replication-policy automatic
```

**3. Grant access to exactly one identity.** The API service account is the
only consumer. The console and dashboard service accounts must have none.

```bash
gcloud secrets add-iam-policy-binding parallel-api-key \
  --project aicustombot \
  --member "serviceAccount:permissa-api@aicustombot.iam.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor
```

Confirm nothing holds a project-wide grant that would bypass this:

```bash
gcloud projects get-iam-policy aicustombot \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/secretmanager" \
  --format="table(bindings.role,bindings.members)"
```

**4. Roll a revision.** The mount is pinned to `:latest`, but a running
revision keeps the version it started with. Re-run **Deploy API**
(`gh workflow run deploy.yml --repo AICustomBot/Premissa-cloud`) or, for an
out-of-band roll:

```bash
gcloud run services update permissa-api --project aicustombot --region us-central1 \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,PARALLEL_API_KEY=parallel-api-key:latest"
```

**5. Verify before revoking.** A run that reaches Parallel proves the new key
is live. `GET /v1/health` does not — it never calls a provider.

**6. Disable the old version, then destroy it.** Disable first: it is
reversible for the few minutes it takes to notice a mistake.

```bash
gcloud secrets versions list parallel-api-key --project aicustombot
gcloud secrets versions disable 1 --secret parallel-api-key --project aicustombot
```

**7. Revoke at the provider.** Delete the old key in the Parallel or AI Studio
console. Until this step, rotation has not actually happened — the exposed
value still works.

**8. Append a row to the log below** and open a follow-up issue if anything in
this procedure was wrong.

## Automated enforcement already in place

These run without anyone remembering to run them. Do not remove them.

- **`ci.yml` → Secret scan.** `gitleaks/gitleaks-action@v2` on every pull
  request and every push to `main`.
- **`deploy.yml` → Assert no plaintext secrets on the service spec.** Fails the
  deploy if the API spec carries a literal matching
  `(API_KEY|TOKEN|SECRET|PASSWORD)=`.
- **`deploy-console.yml` / `deploy-web.yml` → Assert … carries no secrets.**
  Fails if either front-end spec references credential-shaped naming or PEM
  material. Both deploy with `--clear-secrets`.
- **`Dockerfile.console` / `Dockerfile.web` bundle gate.** Fails the image
  build if an `AIza`-prefixed key, a PEM block, or a provider key literal
  reaches the built client output.

## Cadence

| Trigger | Action |
|---|---|
| Every 90 days | Rotate both provider keys. Track as a recurring task; there is no automation for this yet. |
| Suspected exposure, a leaked log, or an operator leaving | Rotate immediately. Do not wait for the window. |
| Any credential appears in a commit, a build log, or an audit log body | Treat as exposed. Rotate, then fix the path that put it there. |
| Each quarter | Re-read the inventory table. A new long-lived secret that is not listed here is a defect. |

## Rotation log

| Date | Secret | Reason | By | Old version disabled | Revoked at provider |
|---|---|---|---|---|---|
| _pending_ | `parallel-api-key` | Cloud Audit Log exposure | Ehab Khedr | ☐ | ☐ |
| _pending_ | `gemini-api-key` | Cloud Audit Log exposure | Ehab Khedr | ☐ | ☐ |
| _pending_ | `GRAFANA_MCP_TOKEN` | Cloud Audit Log exposure; revoke without reissue | Ehab Khedr | n/a | ☐ |
