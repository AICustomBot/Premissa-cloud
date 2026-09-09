import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedUser } from "./auth.types.js";
import admin from "firebase-admin";

const DEV_TOKEN_PREFIX = "dev-token:";

type DefaultRole = AuthenticatedUser["defaultRole"];

/** The subset of a decoded token that the email-verification gate reads. */
export type EmailVerifiableToken = {
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string };
};

/**
 * Password is the only sign-in provider whose email address is unproven: anyone
 * can register with an address they do not control. Google and other federated
 * providers prove the address themselves before issuing a token.
 */
export function isPasswordProvider(decoded: EmailVerifiableToken): boolean {
  return decoded.firebase?.sign_in_provider === "password";
}

/**
 * Whether password identities must have proven their email address.
 *
 * An explicit environment value wins in either direction. Otherwise the gate
 * is enforced in production only, so local development and automated tests are
 * never blocked on mailbox access.
 */
export function resolveVerifiedEmailPolicy(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.PERMISSA_REQUIRE_VERIFIED_EMAIL === "true") {
    return true;
  }
  if (env.PERMISSA_REQUIRE_VERIFIED_EMAIL === "false") {
    return false;
  }
  return env.NODE_ENV === "production";
}

/**
 * The rejection reason code for this token, or null when it may proceed.
 *
 * Kept as a pure function so the policy is testable without a live Firebase
 * project or a forged token.
 */
