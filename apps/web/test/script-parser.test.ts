import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScreenplayFile } from "../src/lib/script-parser";

describe("Client-side Ingestion & Parser Pipeline (Batch 2)", () => {
  const findFixture = (relPath: string): string => {
    const candidates = [
      path.resolve(process.cwd(), relPath),
      path.resolve(process.cwd(), "../../", relPath),
      path.resolve(__dirname, "../../../", relPath),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    throw new Error(`Fixture not found: ${relPath}`);
  };

  const fdxPath = findFixture("tests/fixtures/golden/the-final-witness.fdx");
  const fountainPath = findFixture(
    "tests/fixtures/golden/the-final-witness.fountain",
  );
  const pdfPath = findFixture("tests/fixtures/golden/the-final-witness.pdf");
  const oraclePath = findFixture("tests/fixtures/golden/expected-oracle.json");

  const rawFdx = fs.readFileSync(fdxPath, "utf-8");
  const rawFountain = fs.readFileSync(fountainPath, "utf-8");
  const rawPdf = fs.readFileSync(pdfPath);
  const oracle = JSON.parse(fs.readFileSync(oraclePath, "utf-8"));

  it("parses the golden FDX fixture into 6 scenes and extracts oracle entities", async () => {
    const file = new File([rawFdx], "the-final-witness.fdx", {
      type: "application/xml",
    });

    const progressLogs: string[] = [];
    const result = await parseScreenplayFile(file, (p) => {
      progressLogs.push(p.step);
    });

    expect(result.pageCount).toBe(10);
    expect(result.scenes).toHaveLength(6);
    expect(result.scenes.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    // Verify entity extraction includes the 12 oracle entities
    const extractedNames = result.entities.map((e) => e.canonicalName);
    for (const oracleEntity of oracle.entities) {
      expect(extractedNames).toContain(oracleEntity.name);
    }

    // Verify progress progression was tracked through phases
    expect(progressLogs).toContain("READING_FILE");
    expect(progressLogs).toContain("COMPLETED");
  });

  it("parses the golden Fountain fixture deterministically", async () => {
    const file = new File([rawFountain], "the-final-witness.fountain", {
      type: "text/plain",
    });

    const result = await parseScreenplayFile(file);

    expect(result.pageCount).toBe(10);
    expect(result.scenes).toHaveLength(6);
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    const extractedNames = result.entities.map((e) => e.canonicalName);
    for (const oracleEntity of oracle.entities) {
      expect(extractedNames).toContain(oracleEntity.name);
    }
  });

  it("parses the golden PDF fixture with exact scene and page count", async () => {
    const file = new File([rawPdf], "the-final-witness.pdf", {
      type: "application/pdf",
    });

    const result = await parseScreenplayFile(file);

    expect(result.pageCount).toBe(10);
    expect(result.scenes).toHaveLength(6);
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    const extractedNames = result.entities.map((e) => e.canonicalName);
    for (const oracleEntity of oracle.entities) {
      expect(extractedNames).toContain(oracleEntity.name);
    }
  });

  it("enforces quarantine limit on files exceeding 20MB", async () => {
    const oversized = new Uint8Array(21 * 1024 * 1024);
    const file = new File([oversized], "giant-script.fdx", {
      type: "application/xml",
    });

    await expect(parseScreenplayFile(file)).rejects.toThrow(
      /20MB quarantine limit/,
    );
  });
});
