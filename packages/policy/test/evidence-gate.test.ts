import { describe, expect, it } from "vitest"
import { computeConfidence, evaluateEvidenceGate } from "../src/index"
import type { ConfidenceInput } from "../src/confidence"

const strong: ConfidenceInput = {
	authority: "TIER_1_APPLICABLE",
	independence: "TIER_1_PATH",
	match: "EXACT_CORROBORATED",
	freshnessValid: true,
	context: "COMPLETE",
	unresolvedConflict: false,
	providerFailed: false,
	budgetLimited: false,
	citationUnreachable: false,
	hasAdmissibleCitation: true,
	evidenceExpired: false,
}

describe("confidence formula", () => {
	it("scores a full authoritative pattern at 100 / HIGH", () => {
		const result = computeConfidence(strong)
		expect(result.finalScore).toBe(100)
		expect(result.band).toBe("HIGH")
	})

	it("caps unresolved conflict at 39", () => {
		const result = computeConfidence({ ...strong, unresolvedConflict: true })
		expect(result.finalScore).toBe(39)
		expect(result.band).toBe("LOW")
	})

	it("forces 0 on provider failure", () => {
		expect(computeConfidence({ ...strong, providerFailed: true }).finalScore).toBe(0)
	})

	it("forces 0 on budget limit", () => {
		expect(computeConfidence({ ...strong, budgetLimited: true }).finalScore).toBe(0)
	})

	it("does not grant full independence to common ownership", () => {
		const result = computeConfidence({
			...strong,
			authority: "TWO_INDEPENDENT_TIER_2",
			independence: "DISTINCT_DOMAIN_SAME_OWNER",
		})
		expect(result.factors.independence).toBe(8)
	})
})

describe("evidence gate", () => {
	it("admits RESEARCH_CLEARED only at 85+", () => {
		const ok = evaluateEvidenceGate({
			proposedStatus: "RESEARCH_CLEARED",
			confidence: strong,
			licenceSignalSupported: false,
			rewritePathSupported: false,
			strongConflict: false,
			severeContext: false,
		})
		expect(ok.admittedStatus).toBe("RESEARCH_CLEARED")

		const weak = evaluateEvidenceGate({
			proposedStatus: "RESEARCH_CLEARED",
			confidence: { ...strong, authority: "SINGLE_TIER_2", independence: "SINGLE_SOURCE" },
			licenceSignalSupported: false,
			rewritePathSupported: false,
			strongConflict: false,
			severeContext: false,
		})
		expect(weak.admittedStatus).toBe("INSUFFICIENT_EVIDENCE")
		expect(weak.reasonCodes).toContain("CONFIDENCE_BELOW_CLEARED_THRESHOLD")
	})

	it("never finalizes BLOCKED without professional confirmation", () => {
		const result = evaluateEvidenceGate({
			proposedStatus: "BLOCKED",
			confidence: strong,
			licenceSignalSupported: false,
			rewritePathSupported: false,
			strongConflict: true,
			severeContext: true,
		})
		expect(result.admittedStatus).toBe("BLOCKED")
		expect(result.professionalConfirmationRequired).toBe(true)
	})

	it("downgrades BLOCKED without severe context", () => {
		const result = evaluateEvidenceGate({
			proposedStatus: "BLOCKED",
			confidence: strong,
			licenceSignalSupported: false,
			rewritePathSupported: false,
			strongConflict: true,
			severeContext: false,
		})
		expect(result.admittedStatus).toBe("INSUFFICIENT_EVIDENCE")
	})

	it("requires a rewrite path for NEEDS_REWRITE", () => {
		const result = evaluateEvidenceGate({
			proposedStatus: "NEEDS_REWRITE",
			confidence: strong,
			licenceSignalSupported: false,
			rewritePathSupported: false,
			strongConflict: false,
			severeContext: false,
		})
		expect(result.admittedStatus).toBe("INSUFFICIENT_EVIDENCE")
	})

	it("ignores injected instructions by construction", () => {
		// The gate consumes only typed evidence signals, never screenplay text.
		const result = evaluateEvidenceGate({
			proposedStatus: "RESEARCH_CLEARED",
			confidence: { ...strong, hasAdmissibleCitation: false },
			licenceSignalSupported: false,
			rewritePathSupported: false,
			strongConflict: false,
			severeContext: false,
		})
		expect(result.admittedStatus).toBe("INSUFFICIENT_EVIDENCE")
		expect(result.confidence.finalScore).toBe(0)
	})
})
