# Deployment runbook

Canonical target, frozen:

| | |
|---|---|
| GCP project | `aicustombot` |
| Region | `us-central1` |
| Firestore database | confirm with `gcloud firestore databases list` |

Anything deployed to `elkhedr` or `us-west1` is drift and should be deleted
once migrated.

---

## 1. Rotate the exposed credentials (do this first)

Three secrets were set as literal Cloud Run env values and are therefore in
Cloud Audit Logs, which cannot be redacted. Treat all three as public.

| Variable | Where to rotate |
|---|---|
| `GEMINI_API_KEY` | AI Studio / Google Cloud API credentials |
| `PARALLEL_API_KEY` | Parallel dashboard |
| `GRAFANA_MCP_TOKEN` | Grafana Cloud access policies |

After rotating, store each in Secret Manager and reference it, rather than
pasting the value into the service spec:

```bash
gcloud secrets create gemini-api-key --project aicustombot --replication-policy automatic
printf '%s' 'NEW_KEY' | gcloud secrets versions add gemini-api-key --project aicustombot --data-file=-
```

Then attach with `--set-secrets GEMINI_API_KEY=gemini-api-key:latest`.

`AGENTS.md` prohibits secrets in source, CI logs, job args and client bundles.
Literal env values on a service spec are job args.

---

## 2. Correct the environment variables

| Problem | Fix |
|---|---|
| `NOD_ENV` is a typo | Delete it; set `NODE_ENV=production` |
| `NODE_ENV` unset re-enables dev tokens | Also set `PERMISSA_ALLOW_DEV_TOKENS=false` |
| No Firestore project id | Set `FIRESTORE_PROJECT_ID=aicustombot` |
| Silent in-memory fallback | Set `PERMISSA_REQUIRE_DURABLE_STORE=true` |
| Unused Cloud SQL var | Delete `SQL_DB_NAME` |
| Cost cap disagrees with spec | `RUN_COST_CAP_USD=10.00`, not `1.00` |

Why the dev-token point matters: `AuthService` enables the
`dev-token:uid:email:role:orgId` path whenever `NODE_ENV !== "production"`.
With the variable misspelled, a caller can present
`Authorization: Bearer dev-token:x:x@y.com:OWNER:any-org` and be treated as a
full owner of any tenant.

---

## 3. Confirm which Firestore database is real

```bash
gcloud firestore databases list --project aicustombot
```

- If the only entry is `(default)`, leave `firebase.json` and
  `FIRESTORE_DATABASE_ID` alone.
- If an `ai-studio-permissa-*` database is listed and the client config points
  at it, set `FIRESTORE_DATABASE_ID` to that id **and** add the matching
  `database` key to `firebase.json`, or `firebase deploy` will keep writing
  rules to `(default)` while the app reads a different database.

Multi-database form:

```json
"firestore": [
  {
    "database": "ai-studio-permissa-...",
    "rules": "firestore.rules",
    "indexes": "infra/firestore/firestore.indexes.json"
  }
]
```

---

## 4. Deploy rules and indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes --project aicustombot
```

Known limitation: `firestore.rules` currently governs `users/{uid}` and
`projects/{id}/entities`, which the API does not use, and denies `grants`,
`scripts`, `runs` and `runs/{runId}/findings`, which it does. Browser reads of
real collections will fail until the rules are rewritten against the actual
collection map. This is tracked and not fixed by this runbook.

---

## Known follow-ups

- No `package-lock.json`. CI runs `npm install` as a stopgap; run `npm install`
  locally, commit the lockfile, and restore `npm ci`.
- Entity, script, finding, citation, usage-ledger, invitation and report reads
  are in-memory only.
- `apps/worker` pins `@google/genai: "*"` and `parallel-web: ^0.1.0`, neither
  version-verified.
- `apps/api` is missing `@nestjs/cli`, `reflect-metadata`, `rxjs` and
  `nest-cli.json`.
- Branch protection on `main` is not enabled.
