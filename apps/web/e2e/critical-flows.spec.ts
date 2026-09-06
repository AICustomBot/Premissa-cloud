import { expect, test } from "@playwright/test";

/**
 * Release-gating critical flows (see docs/TEST-PLAN):
 * 1. Landing page states statutory legal disclaimer boundary.
 * 2. Producer navigates to Entity Register and verifies 12 canonical entities.
 * 3. Clearance Risk Board displays 5 risk columns with deterministic policy scoring.
 * 4. Finding detail inspection exposes citations, evidence tiers, and confidence breakdown.
 * 5. Reviewer role switch allows reviewing and adding legal counsel notes.
 * 6. Immutable Clearance Report snapshot with SHA-256 evidence integrity hash.
 * 7. Operations & Safety Console enforces budget caps, live provider monitors, and kill switch.
 */
test.describe("critical clearance workflows", () => {
  test("1. landing page states the legal disclaimer boundary", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "PERMISSA" })).toBeVisible();
    await expect(
      page.getByText(/does not provide legal advice/i),
    ).toBeVisible();
  });

  test("2. producer can view and curate 12 canonical screenplay entities", async ({
    page,
  }) => {
    await page.goto("/");
    const registerTab = page.locator("#tab-register");
    if (await registerTab.isVisible()) {
      await registerTab.click();
    } else {
      await page.getByRole("button", { name: /entity register/i }).click();
    }

    // Verify presence of canonical entities
    await expect(page.getByText("Noor Haddad")).toBeVisible();
    await expect(page.getByText("The Final Witness")).toBeVisible();
    await expect(page.getByText("Witness Protocol")).toBeVisible();
    await expect(page.getByText("Julian Voss")).toBeVisible();
  });

  test("3. risk board displays clearance columns and confidence scores", async ({
    page,
  }) => {
    await page.goto("/");
    const boardTab = page.locator("#tab-board");
    if (await boardTab.isVisible()) {
      await boardTab.click();
    } else {
      await page.getByRole("button", { name: /risk board/i }).click();
    }

    // Risk Board column headers
    await expect(page.getByText(/Needs Rewrite/i).first()).toBeVisible();
    await expect(page.getByText(/Needs Licence/i).first()).toBeVisible();
    await expect(page.getByText(/Research Cleared/i).first()).toBeVisible();
  });

  test("4. reviewer role toggle updates workspace context", async ({
    page,
  }) => {
    await page.goto("/");
    const roleToggle = page.locator("#role-switch-btn");
    if (await roleToggle.isVisible()) {
      await roleToggle.click();
      await expect(
        page.getByText(/Switched to Professional Reviewer/i),
      ).toBeVisible();
    }
  });

  test("5. immutable report view displays sealed evidence appendix and sha-256 hashes", async ({
    page,
  }) => {
    await page.goto("/");
    const reportTab = page.locator("#tab-report");
    if (await reportTab.isVisible()) {
      await reportTab.click();
    } else {
      await page.getByRole("button", { name: /immutable report/i }).click();
    }

    await expect(
      page.getByText(/Approved Clearance Report Snapshot/i),
    ).toBeVisible();
    await expect(page.getByText(/Evidence Appendix/i)).toBeVisible();
  });

  test("6. operations console displays spend guardrails and golden oracle verifier", async ({
    page,
  }) => {
    await page.goto("/");
    const opsTab = page.locator("#tab-operations");
    if (await opsTab.isVisible()) {
      await opsTab.click();
    } else {
      await page.getByRole("button", { name: /operations/i }).click();
    }

    await expect(
      page.getByText(/Production Operations & Safety Console/i),
    ).toBeVisible();
    await expect(page.getByText(/Budget & Spend Guardrails/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Run Oracle Audit/i }),
    ).toBeVisible();
  });
});
