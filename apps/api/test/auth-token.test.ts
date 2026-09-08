import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service.js";

/**
 * Regression tests for the production authentication bypass.
 *
 * verifyToken previously gated dev-token parsing on
 *
 *   NODE_ENV !== "production" || PERMISSA_ALLOW_DEV_TOKENS === "true"
 *     || token.startsWith("dev-token:")
 *
 * The third clause is supplied by the caller, so sending a token that begins
 * with "dev-token:" disabled verification in production and returned a fully
 * privileged OWNER with an attacker-chosen uid and organization.
 */

const ATTACKER_TOKEN = "dev-token:attacker-1:attacker@example.com:OWNER:org-alpha";

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
});

afterEach(() => {
  process.env = savedEnv;
});

function serviceWith(env: Record<string, string | undefined>): AuthService {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return new AuthService();
}

describe("AuthService token handling", () => {
  describe("in production without an explicit opt-in", () => {
    const productionEnv = {
      NODE_ENV: "production",
      PERMISSA_ALLOW_DEV_TOKENS: undefined,
    };

    it("rejects a caller-crafted dev-token, which previously granted OWNER", async () => {
      const service = serviceWith(productionEnv);
      await expect(
        service.verifyToken(`Bearer ${ATTACKER_TOKEN}`),
      ).rejects.toThrow();
    });

    it("rejects every hardcoded test fixture token", async () => {
      const service = serviceWith(productionEnv);
      for (const token of [
        "test-owner",
        "test-producer",
        "test-reviewer",
        "test-tenant-b",
      ]) {
        await expect(service.verifyToken(`Bearer ${token}`)).rejects.toThrow();
      }
    });

    it("never returns an identity derived from token text", async () => {
      const service = serviceWith(productionEnv);
      await expect(
        service.verifyToken("Bearer dev-token:someone-else:a@b.com:OWNER:org-beta"),
      ).rejects.toThrow();
    });
  });

  describe("malformed authorization headers", () => {
    it("rejects a missing header", async () => {
      const service = serviceWith({ NODE_ENV: "test" });
      await expect(service.verifyToken(undefined)).rejects.toThrow();
    });

    it("rejects a non-Bearer scheme", async () => {
      const service = serviceWith({ NODE_ENV: "test" });
      await expect(service.verifyToken("Basic abc123")).rejects.toThrow();
    });

    it("rejects an empty Bearer token", async () => {
      const service = serviceWith({ NODE_ENV: "test" });
      await expect(service.verifyToken("Bearer    ")).rejects.toThrow();
    });
  });

  describe("outside production", () => {
    it("accepts fixture tokens so local development and tests work", async () => {
      const service = serviceWith({
        NODE_ENV: "test",
        PERMISSA_ALLOW_DEV_TOKENS: undefined,
      });
      const user = await service.verifyToken("Bearer test-owner");
      expect(user.uid).toBe("user-owner-1");
      expect(user.defaultRole).toBe("OWNER");
      expect(user.organizationId).toBe("org-studio-a");
    });

    it("honours an explicit opt-out even in development", async () => {
      const service = serviceWith({
        NODE_ENV: "development",
        PERMISSA_ALLOW_DEV_TOKENS: "false",
      });
      await expect(
        service.verifyToken(`Bearer ${ATTACKER_TOKEN}`),
      ).rejects.toThrow();
    });
  });

  describe("the documented production escape hatch", () => {
    it("accepts dev tokens only when the operator sets the flag server-side", async () => {
      const service = serviceWith({
        NODE_ENV: "production",
        PERMISSA_ALLOW_DEV_TOKENS: "true",
      });
      const user = await service.verifyToken(`Bearer ${ATTACKER_TOKEN}`);
      expect(user.uid).toBe("attacker-1");
      expect(user.defaultRole).toBe("OWNER");
    });
  });
});
