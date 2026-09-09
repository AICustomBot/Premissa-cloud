import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import admin from "firebase-admin";
import type { AuthenticatedUser } from "./auth.types.js";

/**
 * Cross-origin identity handoff, console -> dashboard.
 *
 * The sign-in surface (permissa-console) and the dashboard (apps/web) are two
 * Cloud Run services on two different `*.run.app` hosts. Firebase Auth keeps
 * its session in IndexedDB scoped to a single origin, so a redirect from one
 * to the other arrives signed out and bounces straight back. A shared cookie
 * cannot bridge them either: `run.app` is on the Public Suffix List, so no
 * cookie may span two services beneath it. That only becomes possible once
 * both are served from one custom parent domain.
 *
 * The supported bridge is a Firebase custom token: this service mints one for
 * the already-authenticated caller, the console carries it across, and the
 * dashboard redeems it with signInWithCustomToken.
 *
 * Two deliberate properties:
 *
 * - No developer claims are attached. `role` and `orgId` are account custom
 *   claims (set by `npm run claims:set`), so they already appear in whatever
 *   ID token the dashboard subsequently obtains. Copying them out of the
 *   presented token would let a caller's own token contents influence the
 *   contents of a token this service signs.
 * - No server-side handoff state. A one-time code held in a Map was the
 *   obvious design and is wrong here: at `--max-instances 3` the redemption
 *   usually lands on a different container than the one that issued it, so
 *   most handoffs would fail. Statelessness is a correctness requirement.
 *
 * The email-verification gate is inherited rather than restated: the route
 * sits behind AuthGuard, which already refuses unverified password identities
 * with EMAIL_NOT_VERIFIED, so an unverified account cannot obtain a handoff.
 */

/** Firebase fixes the lifetime of a custom token at one hour. */
export const HANDOFF_TOKEN_TTL_SECONDS = 3600;

/** The dashboard route that redeems a handoff. */
export const HANDOFF_CALLBACK_PATH = "/auth/callback";

export type HandoffResult = {
  uid: string;
  customToken: string;
  expiresInSeconds: number;
  /** The dashboard origin, or null when this API has none configured. */
  dashboardUrl: string | null;
  callbackPath: string;
};

@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);

  /**
   * The dashboard origin.
   *
   * Held by the API rather than by the console so there is a single place to
   * change when the service URL moves -- right next to PERMISSA_ALLOWED_ORIGINS,
   * which must already name the same origin for CORS. Keeping the two apart
   * would let the console forward to an origin the API then refuses.
   *
   * Pure and env-injectable so the validation is testable without a
   * deployment.
   */
  static resolveDashboardUrl(
    env: NodeJS.ProcessEnv = process.env,
  ): string | null {
    const raw = (env.PERMISSA_WEB_APP_URL ?? "").trim().replace(/\/$/, "");
    if (!raw) {
      return null;
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }

    // A handoff token travels in the fragment of this URL. Refuse plaintext
    // origins so it cannot be exposed in transit. Loopback is exempt: it
    // never leaves the machine, and local development has no certificate.
    const isLoopback =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !isLoopback) {
      return null;
    }

    return raw;
  }

  /**
   * Mint a custom token for this identity.
   *
   * Firebase Admin is initialised once by AuthService's constructor. Nest
   * instantiates singleton providers eagerly at bootstrap, so by the time any
   * request reaches this method that has already happened; the check below is
   * a guard against a failed initialisation, not against ordering.
   */
  async mintHandoff(user: AuthenticatedUser): Promise<HandoffResult> {
    const dashboardUrl = HandoffService.resolveDashboardUrl();
    if (!dashboardUrl) {
      // Not fatal: the console needs to be able to explain why it cannot
      // forward, which it can only do if this call still succeeds.
      this.logger.error(
        "PERMISSA_WEB_APP_URL is unset or is not an https origin. A signed-in " +
          "console session has nowhere to be forwarded to.",
      );
    }

    if (admin.apps.length === 0) {
      this.logger.error(
        "Firebase Admin is not initialised, so no custom token can be signed.",
      );
      throw new ServiceUnavailableException("HANDOFF_UNAVAILABLE");
    }

    let customToken: string;
    try {
      customToken = await admin.auth().createCustomToken(user.uid);
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      const message =
        err instanceof Error ? err.message : "unknown signing error";
      this.logger.error(
        `createCustomToken failed for ${user.uid}${
          code ? ` [${code}]` : ""
        }: ${message}`,
      );

      // Under Application Default Credentials there is no private key in the
      // process, so the Admin SDK signs through the IAM Credentials API. That
      // call is denied until the runtime service account may sign as itself,
      // and the raw error does not say which role is missing.
      if (/signBlob|iam|permission|denied/i.test(`${code ?? ""} ${message}`)) {
        this.logger.error(
          "Grant roles/iam.serviceAccountTokenCreator to the API's runtime " +
            "service account on itself. createCustomToken signs via the IAM " +
            "Credentials API when running on Application Default Credentials.",
        );
        throw new ServiceUnavailableException("HANDOFF_SIGNING_DENIED");
      }

      throw new ServiceUnavailableException("HANDOFF_UNAVAILABLE");
    }

    // The token itself is never logged. Only that one was issued, and to whom.
    this.logger.log(`Issued a dashboard handoff token for ${user.uid}.`);

    return {
      uid: user.uid,
      customToken,
      expiresInSeconds: HANDOFF_TOKEN_TTL_SECONDS,
      dashboardUrl,
      callbackPath: HANDOFF_CALLBACK_PATH,
    };
  }
}
