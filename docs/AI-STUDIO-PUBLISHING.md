# Publishing from Google AI Studio — superseded

**The console is no longer published from Google AI Studio.** It is deployed to
Cloud Run by `.github/workflows/deploy-console.yml`. See
[CONSOLE-DEPLOYMENT.md](./CONSOLE-DEPLOYMENT.md).

## Why this was abandoned

AI Studio's managed environment panel injects and pins app-level variables that
cannot reliably be removed. It infers them from `.env.example`, so it offered
to attach backend values — including a managed Gemini key, Firebase Admin
credentials, storage buckets, and the frozen policy caps — to a static browser
bundle.

`AGENTS.md` prohibits secrets in client bundles. The console needs exactly one
value, `VITE_API_BASE_URL`, and Vite inlines it into the bundle, so it is
public by construction and is not a secret at all. A managed secret surface
thus added risk and blocked publishing while providing no benefit.

The frozen deployment target is unchanged: project `aicustombot`, region
`us-central1`, Firestore database `premissadb`. AI Studio had also created
services in the wrong project (`elkhedr`, `us-west1`), which is drift.

## What still holds from the original note

- `apps/api` (Cloud Run), `apps/worker` (Cloud Run Jobs), `infra/terraform`,
  and Firestore rules and indexes were never publishable from AI Studio and
  still are not. They deploy through their own workflows.
- No Gemini key in the console. `metadata.json` keeps
  `majorCapabilities: []`. Gemini stays behind the API.
- No clearance logic in the browser. The console renders what the API returns
  and never derives status or confidence.
- No token persistence. The bearer token lives in React state only.
- Never set `PERMISSA_ALLOW_DEV_TOKENS=true` on a deployment reachable from a
  published page.
