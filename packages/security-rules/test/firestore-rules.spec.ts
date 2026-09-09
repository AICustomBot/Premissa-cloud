/**
 * Option A Firestore client-boundary tests.
 *
 * The AI Studio console calls the Cloud Run API and never accesses Firestore
 * directly. All browser/mobile Firestore operations therefore fail closed.
 * The API uses a server SDK governed by IAM; server SDK behavior is outside
 * the client Security Rules emulator.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = hasEmulator ? describe : describe.skip;

suite("PERMISSA Option A Firestore boundary", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: process.env.GCLOUD_PROJECT ?? "permissa-rules-test",
      firestore: {
        rules: readFileSync(
          resolve(import.meta.dirname, "../../../firestore.rules"),
          "utf8",
        ),
      },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "organizations", "org-alpha"), { id: "org-alpha" });
      await setDoc(doc(db, "projects", "project-alpha"), {
        id: "project-alpha",
        organizationId: "org-alpha",
      });
      await setDoc(
        doc(db, "projects", "project-alpha", "grants", "producer-1"),
        { userId: "producer-1", role: "PRODUCER" },
      );
      await setDoc(
        doc(db, "projects", "project-alpha", "runs", "run-alpha"),
        { id: "run-alpha", projectId: "project-alpha" },
      );
      await setDoc(doc(db, "runs", "run-alpha", "findings", "finding-1"), {
        id: "finding-1",
        runId: "run-alpha",
      });
      await setDoc(doc(db, "entities", "entity-1"), {
        id: "entity-1",
        scriptVersionId: "script-1",
      });
    });
  });

  const authenticated = () =>
    testEnv.authenticatedContext("producer-1").firestore();
  const anonymous = () => testEnv.unauthenticatedContext().firestore();

  it("denies anonymous organization reads", async () => {
    await assertFails(
      getDoc(doc(anonymous(), "organizations", "org-alpha")),
    );
  });

  it("denies authenticated organization reads", async () => {
    await assertFails(
      getDoc(doc(authenticated(), "organizations", "org-alpha")),
    );
  });

  it("denies authenticated project reads", async () => {
    await assertFails(
      getDoc(doc(authenticated(), "projects", "project-alpha")),
    );
  });

  it("denies project collection listing", async () => {
    await assertFails(getDocs(collection(authenticated(), "projects")));
  });

  it("denies project creation", async () => {
    await assertFails(
      setDoc(doc(authenticated(), "projects", "project-new"), {
        id: "project-new",
        organizationId: "org-alpha",
      }),
    );
  });

  it("denies project updates", async () => {
    await assertFails(
      updateDoc(doc(authenticated(), "projects", "project-alpha"), {
        title: "Changed in browser",
      }),
    );
  });

  it("denies project deletion", async () => {
    await assertFails(
      deleteDoc(doc(authenticated(), "projects", "project-alpha")),
    );
  });

  it("denies grant reads", async () => {
    await assertFails(
      getDoc(
        doc(
          authenticated(),
          "projects",
          "project-alpha",
          "grants",
          "producer-1",
        ),
      ),
    );
  });

  it("denies nested run reads", async () => {
    await assertFails(
      getDoc(
        doc(
          authenticated(),
          "projects",
          "project-alpha",
          "runs",
          "run-alpha",
        ),
      ),
    );
  });

  it("denies top-level finding reads", async () => {
    await assertFails(
      getDoc(
        doc(authenticated(), "runs", "run-alpha", "findings", "finding-1"),
      ),
    );
  });

  it("denies entity reads", async () => {
    await assertFails(getDoc(doc(authenticated(), "entities", "entity-1")));
  });

  it("keeps removed test paths private", async () => {
    await assertFails(getDoc(doc(anonymous(), "test", "probe")));
  });
});
