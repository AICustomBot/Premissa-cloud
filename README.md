# PERMISSA

Evidence-gated screenplay clearance research for film and television.

PERMISSA produces research support. It does not produce legal advice, legal
opinions, clearance certification, or insurer/studio approval.

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js, React, TypeScript, Vercel (`apps/web`) |
| Operator console | Vite + React, publishable from Google AI Studio (`studio/`) |
| API | NestJS, TypeScript, Cloud Run (`apps/api`) |
| Workers | Cloud Run Jobs (parser, clearance) admitted via Cloud Tasks (`apps/worker`) |
| Model | Gemini via Vertex AI, `us-central1` |
| Agents | Google ADK root orchestrator plus three specialists |
| Research | Parallel Search API (runtime, mandatory) |
| Observability | OpenTelemetry with Grafana Cloud MCP |
| Data | Firestore, Cloud Storage, Secret Manager |
| Infra | Terraform (`infra/terraform`) |

## Status

Under active implementation. The specification set is frozen. The API, web app
and worker have substantial code; several subsystems are not production-ready.
See `docs/AI-STUDIO-PUBLISHING.md` for the current list of blocking follow-ups,
the most significant being that API state is not yet durably persisted.

## Commands

This is an npm workspaces monorepo driven by Turborepo. `packageManager` is
pinned to `npm@10.8.2`; do not use pnpm or yarn.

```bash
npm install              # install all workspaces

npm run dev              # operator console (Vite) on :3001
npm run dev:web          # Next.js product surface on :3000

npm run build            # build the AI Studio console -> dist/
npm run build:web        # build the Next.js app

npm run lint             # prettier --check across workspaces
npm run typecheck        # tsc --noEmit across workspaces
npm test                 # vitest across workspaces
npm run e2e              # Playwright, apps/web

npm run contracts:generate   # regenerate JSON Schema from Zod contracts
npm run contracts:check      # fail if generated contracts are stale
```

Security rules are verified against the Firestore emulator. This requires Java
and the Firebase CLI:

```bash
firebase emulators:exec --only firestore,auth --project permissa-rules-test \
  "npm run test --workspace=@permissa/security-rules"
```

## Layout

```
index.html, studio/     AI Studio publish surface (operator console)
apps/web                Next.js product surface
apps/api                NestJS API
apps/worker             Parser and clearance jobs
packages/contracts      Zod contracts, source of truth for API shapes
packages/policy         Evidence gate, confidence, version policy
packages/security-rules Firestore rules tests (the Dirty Dozen payloads)
docs/                   Specifications, ADRs, generated API reference
infra/terraform         Infrastructure as code
infra/firestore         Firestore indexes
tests/fixtures          Golden screenplay and expected oracle
```

## Authority order

When documents disagree, resolve in this order, per `AGENTS.md`:

1. `docs/DOCUMENTATION-INDEX.md`
2. `docs/PRODUCT-SPEC.md`
3. `packages/contracts` and the generated `docs/api/*`
4. ADRs in `docs/decisions/`
5. Subsystem specifications
6. Code and tests

## Security

`security_spec.md` defines seven invariants and twelve threat payloads that
must be denied. `packages/security-rules` executes them against the emulator in
CI. Report vulnerabilities per `SECURITY.md`.

The API authenticates with Firebase Admin, which bypasses Firestore rules by
design, so API-side authorization is the real control. `PERMISSA_ALLOW_DEV_TOKENS`
accepts unverified developer tokens and must never be enabled on a deployment
holding real tenant data.

## Licence

AGPL-3.0-only.
