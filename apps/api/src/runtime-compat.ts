import { createRequire } from "node:module";

/**
 * Compatibility bridge for legacy runtime code that still calls CommonJS
 * `require()` from this native-ESM package.
 *
 * Keep this isolated and remove it once FirestoreService uses a static ESM
 * import. It executes before Nest instantiates providers, so the legacy call
 * resolves from the API package rather than failing with ERR_REQUIRE_ESM or
 * `require is not defined`.
 */
const runtimeGlobal = globalThis as typeof globalThis & {
  require?: NodeRequire;
};

runtimeGlobal.require ??= createRequire(import.meta.url);
