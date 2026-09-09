# Operator console deployment

The console is deployed to Cloud Run by
`.github/workflows/deploy-console.yml`, using the same mechanism as the API.

| | |
|---|---|
| GCP project | `aicustombot` |
| Region | `us-central1` |
| Cloud Run service | `permissa-console` |
| Runtime service account | `permissa-console@aicustombot.iam.gserviceaccount.com` |
| Image | `${ARTIFACT_REGISTRY}/console:<commit sha>` |
| Secrets | none |

## Why not Google AI Studio

AI Studio was the original publish surface for `studio/`. It was abandoned for
one concrete reason: its managed environment panel injects and pins app-level
variables — including a managed Gemini key and every value it infers from
`.env.example` — and those bindings cannot reliably be removed.

That directly conflicts with `AGENTS.md`, which prohibits secrets in client
bundles. The console needs exactly one value, `VITE_API_BASE_URL`, which is
public by construction because Vite inlines it. A managed secret surface
therefore adds risk and friction while providing nothing.

This is a deployment-surface decision only. Nothing about the console's code,
topology, or trust boundary changed: it remains a static bundle that calls the
deployed API over HTTPS.

## How the API base URL is set

It is never hand-copied. The workflow reads the live service URL:

```bash
gcloud run services describe permissa-api \
  --project aicustombot --region us-central1 \
  --format 'value(status.url)'
```

It then checks `/v1/health`, appends `/v1`, and passes the result as the
`VITE_API_BASE_URL` Docker build arg. A console is never published against an
unresolved, stale, or unhealthy API.

## Prerequisites, once per project

The runtime service account needs no IAM roles. It exists so the console does
not inherit the broad default compute service account.

```bash
gcloud iam service-accounts create permissa-console \
  --project aicustombot \
  --display-name "PERMISSA operator console runtime"

gcloud iam service-accounts add-iam-policy-binding \
  permissa-console@aicustombot.iam.gserviceaccount.com \
  --project aicustombot \
  --member "serviceAccount:permissa-deploy@aicustombot.iam.gserviceaccount.com" \
  --role roles/iam.serviceAccountUser
```

## CORS

The API allows origins from `PERMISSA_ALLOWED_ORIGINS`, set from the
`CONSOLE_ORIGIN` GitHub production variable. After the first console deploy:

```bash
gh variable set CONSOLE_ORIGIN \
  --env production \
  --body "https://permissa-console-....us-central1.run.app"

gh workflow run deploy.yml
```

The console workflow emits a warning whenever `CONSOLE_ORIGIN` does not match
the deployed console origin, so this cannot drift silently.

## Guardrails in the build

- The build fails if `VITE_API_BASE_URL` is empty.
- The build fails if a credential-shaped literal appears in `dist/`.
- The deploy asserts the service spec references no secret.
- `apps/**` and `packages/**` are excluded from the build context, so the
  console cannot import the evidence gate, policy thresholds, or server code.
- The runtime layer contains no `node_modules`; `server.js` uses only Node
  built-ins.

## Known follow-up: authentication

The console still asks an operator to paste a Firebase ID token by hand. That
is adequate for verifying deployment, but it is not the finished sign-in
experience. Still required:

1. Firebase browser authentication with sign-in and sign-out.
2. Automatic ID-token retrieval and refresh.
3. The console origin added to Firebase authorized domains.
4. A reCAPTCHA Enterprise site key and App Check enforcement.
5. API key restriction to the console origin.
