# Client Firebase configuration

## What is in the repository

`firebase-applet-config.json` at the repository root holds the public Firebase
web configuration for the `elkhedr` project: `apiKey`, `appId`, `authDomain`,
`projectId`, `messagingSenderId`, `oAuthClientId` and `firestoreDatabaseId`.

These values are **not secrets**. Firebase web API keys are designed to be
shipped in client bundles and are visible to anyone who loads the application.
Removing the file from source control would not make the values private, and
rotating the key is not a meaningful remediation.

## Why it still needs attention

An API key is an identifier, not an authorisation. Its safety depends entirely
on two other controls, and until recently neither was in place:

1. **Security rules.** Before the hardening in `firestore.rules`, any
   authenticated user could enumerate every tenant's projects, entities and
   audit logs. With a public config in hand, obtaining an authenticated session
   is trivial. The rules are the actual access control boundary and are now
   tenant-scoped and role-partitioned, with the twelve threat payloads in
   `security_spec.md` covered by tests in `packages/security-rules`.

2. **App Check.** `recaptchaSiteKey` in the config is empty and App Check is
   not enforced anywhere in the codebase. Without it, the public config is a
   working handle for automated abuse of Firestore, Storage and Authentication
   quotas against the production project — the denial-of-wallet vector that
   invariant 7 and the string-length gates only partially mitigate.

## Required console actions

These cannot be committed to the repository and must be performed in the Google
Cloud and Firebase consoles for project `elkhedr`:

- [ ] Register a **reCAPTCHA Enterprise** site key and populate
      `recaptchaSiteKey`.
- [ ] Enable **App Check** and set it to **enforced** for Firestore, Cloud
      Storage and Authentication.
- [ ] Apply **HTTP referrer restrictions** to the browser API key so it is only
      usable from the production and preview domains.
- [ ] Restrict the key to the specific APIs the client needs (Identity Toolkit,
      Firestore, Storage) and remove all others.
- [ ] Confirm whether this repository is public. The frozen specification places
      the public OSS repository under the `AICustomBot` organisation, not under
      a personal account.

## Separating environments

The recorded `firestoreDatabaseId` is
`ai-studio-permissa-c6dfc351-5d1e-4392-902d-ec4b5d09ea49`, an AI Studio scratch
database. Production data must not live in a scratch database created by a
prototyping tool. Provision a named database through Terraform, point
`.firebaserc` and the client config at it, and keep the scratch database for
local experiments only.

For local overrides, copy the file to `firebase-applet-config.local.json`, which
is git-ignored.
