# Deployment runbook

Canonical target, frozen:

| | |
|---|---|
| GCP project | `aicustombot` |
| Region | `us-central1` |
| Firestore database | `premissadb` (confirmed) |

Anything deployed to `elkhedr` or `us-west1` is drift and should be deleted
once migrated.

---

## Secret placement rule

There is exactly one rule, and it resolves most of the AI Studio questions:

> **The operator console needs no secrets. The API and workers need all of
> them. Never let the two swap places.**

| Component | Deploys via | Secrets | Mechanism |
|---|---|---|---|
| Operator console (`index.html`, `studio/`, `server.js`) | AI Studio | none | `VITE_API_BASE_URL` only, build time |
| API (`apps/api`) | `deploy.yml` -> Cloud Run | Gemini, Parallel, Grafana | Secret Manager references |
| Workers (`apps/worker`) | `deploy.yml` -> Cloud Run Jobs | Gemini, Parallel | Secret Manager references |

Anything set as a literal `value:` on a Cloud Run service spec is recorded in
Cloud Audit Logs, which cannot be redacted or purged. A Secret Manager
reference records only the secret's *name*, never its contents. That is the
whole difference, and it is why the console must stay secret-free rather than
relying on the deploy surface to protect anything.

`AGENTS.md` prohibits secrets in source, CI logs, job args and client bundles.
A literal env value on a service spec is a job arg. A Vite variable is a
client bundle.

---

## 1. Rotate the exposed credentials -- DONE

`GEMINI_API_KEY`, `PARALLEL_API_KEY` and `GRAFANA_MCP_TOKEN` were set as
literal env values and are therefore permanently in Cloud Audit Logs. All
three have been rotated.

Rotation locations, for future reference:

| Variable | Where |
|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `PARALLEL_API_KEY` | Parallel dashboard -> API Keys |
| `GRAFANA_MCP_TOKEN` | Grafana Cloud -> Administration -> Service accounts |

## 2. Move them into Secret Manager -- DONE

```bash
gcloud secrets create gemini-api-key --project aicustombot --replication-policy automatic
printf '%s' 'NEW_KEY' | gcloud secrets versions add gemini-api-key --project aicustombot --data-file=-
```

Use `printf`, not `echo`: a trailing newline becomes part of the secret and
produces 401s that look like a bad key.

Attach on deploy with
`--set-secrets GEMINI_API_KEY=gemini-api-key:latest`.

## 3. Confirm the Firestore database -- DONE

`premissadb`, created alongside `(default)`. Recorded in `firebase.json`,
`.env.example` and `firebase-applet-config.json`.

```bash
gcloud firestore databases list --project aicustombot
```

---

## 4. Deploy rules and indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes --project aicustombot
```

`firebase.json` uses the array form with `"database": "premissadb"`. The
single-object form always targets `(default)` regardless of what the app reads.

Known limitation: `firestore.rules` currently governs `users/{uid}` and
`projects/{id}/entities`, which the API does not use, and denies `grants`,
`scripts`, `runs` and `runs/{runId}/findings`, which it does. Browser reads of
real collections will fail until the rules are rewritten against the actual
collection map.

---

## 5. Verify the deployed service

```bash
gcloud run services describe permissa \
  --project aicustombot --region us-central1 \
  --format='yaml(spec.template.spec.containers[0].env)'
```

Assert all of the following:

- `NODE_ENV=production` is present and `NOD_ENV` is absent.
- No `value:` entry contains a key, token or password. Secrets appear only as
  `valueFrom.secretKeyRef`.
- `FIRESTORE_PROJECT_ID=aicustombot` and `FIRESTORE_DATABASE_ID=premissadb`.
- `SQL_DB_NAME` is absent.

---

## Known follow-ups

- No `package-lock.json`. CI runs `npm install` as a stopgap; run `npm install`
  locally, commit the lockfile, and restore `npm ci`.
- Entity, script, finding, citation, usage-ledger, invitation and report reads
  are in-memory only, so data is lost when the instance scales to zero.
- `apps/worker` pins `@google/genai: "*"` and `parallel-web: ^0.1.0`, neither
  version-verified.
- `apps/api` is missing `@nestjs/cli`, `reflect-metadata`, `rxjs` and
  `nest-cli.json`.
- Branch protection on `main` is not enabled.
- `recaptchaSiteKey` is empty, so App Check is not enforced.
