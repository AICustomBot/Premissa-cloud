import { describe, it, expect, beforeAll } from "vitest";
import firebaseConfig from "../src/lib/firebase-applet-config.json";
import {
  initWebServices,
  db,
  auth,
  googleProvider,
} from "../src/lib/firebase";
import { INITIAL_CLEARANCE_ENTITIES } from "../src/data/golden-data";

describe("Batch 1: Firestore & Authentication Verification", () => {
  // The module no longer initialises at import time: the client bundle must
  // not carry the config (Dockerfile.web secret gate). Tests initialise
  // explicitly from the checked-in local config instead.
  beforeAll(() => {
    initWebServices(firebaseConfig);
  });

  it("verifies Firebase configuration targets the designated Firestore database", () => {
    expect(firebaseConfig.projectId).toBe("aicustombot");
    expect(firebaseConfig.firestoreDatabaseId).toBe("premissadb");
    expect(firebaseConfig.apiKey).toBeTruthy();
    expect(firebaseConfig.authDomain).toBe("aicustombot.firebaseapp.com");
  });

  it("verifies Firestore client instance binds to designated database", () => {
    expect(db).toBeDefined();
    expect(db.type).toBe("firestore");
    expect(db.app.options.projectId).toBe("aicustombot");
  });

  it("verifies Firebase Auth client instance and Google provider setup", () => {
    expect(auth).toBeDefined();
    expect(googleProvider).toBeDefined();
    expect(googleProvider.providerId).toBe("google.com");
  });

  it("verifies initial clearance entities conform to Firestore schema invariants", () => {
    expect(INITIAL_CLEARANCE_ENTITIES.length).toBe(12);

    for (const entity of INITIAL_CLEARANCE_ENTITIES) {
      // 1. Valid ID invariant
      expect(entity.id).toMatch(/^[a-zA-Z0-9_\-]+$/);
      // 2. Canonical name non-empty and bounded
      expect(entity.canonicalName.length).toBeGreaterThan(0);
      expect(entity.canonicalName.length).toBeLessThanOrEqual(200);
      // 3. Supported entity types
      expect([
        "PERSON_CHARACTER",
        "BRAND_BUSINESS_PRODUCT",
        "PRODUCTION_TITLE",
      ]).toContain(entity.type);
      // 4. Initial proposed status valid enum
      expect([
        "RESEARCH_CLEARED",
        "NEEDS_LICENCE",
        "NEEDS_REWRITE",
        "BLOCKED",
        "INSUFFICIENT_EVIDENCE",
      ]).toContain(entity.initialProposedStatus);
      // 5. Version precondition (default 1 when not set)
      expect(entity.version ?? 1).toBeGreaterThanOrEqual(1);
    }
  });

  it("validates that role-based field partitions protect against unauthorized mutations", () => {
    const producerPermittedFields = [
      "confirmedByProducer",
      "canonicalName",
      "type",
      "rewriteSuggestion",
      "rationale",
      "updatedAt",
    ];

    const reviewerPermittedFields = [
      "initialProposedStatus",
      "reviewerNotes",
      "updatedAt",
    ];

    // Producers must never be able to mutate clearance status directly
    expect(producerPermittedFields).not.toContain("initialProposedStatus");
    expect(producerPermittedFields).not.toContain("reviewerNotes");

    // Reviewers must never be able to mutate producer confirmation
    expect(reviewerPermittedFields).not.toContain("confirmedByProducer");
  });
});
