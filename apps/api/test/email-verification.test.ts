import { describe, expect, it } from "vitest";
import {
  emailVerificationFailure,
  isPasswordProvider,
  resolveVerifiedEmailPolicy,
  type EmailVerifiableToken,
} from "../src/auth/auth.service.js";

/**
 * The email-verification gate.
 *
 * Password is the only provider whose address is unproven at sign-up, so the
 * gate must apply to it and to nothing else. These are pure-function tests:
 * they need no Firebase project, which is what makes them runnable in CI.
 */

const passwordToken: EmailVerifiableToken = {
  email: "operator@example.com",
  email_verified: false,
  firebase: { sign_in_provider: "password" },
};

const verifiedPasswordToken: EmailVerifiableToken = {
  ...passwordToken,
  email_verified: true,
};

const googleToken: EmailVerifiableToken = {
  email: "operator@example.com",
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
};

describe("provider detection", () => {
  it("identifies a password identity", () => {
    expect(isPasswordProvider(passwordToken)).toBe(true);
  });

  it("does not treat a federated identity as a password identity", () => {
    expect(isPasswordProvider(googleToken)).toBe(false);
    expect(isPasswordProvider({})).toBe(false);
  });
});

describe("resolveVerifiedEmailPolicy", () => {
  it("enforces the gate in production by default", () => {
    expect(resolveVerifiedEmailPolicy({ NODE_ENV: "production" })).toBe(true);
  });

  it("leaves local development and tests unblocked by default", () => {
    expect(resolveVerifiedEmailPolicy({ NODE_ENV: "development" })).toBe(false);
    expect(resolveVerifiedEmailPolicy({ NODE_ENV: "test" })).toBe(false);
  });

  it("honours an explicit opt-out in production", () => {
    expect(
      resolveVerifiedEmailPolicy({
        NODE_ENV: "production",
        PERMISSA_REQUIRE_VERIFIED_EMAIL: "false",
      }),
    ).toBe(false);
  });

  it("honours an explicit opt-in outside production", () => {
    expect(
      resolveVerifiedEmailPolicy({
        NODE_ENV: "development",
        PERMISSA_REQUIRE_VERIFIED_EMAIL: "true",
      }),
    ).toBe(true);
  });
});

describe("emailVerificationFailure", () => {
  it("rejects an unverified password identity when enforced", () => {
    expect(emailVerificationFailure(passwordToken, true)).toBe(
      "EMAIL_NOT_VERIFIED",
    );
  });

  it("rejects a password identity with no email_verified claim at all", () => {
    expect(
      emailVerificationFailure(
        { firebase: { sign_in_provider: "password" } },
        true,
      ),
    ).toBe("EMAIL_NOT_VERIFIED");
  });

  it("accepts a verified password identity", () => {
    expect(emailVerificationFailure(verifiedPasswordToken, true)).toBeNull();
  });

  it("never applies to a federated identity", () => {
    expect(emailVerificationFailure(googleToken, true)).toBeNull();
    expect(
      emailVerificationFailure(
        { firebase: { sign_in_provider: "google.com" }, email_verified: false },
        true,
      ),
    ).toBeNull();
  });

  it("is inert when the policy is off", () => {
    expect(emailVerificationFailure(passwordToken, false)).toBeNull();
  });
});
