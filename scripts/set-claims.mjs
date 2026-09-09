#!/usr/bin/env node
/**
 * Grant a console operator their PERMISSA role and organisation.
 *
 * The API reads authorisation from the `role` and `orgId` custom claims on the
 * Firebase ID token (see apps/api/src/auth/auth.service.ts). A user created by
 * Google sign-in has neither, so the API treats them as a PRODUCER with no
 * organisation until this script runs.
 *
 * Authentication uses Application Default Credentials. No service account key
 * is downloaded, created, or read:
 *
 *   gcloud auth application-default login
 *   npm run claims:set -- --email you@example.com --role OWNER --org org-elkhedr
 *
 * Custom claims are only present in newly issued tokens, so the operator must
 * sign out and sign in again afterwards.
 */
import admin from "firebase-admin"

const VALID_ROLES = new Set(["OWNER", "PRODUCER", "REVIEWER"])

function parseArgs(argv) {
	const args = {}
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i]
		if (!token.startsWith("--")) {
			continue
		}
		const key = token.slice(2)
		const next = argv[i + 1]
		if (next === undefined || next.startsWith("--")) {
			args[key] = "true"
			continue
		}
		args[key] = next
		i += 1
	}
	return args
}

function usage(message) {
	console.error(message)
	console.error("")
	console.error(
		"Usage: npm run claims:set -- --email <address> --role <OWNER|PRODUCER|REVIEWER> --org <orgId> [--project <projectId>]",
	)
	process.exit(1)
}

const args = parseArgs(process.argv.slice(2))

if (!args.email) {
	usage("--email is required.")
}
if (!args.role || !VALID_ROLES.has(args.role)) {
	usage("--role must be one of OWNER, PRODUCER, REVIEWER.")
}
if (!args.org) {
	usage("--org is required. It must match the organisation the API expects.")
}

const projectId =
	args.project ??
	process.env.FIREBASE_PROJECT_ID ??
	process.env.GOOGLE_CLOUD_PROJECT ??
	process.env.GCLOUD_PROJECT

if (!projectId) {
	usage(
		"No project id. Pass --project or set GOOGLE_CLOUD_PROJECT / FIREBASE_PROJECT_ID.",
	)
}

admin.initializeApp({ projectId })

try {
	const user = await admin.auth().getUserByEmail(args.email)

	// Merge rather than replace: setCustomUserClaims overwrites the whole claim
	// object, so replacing it wholesale would silently drop any other claim.
	const existing = user.customClaims ?? {}
	const claims = { ...existing, role: args.role, orgId: args.org }

	await admin.auth().setCustomUserClaims(user.uid, claims)

	console.log(`Project:  ${projectId}`)
	console.log(`User:     ${user.email} (${user.uid})`)
	console.log(`Claims:   ${JSON.stringify(claims)}`)
	console.log("")
	console.log(
		"Done. Sign out and sign in again in the console: custom claims only " +
			"appear in newly issued ID tokens, so the current session still carries " +
			"the old ones.",
	)
} catch (err) {
	if (err && err.code === "auth/user-not-found") {
		console.error(
			`No Firebase user with email ${args.email} in project ${projectId}. ` +
				"Sign in to the console with Google once to create the account, then " +
				"re-run this command.",
		)
	} else {
		console.error(
			`Failed to set claims: ${err instanceof Error ? err.message : String(err)}`,
		)
	}
	process.exit(1)
}
