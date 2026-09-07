/**
 * Generates docs/api/json-schema/*.json from the Zod contracts.
 * Run with --check in CI to fail on drift.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as contracts from "../src/index";

import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(scriptDir, "..", "..", "..", "docs", "api", "json-schema");
const check = process.argv.includes("--check");

mkdirSync(OUT_DIR, { recursive: true });

let drift = false;

for (const [name, schema] of Object.entries(contracts)) {
  if (typeof schema !== "object" || schema === null) continue;
  if (!("safeParse" in schema)) continue;

  const json =
    JSON.stringify(zodToJsonSchema(schema as never, name), null, 2) + "\n";
  const target = join(OUT_DIR, `${name}.json`);

  if (check) {
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (current !== json) {
      console.error(`drift: ${name}`);
      drift = true;
    }
    continue;
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json);
}

if (check && drift) {
  console.error(
    "Generated contract artifacts are stale. Run pnpm contracts:generate.",
  );
  process.exit(1);
}

console.log(check ? "contracts: no drift" : "contracts: generated");