export function emailVerificationFailure(
  decoded: EmailVerifiableToken,
  enforced: boolean,
): "EMAIL_NOT_VERIFIED" | null {
  if (!enforced) {
    return null;
  }
  if (!isPasswordProvider(decoded)) {
    return null;
  }
  return decoded.email_verified === true ? null : "EMAIL_NOT_VERIFIED";
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private initialized = false;

  /**
   * Whether unverified developer tokens are accepted.
   *
   * This is resolved exactly once, at construction, from the environment only.
   * It must never be derived from request content. The previous implementation
   * included `token.startsWith("dev-token:")` in this decision, which let any
   * caller switch off token verification by choosing their own token prefix.
   */
  private readonly devTokensEnabled: boolean;

  /** Whether password identities must have a verified email address. */
  private readonly requireVerifiedEmail: boolean;

  constructor() {
    this.devTokensEnabled = AuthService.resolveDevTokenPolicy();
    this.requireVerifiedEmail = resolveVerifiedEmailPolicy();

    if (this.devTokensEnabled && process.env.NODE_ENV === "production") {
      this.logger.warn(
        "PERMISSA_ALLOW_DEV_TOKENS=true in production. Unverified bearer tokens " +
          "are being accepted and any caller can choose their own uid, role and " +
          "organization. Never enable this against real tenant data.",
      );
    }

    if (!this.requireVerifiedEmail && process.env.NODE_ENV === "production") {
      this.logger.warn(
        "PERMISSA_REQUIRE_VERIFIED_EMAIL=false in production. Password accounts " +
          "are accepted without proving ownership of their email address.",
      );
    }

    this.initFirebase();
  }

  private static resolveDevTokenPolicy(): boolean {
    // Explicit opt-in wins in every environment, including production.
    if (process.env.PERMISSA_ALLOW_DEV_TOKENS === "true") {
      return true;
    }
    // Explicit opt-out wins over the development default.
    if (process.env.PERMISSA_ALLOW_DEV_TOKENS === "false") {
      return false;
    }
    // Default: available for local development and automated tests, never in
    // production.
    return process.env.NODE_ENV !== "production";
  }

  /**
   * The Google Cloud project whose Firebase Auth tokens this API accepts.
   *
   * verifyIdToken validates a token's `aud` and `iss` claims against this
   * value, so without it every genuine token is rejected. Cloud Run does not
   * populate GOOGLE_CLOUD_PROJECT (unlike Cloud Functions and App Engine), so
   * the project id is resolved from the deployment environment rather than
   * left to library discovery.
   */
  private static resolveProjectId(): string | undefined {
    const candidates = [
      process.env.FIREBASE_PROJECT_ID,
      process.env.GOOGLE_CLOUD_PROJECT,
      process.env.GCLOUD_PROJECT,
      process.env.FIRESTORE_PROJECT_ID,
      process.env.GCP_PROJECT,
    ];

    for (const candidate of candidates) {
      const trimmed = candidate?.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return undefined;
  }

  private initFirebase(): void {
    if (admin.apps.length > 0) {
      this.initialized = true;
      return;
    }

    const projectId = AuthService.resolveProjectId();

    if (!projectId) {
      this.logger.error(
        "No Firebase project id could be resolved. Set FIREBASE_PROJECT_ID or " +
          "GOOGLE_CLOUD_PROJECT. Token verification will fail until it is set.",
      );
    }

    try {
      // Application Default Credentials come from the Cloud Run runtime
      // service account. No key material is read from the environment, which
      // is why FIREBASE_PRIVATE_KEY does not and must not exist here.
      admin.initializeApp(projectId ? { projectId } : undefined);
      this.initialized = true;
      this.logger.log(
        `Firebase Admin initialized for project ${
          projectId ?? "(discovered by the credential chain)"
        }.`,
      );
    } catch (err: unknown) {
      this.initialized = false;
      this.logger.error(
        `Firebase Admin initialization failed: ${
          err instanceof Error ? err.message : "unknown error"
        }. Token verification is unavailable and requests will be rejected.`,
      );
    }
  }

  async verifyToken(authHeader?: string): Promise<AuthenticatedUser> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("AUTH_REQUIRED");
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException("AUTH_REQUIRED");
    }

    if (this.devTokensEnabled) {
      const parsed = this.parseDevToken(token);
      if (parsed) {
        return parsed;
      }
    }

    if (!this.initialized) {
      // Fail closed. A missing or broken credential chain must never downgrade
      // into accepting unverified tokens.
      this.logger.error(
        "Rejecting request: Firebase Admin is not initialized, so the bearer " +
          "token cannot be verified.",
      );
      throw new UnauthorizedException("AUTH_REQUIRED");
    }

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch (err: unknown) {
      // Say why the token was refused. This previously swallowed the reason
      // entirely, so a misconfigured project id was indistinguishable from an
      // expired or forged token. The token is never logged: only the error
      // code and message, which name the cause without leaking a credential.
      const code = (err as { code?: string } | null)?.code;
      this.logger.warn(
        `Rejected bearer token${code ? ` [${code}]` : ""}: ${
          err instanceof Error ? err.message : "unknown verification error"
        }`,
      );
      throw new UnauthorizedException("AUTH_REQUIRED");
    }

    // The gate runs after verification, and outside the catch above, so its
    // specific reason code is not flattened into AUTH_REQUIRED.
    const failure = emailVerificationFailure(
      decoded as EmailVerifiableToken,
      this.requireVerifiedEmail,
    );
    if (failure) {
      this.logger.warn(
        `Rejected ${decoded.uid}: password identity has not verified its ` +
          "email address.",
      );
      throw new UnauthorizedException(failure);
    }

    return {
      uid: decoded.uid,
      email: decoded.email ?? `${decoded.uid}@permissa.local`,
      name: decoded.name,
      organizationId: (decoded.orgId as string) || undefined,
      defaultRole: (decoded.role as DefaultRole) || "PRODUCER",
    };
  }

  /**
   * Parses an unverified developer token.
   *
   * Only ever called when {@link devTokensEnabled} is true. Returns null for
   * anything it does not recognise so the caller falls through to real
   * verification.
   */
  private parseDevToken(token: string): AuthenticatedUser | null {
    // Format: dev-token:uid:email:role:orgId
    if (token.startsWith(DEV_TOKEN_PREFIX)) {
      const parts = token.split(":");
      return {
        uid: parts[1] || "dev-user",
        email: parts[2] || "dev@permissa.app",
        defaultRole: (parts[3] as DefaultRole) || "OWNER",
        organizationId: parts[4] || undefined,
      };
    }

    // Fixed fixtures used by the API test suites.
    switch (token) {
      case "test-owner":
        return {
          uid: "user-owner-1",
          email: "owner@studio-a.com",
          defaultRole: "OWNER",
          organizationId: "org-studio-a",
        };
      case "test-producer":
        return {
          uid: "user-producer-1",
          email: "producer@studio-a.com",
          defaultRole: "PRODUCER",
          organizationId: "org-studio-a",
        };
      case "test-reviewer":
        return {
          uid: "user-reviewer-1",
          email: "legal@studio-a.com",
          defaultRole: "REVIEWER",
          organizationId: "org-studio-a",
        };
      case "test-tenant-b":
        return {
          uid: "user-owner-b",
          email: "owner@studio-b.com",
          defaultRole: "OWNER",
          organizationId: "org-studio-b",
        };
      default:
        return null;
    }
  }
}
