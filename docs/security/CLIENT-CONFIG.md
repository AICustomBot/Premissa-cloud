# Client Firebase configuration

## Where it lives

Nothing. There is no client Firebase config in this repository, and
`.gitignore` blocks one from being added back.

The single source is the **`FIREBASE_WEB_CONFIG` repository variable**, holding
the public web config JSON for the `aicustombot` Firebase project. From there:

| Stage | What happens |
|---|---|
| Deploy | `deploy-console.yml` and `deploy-web.yml` read the variable, reduce it with `jq` to `apiKey`, `authDomain`, `projectId`, `appId`, `messagingSenderId`, and reject it if a field is missing, if it is not valid JSON, if it contains a semicolon, or if it contains PEM material |
| Runtime | The reduced JSON is set as `PERMISSA_FIREBASE_WEB_CONFIG` on both Cloud Run services |
| Browser | The console serves it from `/__/config.json`; the dashboard serves it from `/api/config` |
| Verification | Each deploy curls its own config endpoint and fails if `apiKey`, `authDomain`, `projectId` or `appId` is absent |

The console and the dashboard **must** resolve to the same `projectId`. A
custom token minted by `POST /v1/auth/handoff` for one project is rejected on
redemption by the other with `auth/custom-token-mismatch`.

## Why it is fetched rather than compiled in

A Firebase web API key is a client identifier, not an authorisation: every
browser that loads any Firebase app receives it. Keeping it out of the bundle
is therefore not about hiding it. It is about one concrete guard.

`Dockerfile.console` and `Dockerfile.web` both fail the build if anything
matching `AIza[0-9A-Za-z_-]{30,}` appears in the built output. Gemini API keys
share the `AIza` prefix, so that grep is the last thing standing between a
genuine secret and a public URL. Inlining the Firebase key would force the
guard to be weakened or removed. Serving the config over HTTP keeps it intact
and lets the Firebase app change without a rebuild.

Build `0c9a93f9-04e9-440b-9fc4-d28e14388096` is the recorded instance of this:
`apps/web/src/lib/firebase.ts` imported the tracked JSON, Next inlined the key
into the `/` chunk, and the gate correctly failed the build.

## What actually protects the project

An API key is an identifier, not an authorisation. Safety rests on three other
controls.

1. **Firestore security rules.** `firestore.rules` is the real access boundary:
   tenant-scoped and role-partitioned, with the twelve threat payloads in
   `security_spec.md` covered by tests in `packages/security-rules` and run on
   every CI build against the emulator.
2. **Server-side token verification.** Every `/v1` route sits behind
   `AuthGuard`; the API verifies the ID token with Firebase Admin and reads the
   org and role from custom claims. A browser holding the public config still
   has no session.
3. **Authorised domains and key restrictions.** Firebase Authentication only
   completes a sign-in from a listed domain, and the browser key should be
   restricted by HTTP referrer to the production origins.

The third control is partially outstanding — see below.

## Outstanding console actions

These cannot be committed and must be done in the Google Cloud and Firebase
consoles for project `aicustombot` (number `1080010918804`).

- [ ] Apply **HTTP referrer restrictions** to the browser API key, scoped to
      `premissa-login.aicustombot.net`, `premissa-dash.aicustombot.net` and the
      two `*.run.app` origins.
- [ ] Restrict that key to the APIs the client needs — Identity Toolkit, Token
      Service, Firestore — and remove the rest.
- [ ] Register a **reCAPTCHA Enterprise** site key and enable **App Check**,
      enforced for Firestore, Storage and Authentication. Until then the public
      config is a working handle for quota abuse against the production
      project.
- [ ] Confirm all four origins are listed under Firebase Authentication →
      Settings → Authorised domains.

## Environments

Production data lives in the named Firestore database `premissadb` in project
`aicustombot`, recorded in `firebase.json`, `.env.example` and the API's
`FIRESTORE_DATABASE_ID`. The AI Studio scratch database that an earlier
revision of this document described is no longer referenced anywhere.

There is still only one environment. Standing up a separate staging project is
tracked as PRM-P4.3.

## Local development

Export the same JSON the deploy uses:

```bash
export PERMISSA_FIREBASE_WEB_CONFIG="$(gh variable get FIREBASE_WEB_CONFIG \
  --repo AICustomBot/Premissa-cloud)"
```

Do not write it to a file inside the repository.
