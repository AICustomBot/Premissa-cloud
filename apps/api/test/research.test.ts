import { describe, it, expect, beforeEach } from "vitest";
import { PreconditionFailedException } from "@nestjs/common";
import { ResearchService } from "../src/research/research.service.js";
import { UsageLedgerService } from "../src/research/ledger/usage-ledger.service.js";
import { CircuitBreaker } from "../src/research/circuit/circuit-breaker.js";
import { RateLimiter } from "../src/research/circuit/rate-limiter.js";
import { StatutoryRegistryAdapter } from "../src/research/adapters/statutory-registry.adapter.js";
import { IndustryDatabaseAdapter } from "../src/research/adapters/industry-database.adapter.js";
import { LiveSearchAdapter } from "../src/research/adapters/live-search.adapter.js";
import {
  areSourcesIndependent,
  resolveDomainMetadata,
} from "../src/research/adapters/domain-authority.js";
import { FirestoreService } from "../src/storage/firestore.service.js";
import { generateUuidV7, UsageLedgerEntry } from "@permissa/contracts";

describe("Batch 4: Research Retrieval, Adapters, Ledger & Circuit Breakers", () => {
  let researchService: ResearchService;
  let usageLedgerService: UsageLedgerService;
  let circuitBreaker: CircuitBreaker;
  let rateLimiter: RateLimiter;
  let firestoreService: FirestoreService;

  const orgId = generateUuidV7();
  const projectId = generateUuidV7();
  const runId = generateUuidV7();
  const entityId = generateUuidV7();

  beforeEach(async () => {
    firestoreService = new FirestoreService();
    const statutoryAdapter = new StatutoryRegistryAdapter();
    const industryAdapter = new IndustryDatabaseAdapter();
    const liveSearchAdapter = new LiveSearchAdapter();
    circuitBreaker = new CircuitBreaker();
    rateLimiter = new RateLimiter();
    usageLedgerService = new UsageLedgerService(firestoreService);
    researchService = new ResearchService(
      firestoreService,
      statutoryAdapter,
      industryAdapter,
      liveSearchAdapter,
      circuitBreaker,
      rateLimiter,
      usageLedgerService,
    );

    // Bootstrap test organization and project in storage
    await firestoreService.saveOrganization({
      id: orgId,
      name: "Permissa Studio Test",
      ownerId: "user-owner-test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await firestoreService.saveProject({
      id: projectId,
      organizationId: orgId,
      title: "The Final Witness",
      jurisdiction: "US",
      createdBy: "user-owner-test",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  describe("1. Constitutional Producer Confirmation Gate", () => {
    it("rejects research query if entity is unconfirmed by a Producer", async () => {
      // Create unconfirmed entity in storage
      await firestoreService.saveEntity({
        id: entityId,
        scriptVersionId: generateUuidV7(),
        type: "PERSON_CHARACTER",
        canonicalName: "Julian Voss",
        aliases: ["Julian", "Voss"],
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 10, end: 21 },
            contextExcerpt: "Julian Voss enters the courtroom.",
          },
        ],
        confirmed: false, // NOT CONFIRMED!
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await expect(
        researchService.conductResearchForEntity({
          projectId,
          runId,
          entityId,
        }),
      ).rejects.toThrow(PreconditionFailedException);
    });

    it("allows research query when entity is confirmed by a Producer", async () => {
      // Create confirmed entity
      await firestoreService.saveEntity({
        id: entityId,
        scriptVersionId: generateUuidV7(),
        type: "PERSON_CHARACTER",
        canonicalName: "Julian Voss",
        aliases: ["Julian", "Voss"],
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 10, end: 21 },
            contextExcerpt: "Julian Voss enters the courtroom.",
          },
        ],
        confirmed: true, // PRODUCER CONFIRMED!
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await researchService.conductResearchForEntity({
        projectId,
        runId,
        entityId,
      });

      expect(result.entityId).toBe(entityId);
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.providerCallsCount).toBeGreaterThan(0);
    });
  });

  describe("2. Usage Ledger Preconditions (Content-Free Contract)", () => {
    it("writes a strictly content-free usage ledger entry after every provider call", async () => {
      // Create confirmed brand entity
      const brandEntityId = generateUuidV7();
      await firestoreService.saveEntity({
        id: brandEntityId,
        scriptVersionId: generateUuidV7(),
        type: "BRAND_BUSINESS_PRODUCT",
        canonicalName: "Apple Vision Pro",
        aliases: ["Vision Pro"],
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 30, end: 46 },
            contextExcerpt: "The character pulls on an Apple Vision Pro.",
          },
        ],
        confirmed: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const brandRunId = generateUuidV7();
      await researchService.conductResearchForEntity({
        projectId,
        runId: brandRunId,
        entityId: brandEntityId,
      });

      const entries = await usageLedgerService.getLedgerForRun(brandRunId);
      expect(entries.length).toBeGreaterThan(0);

      // Verify each entry conforms strictly to UsageLedgerEntry schema
      for (const entry of entries) {
        const validated = UsageLedgerEntry.parse(entry);
        expect(validated.runId).toBe(brandRunId);
        expect(validated.organizationId).toBe(orgId);
        expect(validated.costUsd).toBeGreaterThan(0);
        expect(validated.budgetRemainingUsd).toBeLessThan(10.0);

        // Verify content-free constitutional invariant: NO entity name or script text
        const serialized = JSON.stringify(validated);
        expect(serialized).not.toContain("Apple Vision Pro");
        expect(serialized).not.toContain("Vision Pro");
        expect(serialized).not.toContain("script");
      }
    });
  });

  describe("3. Circuit Breaker & Rate Limiter", () => {
    it("trips circuit breaker to OPEN after consecutive failures and recovers on reset", async () => {
      const provider = "TEST_OUTAGE_PROVIDER";
      let failureCount = 0;

      const failingCall = async () => {
        failureCount++;
        throw new Error("Simulated remote 503 gateway outage");
      };

      // Trip after 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(provider, failingCall)).rejects.toThrow();
      }

      const status = circuitBreaker.getStatus().find((c) => c.providerName === provider);
      expect(status?.state).toBe("OPEN");

      // Next call should be blocked immediately by circuit breaker without executing action
      await expect(
        circuitBreaker.execute(provider, async () => "should-not-run"),
      ).rejects.toThrow("is OPEN");

      // Manual reset recovers circuit
      circuitBreaker.reset(provider);
      const resetStatus = circuitBreaker.getStatus().find((c) => c.providerName === provider);
      expect(resetStatus?.state).toBe("CLOSED");
    });

    it("enforces rate limiter call caps per entity and cost cap per run", () => {
      const testRunId = generateUuidV7();
      const testEntityId = generateUuidV7();

      // Entity call cap: max 3 calls
      rateLimiter.checkAndAcquire(testRunId, testEntityId, 0.05, 10.0);
      rateLimiter.checkAndAcquire(testRunId, testEntityId, 0.10, 10.0);
      rateLimiter.checkAndAcquire(testRunId, testEntityId, 0.15, 10.0);

      // 4th call should throw PreconditionFailedException
      expect(() => {
        rateLimiter.checkAndAcquire(testRunId, testEntityId, 0.20, 10.0);
      }).toThrow("Maximum 3 provider calls already conducted");

      // Budget cap: exceeds cap
      expect(() => {
        rateLimiter.checkAndAcquire(testRunId, generateUuidV7(), 10.50, 10.0);
      }).toThrow("Clearance run cost cap of $10.00 USD exceeded");
    });
  });

  describe("4. Domain Authority & Source Independence Resolution", () => {
    it("correctly identifies Tier-1 statutory sources", () => {
      expect(resolveDomainMetadata("uspto.gov").sourceTier).toBe("TIER_1");
      expect(resolveDomainMetadata("tsdr.uspto.gov").sourceTier).toBe("TIER_1");
      expect(resolveDomainMetadata("copyright.gov").sourceTier).toBe("TIER_1");
      expect(resolveDomainMetadata("cocatalog.loc.gov").sourceTier).toBe("TIER_1");
      expect(resolveDomainMetadata("euipo.europa.eu").sourceTier).toBe("TIER_1");
      expect(resolveDomainMetadata("wipo.int").sourceTier).toBe("TIER_1");
    });

    it("detects non-independent sources owned by the same corporate parent", () => {
      // IMDb and Box Office Mojo share Amazon.com, Inc. ownership
      expect(areSourcesIndependent("imdb.com", "boxofficemojo.com")).toBe(false);

      // Variety and Deadline share Penske Media Corporation ownership
      expect(areSourcesIndependent("variety.com", "deadline.com")).toBe(false);

      // Distinct corporate owners ARE independent
      expect(areSourcesIndependent("imdb.com", "variety.com")).toBe(true);
      expect(areSourcesIndependent("bloomberg.com", "reuters.com")).toBe(true);
      expect(areSourcesIndependent("uspto.gov", "imdb.com")).toBe(true);
    });
  });

  describe("5. Batch 5: Deterministic Evidence Gate, Four-Pillars & Draft Finding Generation", () => {
    it("synthesizes draft Finding record with optimistic concurrency version 1", async () => {
      const confirmedPersonId = generateUuidV7();
      await firestoreService.saveEntity({
        id: confirmedPersonId,
        scriptVersionId: generateUuidV7(),
        type: "PERSON_CHARACTER",
        canonicalName: "Marcus Brody",
        aliases: ["Marcus"],
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 1, end: 12 },
            contextExcerpt: "Marcus Brody stands in the museum archives.",
          },
        ],
        confirmed: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const personRunId = generateUuidV7();
      const result = await researchService.conductResearchForEntity({
        projectId,
        runId: personRunId,
        entityId: confirmedPersonId,
      });

      expect(result.finding).toBeDefined();
      expect(result.finding.entityId).toBe(confirmedPersonId);
      expect(result.finding.version).toBe(1);
      expect(result.finding.confidence.formulaVersion).toBeDefined();
      expect(result.finding.rationale).toBeDefined();

      // Check persistence in FirestoreService
      const savedFindings = await researchService.getFindingsForRun(personRunId);
      expect(savedFindings.length).toBe(1);
      expect(savedFindings[0]?.id).toBe(result.finding.id);

      const retrieved = await researchService.getFinding(personRunId, result.finding.id);
      expect(retrieved.id).toBe(result.finding.id);
      expect(retrieved.admittedStatus).toBe(result.finding.admittedStatus);
    });

    it("evaluates four-pillar risks and supports re-evaluation with optimistic concurrency", async () => {
      const defamationEntityId = generateUuidV7();
      await firestoreService.saveEntity({
        id: defamationEntityId,
        scriptVersionId: generateUuidV7(),
        type: "PERSON_CHARACTER",
        canonicalName: "Corrupt Senator",
        aliases: ["Senator"],
        mentions: [
          {
            sceneId: generateUuidV7(),
            sourceRange: { start: 1, end: 15 },
            contextExcerpt: "The Senator accepted a bribe under the table.",
          },
        ],
        confirmed: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const defRunId = generateUuidV7();
      const initial = await researchService.conductResearchForEntity({
        projectId,
        runId: defRunId,
        entityId: defamationEntityId,
      });

      expect(initial.finding.version).toBe(1);

      // Re-evaluate with explicit defamatory context
      const reevaluated = await researchService.reevaluateFinding(
        projectId,
        defRunId,
        defamationEntityId,
        {
          isLivingPerson: true,
          hasDefamatoryAllegations: true,
        },
      );

      expect(reevaluated.finding.version).toBe(2);
      expect(reevaluated.riskAnalysis.pillar).toBe("DEFAMATION_FALSE_LIGHT");
      expect(reevaluated.riskAnalysis.severeContext).toBe(true);
      expect(reevaluated.finding.proposedStatus).toBe("BLOCKED");
      expect(reevaluated.finding.professionalConfirmationRequired).toBe(true);
      expect(reevaluated.finding.rewriteSuggestion).not.toBeNull();
    });
  });
});

