/**
 * Firestore rules test suite.
 *
 * This is the executable form of the "Dirty Dozen" threat payloads documented
 * in /security_spec.md. Each payload has a test asserting PERMISSION_DENIED,
 * plus positive tests proving the legitimate path still works.
 *
 * Run via the emulator:
 *   firebase emulators:exec --only firestore,auth \
 *     --project permissa-rules-test \
 *     "npm run test --workspace=@permissa/security-rules"
 *
 * When FIRESTORE_EMULATOR_HOST is absent the suite skips rather than fails, so
 * that `npm test` at the repository root stays green without an emulator.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
	type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import {
	doc,
	getDoc,
	getDocs,
	collection,
	setDoc,
	updateDoc,
	deleteDoc,
	serverTimestamp,
} from "firebase/firestore"
import { afterAll, afterEach, beforeAll, describe, it } from "vitest"

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const suite = hasEmulator ? describe : describe.skip

const ORG = "org-alpha"
const OTHER_ORG = "org-beta"

const PRODUCER = "producer-1"
const REVIEWER = "reviewer-1"
const OWNER = "owner-1"
const OUTSIDER = "outsider-1"
const ADMIN = "admin-1"

const PROJECT = "proj-open"
const SEALED_PROJECT = "proj-sealed"
const ENTITY = "ent-1"

suite("PERMISSA Firestore rules", () => {
	let testEnv: RulesTestEnvironment

	beforeAll(async () => {
		testEnv = await initializeTestEnvironment({
			projectId: process.env.GCLOUD_PROJECT ?? "permissa-rules-test",
			firestore: {
				rules: readFileSync(
					resolve(import.meta.dirname, "../../../firestore.rules"),
					"utf8",
				),
			},
		})
	})

	afterAll(async () => {
		await testEnv?.cleanup()
	})

	afterEach(async () => {
		await testEnv.clearFirestore()
	})

	/** Seeds the fixture graph with rules disabled. */
	async function seed() {
		await testEnv.withSecurityRulesDisabled(async (ctx) => {
			const db = ctx.firestore()
			const now = new Date()

			const userProfile = (
				id: string,
				role: string,
				organizationId: string,
			) => ({
				id,
				name: `User ${id}`,
				email: `${id}@example.test`,
				role,
				organizationId,
				createdAt: now,
				updatedAt: now,
			})

			await setDoc(doc(db, "users", PRODUCER), userProfile(PRODUCER, "PRODUCER", ORG))
			await setDoc(doc(db, "users", REVIEWER), userProfile(REVIEWER, "REVIEWER", ORG))
			await setDoc(doc(db, "users", OWNER), userProfile(OWNER, "OWNER", ORG))
			await setDoc(
				doc(db, "users", OUTSIDER),
				userProfile(OUTSIDER, "PRODUCER", OTHER_ORG),
			)
			await setDoc(doc(db, "users", ADMIN), userProfile(ADMIN, "OWNER", ORG))
			await setDoc(doc(db, "admins", ADMIN), { grantedAt: now })

			await setDoc(doc(db, "organizations", ORG), {
				id: ORG,
				name: "Alpha Pictures",
				ownerId: OWNER,
				createdAt: now,
				updatedAt: now,
			})

			const project = (id: string, isRunApproved: boolean) => ({
				id,
				organizationId: ORG,
				title: "The Final Witness",
				jurisdiction: "US",
				createdBy: PRODUCER,
				version: 1,
				isRunApproved,
				budgetUsed: 4.25,
				createdAt: now,
				updatedAt: now,
			})

			await setDoc(doc(db, "projects", PROJECT), project(PROJECT, false))
			await setDoc(doc(db, "projects", SEALED_PROJECT), project(SEALED_PROJECT, true))

			const entity = {
				id: ENTITY,
				projectId: PROJECT,
				canonicalName: "Vertex Cola",
				type: "BRAND_BUSINESS_PRODUCT",
				initialProposedStatus: "INSUFFICIENT_EVIDENCE",
				rationale: "Awaiting research.",
				reviewerNotes: "",
				rewriteSuggestion: "",
				confirmedByProducer: false,
				updatedAt: now,
			}

			await setDoc(doc(db, "projects", PROJECT, "entities", ENTITY), entity)
			await setDoc(doc(db, "projects", SEALED_PROJECT, "entities", ENTITY), {
				...entity,
				projectId: SEALED_PROJECT,
			})

			await setDoc(doc(db, "projects", PROJECT, "auditLogs", "log-1"), {
				id: "log-1",
				organizationId: ORG,
				projectId: PROJECT,
				actorId: PRODUCER,
				action: "RUN_STARTED",
				timestamp: now,
			})
		})
	}

	beforeAll(seed)
	afterEach(seed)

	const as = (uid: string) => testEnv.authenticatedContext(uid).firestore()
	const anon = () => testEnv.unauthenticatedContext().firestore()

	// ------------------------------------------------------------- invariants

	describe("legitimate paths still work", () => {
		it("a producer in the owning org can read the project", async () => {
			await assertSucceeds(getDoc(doc(as(PRODUCER), "projects", PROJECT)))
		})

		it("a producer can confirm an entity", async () => {
			await assertSucceeds(
				updateDoc(doc(as(PRODUCER), "projects", PROJECT, "entities", ENTITY), {
					confirmedByProducer: true,
					updatedAt: serverTimestamp(),
				}),
			)
		})

		it("a reviewer can write status and reviewer notes", async () => {
			await assertSucceeds(
				updateDoc(doc(as(REVIEWER), "projects", PROJECT, "entities", ENTITY), {
					initialProposedStatus: "NEEDS_LICENCE",
					reviewerNotes: "Trademark in class 32; licence required.",
					updatedAt: serverTimestamp(),
				}),
			)
		})

		it("an org owner can seal a run", async () => {
			await assertSucceeds(
				updateDoc(doc(as(OWNER), "projects", PROJECT), {
					isRunApproved: true,
					version: 2,
					updatedAt: serverTimestamp(),
				}),
			)
		})

		it("an org member can read the audit trail", async () => {
			await assertSucceeds(
				getDocs(collection(as(PRODUCER), "projects", PROJECT, "auditLogs")),
			)
		})
	})

	// -------------------------------------------------------- the dirty dozen

	describe("payload 1: identity spoofing / foreign profile hijack", () => {
		it("denies overwriting another user's profile", async () => {
			await assertFails(
				setDoc(doc(as(PRODUCER), "users", REVIEWER), {
					id: REVIEWER,
					name: "Attacker",
					email: "evil@domain.test",
					role: "OWNER",
					organizationId: ORG,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("payload 2: role self-escalation", () => {
		it("denies promoting yourself to OWNER", async () => {
			await assertFails(
				updateDoc(doc(as(PRODUCER), "users", PRODUCER), {
					role: "OWNER",
					updatedAt: serverTimestamp(),
				}),
			)
		})

		it("denies moving yourself into another tenant", async () => {
			await assertFails(
				updateDoc(doc(as(PRODUCER), "users", PRODUCER), {
					organizationId: OTHER_ORG,
					updatedAt: serverTimestamp(),
				}),
			)
		})

		it("still allows a benign display-name change", async () => {
			await assertSucceeds(
				updateDoc(doc(as(PRODUCER), "users", PRODUCER), {
					name: "Renamed Producer",
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("payload 3: ghost field injection", () => {
		it("denies an undocumented isSystemAdmin field", async () => {
			await assertFails(
				updateDoc(doc(as(PRODUCER), "projects", PROJECT, "entities", ENTITY), {
					confirmedByProducer: true,
					isSystemAdmin: true,
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("payload 4: id path variable poisoning", () => {
		it("denies an over-long entity id", async () => {
			const longId = "A".repeat(400)
			await assertFails(
				setDoc(doc(as(PRODUCER), "projects", PROJECT, "entities", longId), {
					id: longId,
					projectId: PROJECT,
					canonicalName: "Junk",
					type: "PERSON_CHARACTER",
					initialProposedStatus: "INSUFFICIENT_EVIDENCE",
					rationale: "",
					confirmedByProducer: false,
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("payload 5: orphaned entity creation", () => {
		it("denies creating an entity under a non-existent project", async () => {
			await assertFails(
				setDoc(
					doc(as(PRODUCER), "projects", "non-existent-proj", "entities", "ghost"),
					{
						id: "ghost",
						projectId: "non-existent-proj",
						canonicalName: "Ghost Entity",
						type: "PERSON_CHARACTER",
						initialProposedStatus: "INSUFFICIENT_EVIDENCE",
						rationale: "Test",
						confirmedByProducer: false,
						updatedAt: serverTimestamp(),
					},
				),
			)
		})
	})

	describe("payload 6: producer bypassing legal review", () => {
		it("denies a producer writing reviewer notes", async () => {
			await assertFails(
				updateDoc(doc(as(PRODUCER), "projects", PROJECT, "entities", ENTITY), {
					reviewerNotes: "Cleared by producer bypassing legal",
					updatedAt: serverTimestamp(),
				}),
			)
		})

		it("denies a producer overriding clearance status", async () => {
			await assertFails(
				updateDoc(doc(as(PRODUCER), "projects", PROJECT, "entities", ENTITY), {
					initialProposedStatus: "RESEARCH_CLEARED",
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("payload 7: reviewer bypassing the producer confirmation gate", () => {
		it("denies a reviewer toggling confirmedByProducer", async () => {
			await assertFails(
				updateDoc(doc(as(REVIEWER), "projects", PROJECT, "entities", ENTITY), {
					confirmedByProducer: true,
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("payload 8: terminal state mutation on a sealed run", () => {
		it("denies mutating an entity on a sealed project", async () => {
			await assertFails(
				updateDoc(
					doc(as(REVIEWER), "projects", SEALED_PROJECT, "entities", ENTITY),
					{
						initialProposedStatus: "RESEARCH_CLEARED",
						updatedAt: serverTimestamp(),
					},
				),
			)
		})

		it("denies unsealing a sealed project", async () => {
			await assertFails(
				updateDoc(doc(as(OWNER), "projects", SEALED_PROJECT), {
					isRunApproved: false,
					version: 3,
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("payload 9: denial-of-wallet string inflation", () => {
		it("denies a 100k character canonicalName", async () => {
			await assertFails(
				updateDoc(doc(as(PRODUCER), "projects", PROJECT, "entities", ENTITY), {
					canonicalName: "A".repeat(100_000),
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("payload 10: client-forged timestamp", () => {
		it("denies a backdated updatedAt", async () => {
			await assertFails(
				updateDoc(doc(as(PRODUCER), "projects", PROJECT, "entities", ENTITY), {
					confirmedByProducer: true,
					updatedAt: new Date("1999-01-01T00:00:00Z"),
				}),
			)
		})

		it("denies an ISO string updatedAt", async () => {
			await assertFails(
				updateDoc(doc(as(PRODUCER), "projects", PROJECT, "entities", ENTITY), {
					confirmedByProducer: true,
					updatedAt: "2026-09-01T00:00:00Z",
				}),
			)
		})
	})

	describe("payload 11: audit log tampering", () => {
		it("denies a client-side audit log write", async () => {
			await assertFails(
				setDoc(doc(as(PRODUCER), "projects", PROJECT, "auditLogs", "forged"), {
					id: "forged",
					organizationId: ORG,
					actorId: PRODUCER,
					action: "FORGED",
					timestamp: serverTimestamp(),
				}),
			)
		})

		it("denies updating an existing audit log", async () => {
			await assertFails(
				updateDoc(doc(as(PRODUCER), "projects", PROJECT, "auditLogs", "log-1"), {
					action: "REWRITTEN",
				}),
			)
		})

		it("denies deleting an audit log", async () => {
			await assertFails(
				deleteDoc(doc(as(PRODUCER), "projects", PROJECT, "auditLogs", "log-1")),
			)
		})
	})

	describe("payload 12: cross-tenant scraping", () => {
		it("denies an unauthenticated project listing", async () => {
			await assertFails(getDocs(collection(anon(), "projects")))
		})

		it("denies a foreign-tenant project listing", async () => {
			await assertFails(getDocs(collection(as(OUTSIDER), "projects")))
		})

		it("denies a foreign-tenant project read", async () => {
			await assertFails(getDoc(doc(as(OUTSIDER), "projects", PROJECT)))
		})

		it("denies a foreign-tenant entity listing", async () => {
			await assertFails(
				getDocs(collection(as(OUTSIDER), "projects", PROJECT, "entities")),
			)
		})

		it("denies a foreign-tenant audit log read", async () => {
			await assertFails(
				getDocs(collection(as(OUTSIDER), "projects", PROJECT, "auditLogs")),
			)
		})
	})

	// --------------------------------------------- additional integrity gates

	describe("clearance status is server-owned", () => {
		it("denies a client creating a pre-cleared entity", async () => {
			await assertFails(
				setDoc(doc(as(PRODUCER), "projects", PROJECT, "entities", "self-cleared"), {
					id: "self-cleared",
					projectId: PROJECT,
					canonicalName: "Self Cleared Brand",
					type: "BRAND_BUSINESS_PRODUCT",
					initialProposedStatus: "RESEARCH_CLEARED",
					rationale: "I say so.",
					confirmedByProducer: true,
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("budget is server-owned", () => {
		it("denies a client zeroing its own spend counter", async () => {
			await assertFails(
				updateDoc(doc(as(OWNER), "projects", PROJECT), {
					budgetUsed: 0,
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("jurisdiction is restricted to the frozen scope", () => {
		it("denies a non-US jurisdiction", async () => {
			await assertFails(
				updateDoc(doc(as(PRODUCER), "projects", PROJECT), {
					jurisdiction: "GLOBAL",
					updatedAt: serverTimestamp(),
				}),
			)
		})
	})

	describe("the removed /test collection is no longer world-readable", () => {
		it("denies an anonymous read of /test", async () => {
			await assertFails(getDoc(doc(anon(), "test", "probe")))
		})
	})
})
