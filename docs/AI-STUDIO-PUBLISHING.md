# Publishing from Google AI Studio

## Settings

| Setting | Value |
| --- | --- |
| Install command | `npm install` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 20 or newer |
| Environment variable | `VITE_API_BASE_URL` = origin of the deployed API, e.g. `https://permissa-api-xxxxx.a.run.app` |

`npm run build` runs `vite build` against the root `index.html` and `studio/`,
and writes a static bundle to `dist/`.

## What publishes from AI Studio, and what does not

This is the part worth being precise about, because it is easy to assume more
ships than actually does.

**Publishes:** the operator console in `studio/`. A static single-page app that
talks to the already-deployed PERMISSA API over HTTPS.

**Does not publish:**

- `apps/api` — NestJS on Cloud Run. Deployed by `.github/workflows/deploy.yml`
  via `gcloud builds submit --file apps/api/Dockerfile`.
- `apps/worker` — parser and clearance jobs on Cloud Run Jobs, admitted
  through the Cloud Tasks queue lease in ADR-0007.
- `apps/web` — the Next.js product surface, deployed to Vercel.
- `infra/terraform` — service accounts, buckets, queues, budgets.
- `firestore.rules` and Firestore indexes — deployed with the Firebase CLI.

So AI Studio gives you a publicly reachable front end for a running backend.
It does not turn this repository into a single-click deployment of the whole
product, and it cannot: Cloud Run Jobs, Cloud Tasks, service-account identity
and Terraform have no equivalent in a static publish step.

## Deliberate omissions

**No Gemini API key.** `metadata.json` sets `majorCapabilities: []`. It
previously declared `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`, which asks AI
Studio to provision a Gemini key for the app. `AGENTS.md` prohibits secrets in
client bundles, and a published static page is a client bundle. Gemini stays
behind the API, on Vertex AI in `us-central1`, authenticated with a service
account.

**No clearance logic in the browser.** The console renders what the API
returns. It never derives status or confidence. `AGENTS.md` prohibits
model-assigned status, and the deterministic evidence gate plus the
confidence >= 85 threshold for Research-cleared are server-side controls. If
they ran in the browser a user could edit them.

**No token persistence.** The bearer token lives in React state only. It is
never placed in `localStorage` or `sessionStorage`.

## Prerequisites on the API side

1. **The API must be reachable from the browser.** `deploy.yml` deploys with
   `--no-allow-unauthenticated`, so a published page cannot call it. Either
   put the API behind an authenticated gateway, or allow unauthenticated
   invocation and rely on the Firebase token check in `AuthService`.
2. **CORS must permit the AI Studio origin.**
3. **Do not set `PERMISSA_ALLOW_DEV_TOKENS=true`** on any deployment reachable
   from a published page. That flag accepts unverified `dev-token:` bearer
   tokens and lets the caller choose their own uid, role and organization.

## Known follow-ups

- **Commit a lockfile.** CI currently runs `npm install` rather than `npm ci`
  because no `package-lock.json` exists. Run `npm install` locally, commit the
  result, then restore `npm ci` in `.github/workflows/ci.yml`.
- **Confirm which Firestore database is real.** `firebase.json` deploys rules
  to `(default)`, while `firebase-applet-config.json` points the client at
  `firestoreDatabaseId: "ai-studio-permissa-c6dfc351-..."`. If the latter is
  the live database, the hardened rules are landing on an unused one.
- **Durable persistence.** `apps/api/src/storage/firestore.service.ts` keeps
  authoritative state in in-process `Map`s and treats cloud writes as
  best-effort. Cloud Run scales to zero, so data does not survive. This must
  be resolved before the product can do real work.
- **Enable branch protection on `main`**, set a reCAPTCHA Enterprise site key,
  and enforce App Check.
