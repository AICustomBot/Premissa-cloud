/**
 * Forwards a signed-in console session to the dashboard.
 *
 * The console's job in the product flow is sign-in and sign-up; the dashboard
 * lives in apps/web on its own Cloud Run service. This wrapper watches the
 * Firebase session and, once there is a usable one, exchanges it for a
 * transferable token and leaves for the dashboard.
 *
 * It wraps App rather than being folded into it so the operator console keeps
 * working as a diagnostic surface: append `?stay=1` to the console URL and no
 * forwarding happens, leaving the health check, identity panel and project
 * listing available for debugging a deployment.
 *
 * `?signedout=1` is the other escape hatch, and the dashboard's sign-out
 * depends on it. The two services are separate origins with separate Firebase
 * apps, so a dashboard sign-out leaves this session untouched -- and this gate
 * would forward it straight back, making sign-out look broken. That parameter
 * clears this session first.
 */
import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { App } from "./App.js";
import type { ConsoleConfig } from "./config.js";
import {
  getIdToken,
  initAuth,
  needsEmailVerification,
  signOutOfConsole,
  watchAuthState,
} from "./firebase.js";
import { buildHandoffUrl, requestHandoff } from "./handoff.js";

type Status =
  | { kind: "idle" }
  | { kind: "forwarding" }
  | { kind: "failed"; message: string };

const STAY_PARAM = "stay";

const SIGNED_OUT_PARAM = "signedout";

const styles = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0b0d10",
    color: "#e7e9ea",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    fontSize: 15,
    zIndex: 10,
  },
  banner: {
    margin: "0 auto",
    maxWidth: 880,
    padding: "14px 18px",
    borderRadius: 8,
    background: "#2a1416",
    border: "1px solid #5b2126",
    color: "#ffb4b4",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    fontSize: 14,
  },
};

function hasParam(name: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has(name);
}

function stayRequested(): boolean {
  return hasParam(STAY_PARAM);
}

/**
 * Remove the parameter once it has been acted on, so a reload or a later
 * sign-in is an ordinary visit rather than another sign-out.
 */
function stripSignedOutParam(): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete(SIGNED_OUT_PARAM);
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function HandoffGate({ config }: { config: ConsoleConfig }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Set from the URL on the first render, before any forwarding can start.
  const [clearingSession, setClearingSession] = useState(() =>
    hasParam(SIGNED_OUT_PARAM),
  );

  // watchAuthState also fires on every token refresh. Without this guard a
  // refresh an hour into a session would mint a second handoff and navigate
  // away from whatever the operator was doing.
  const attemptedUid = useState<{ current: string | null }>(() => ({
    current: null,
  }))[0];

  const forward = useCallback(async (user: User): Promise<void> => {
    const idToken = await getIdToken(user);
    const response = await requestHandoff(idToken);
    const target = buildHandoffUrl(response);
    if (!target) {
      throw new Error(
        "Signed in, but the API has no dashboard URL configured, so there is " +
          "nowhere to forward this session. Set PERMISSA_WEB_APP_URL on the " +
          "permissa-api service.",
      );
    }
    // replace rather than assign: the console must not sit in history behind
    // the dashboard, or Back would land on a page that forwards again.
    window.location.replace(target);
  }, []);

  // Runs before the forwarding effect can subscribe, because that effect is
  // gated on clearingSession.
  useEffect(() => {
    if (!clearingSession) {
      return;
    }

    const firebase = config.firebase;
    if (!firebase) {
      stripSignedOutParam();
      setClearingSession(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const instance = await initAuth(firebase);
        await signOutOfConsole(instance);
      } catch {
        // Nothing to clear, or Firebase is unreachable. Either way the
        // operator is not signed in here, which is the desired end state.
      } finally {
        if (!cancelled) {
          stripSignedOutParam();
          setClearingSession(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearingSession, config.firebase]);

  useEffect(() => {
    if (!config.firebase || stayRequested() || clearingSession) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    initAuth(config.firebase)
      .then((instance) => {
        if (cancelled) {
          return;
        }
        unsubscribe = watchAuthState(instance, (user) => {
          if (!user) {
            attemptedUid.current = null;
            setStatus({ kind: "idle" });
            return;
          }
          // App owns the verification panel: the API would refuse this
          // identity, so forwarding it would only move the error.
          if (needsEmailVerification(user)) {
            return;
          }
          if (attemptedUid.current === user.uid) {
            return;
          }
          attemptedUid.current = user.uid;
          setStatus({ kind: "forwarding" });
          forward(user).catch((err: unknown) => {
            if (cancelled) {
              return;
            }
            setStatus({
              kind: "failed",
              message:
                err instanceof Error
                  ? err.message
                  : "The dashboard handoff failed for an unknown reason.",
            });
          });
        });
      })
      .catch(() => {
        // App initialises Firebase itself and surfaces the same failure with
        // a fuller explanation; initAuth caches one instance for both.
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [config.firebase, clearingSession, forward, attemptedUid]);

  if (clearingSession) {
    return <div style={styles.overlay}>Signing out…</div>;
  }

  if (status.kind === "forwarding") {
    return <div style={styles.overlay}>Signing in to PERMISSA…</div>;
  }

  return (
    <>
      {status.kind === "failed" && (
        <div style={{ padding: "24px 24px 0" }}>
          <div style={styles.banner}>{status.message}</div>
        </div>
      )}
      <App config={config} />
    </>
  );
}
