import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedUser } from "./auth.types.js";
import admin from "firebase-admin";

const DEV_TOKEN_PREFIX = "dev-token:";

type DefaultRole = AuthenticatedUser["defaultRole"];

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

  constructor() {
    this.devTokensEnabled = AuthService.resolveDevTokenPolicy();

    if (this.devTokensEnabled && process.env.NODE_ENV === "production") {
      this.logger.warn(
        "PERMISSA_ALLOW_DEV_TOKENS=true in production. Unverified bearer tokens " +
          "are being accepted and any caller can choose their own uid, role and " +
          "organization. Never enable this against real tenant data.",
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

  private initFirebase(): void {
    if (admin.apps.length > 0) {
      this.initialized = true;
      return;
    }

    try {
      admin.initializeApp();
      this.initialized = true;
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

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      return {
        uid: decoded.uid,
        email: decoded.email ?? `${decoded.uid}@permissa.local`,
        name: decoded.name,
        organizationId: (decoded.orgId as string) || undefined,
        defaultRole: (decoded.role as DefaultRole) || "PRODUCER",
      };
    } catch {
      throw new UnauthorizedException("AUTH_REQUIRED");
    }
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
