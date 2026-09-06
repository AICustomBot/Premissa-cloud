## What changed

<!-- One paragraph. What does this PR do and why. -->

## Specification authority

<!--
Per AGENTS.md the authority order is:
  1. docs/DOCUMENTATION-INDEX.md
  2. docs/PRODUCT-SPEC.md
  3. packages/contracts + generated docs/api/*
  4. ADRs in docs/decisions/
  5. subsystem specs
  6. code and tests
Cite the document this change implements, or the ADR that authorises the
deviation.
-->

- Implements:
- Deviates from (with ADR):

## Checklist

- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass locally
- [ ] `npm run contracts:check` passes (no generated-artifact drift)
- [ ] If Firestore rules changed, `npm run test --workspace=@permissa/security-rules` passes against the emulator
- [ ] No screenplay text, entity names, queries, evidence excerpts, reviewer comments or raw payloads added to logs, traces, metrics or error messages
- [ ] No clearance status or confidence value assigned by a model or by a client
- [ ] No prohibited AI vendor dependency added (OpenAI, Anthropic, AWS, Microsoft)
- [ ] No secrets in source, CI logs, job arguments or client bundles
- [ ] Frozen policy numbers unchanged, or changed deliberately with the specification updated in the same PR
