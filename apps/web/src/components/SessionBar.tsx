"use client";

/**
 * The dashboard's session control: who is signed in, and the way out.
 *
 * It exists because the dashboard had no way to sign out. ClientPage.tsx
 * watches the legacy default Firebase app -- which reports permanently
 * signed-out -- while the real session established by the console handoff
 * lives in the named "permissa-web" app owned by lib/auth.ts. The UI could
 * therefore never see the session it was running under.
 *
 * This reads that real session directly, and is mounted from the root layout
 * rather than from ClientPage. That keeps it independent of the ClientPage
 * rewire still to come, and means the way out cannot be broken by it.
 *
 * Email and role come from the verified token claims via readIdentity, not
 * from any local state, so what is displayed is what the API will see. It is
 * display only: the API re-verifies every request.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Auth } from "firebase/auth";
import {
  initAuth,
  readIdentity,
  signOutOfApp,
  watchAuthState,
  type Identity,
} from "../lib/auth";
import { loadWebConfig } from "../lib/config";

/**
 * Tells the console to end its own session before it forwards anything.
 *
 * Without it, sign-out would look broken: the console is a separate origin
 * with its own Firebase app, so its session survives this one, and its
 * HandoffGate forwards any live session straight back to the dashboard.
 */
const SIGNED_OUT_PARAM = "signedout";

const styles = {
  wrap: {
    position: "fixed" as const,
    right: 16,
    bottom: 16,
    zIndex: 60,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px 8px 14px",
    borderRadius: 999,
    background: "rgba(12, 14, 18, 0.92)",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    boxShadow: "0 6px 24px rgba(0, 0, 0, 0.35)",
    color: "#e7e9ea",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    fontSize: 13,
    lineHeight: 1.3,
    backdropFilter: "blur(6px)",
  },
  identity: { display: "flex", flexDirection: "column" as const, gap: 2 },
  email: { fontWeight: 600 },
  role: { opacity: 0.65, fontSize: 11, letterSpacing: 0.2 },
  button: {
    appearance: "none" as const,
    cursor: "pointer",
    borderRadius: 999,
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(255, 255, 255, 0.08)",
    color: "inherit",
    font: "inherit",
    fontWeight: 600,
    padding: "6px 12px",
  },
  link: {
    borderRadius: 999,
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(255, 255, 255, 0.08)",
    color: "inherit",
    fontWeight: 600,
    padding: "6px 12px",
    textDecoration: "none",
  },
  error: { color: "#ffb4b4", maxWidth: 320 },
};

function signInHref(consoleUrl: string | null): string | null {
  return consoleUrl ? `${consoleUrl}/` : null;
}

function signedOutHref(consoleUrl: string | null): string | null {
  return consoleUrl ? `${consoleUrl}/?${SIGNED_OUT_PARAM}=1` : null;
}

export default function SessionBar() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [consoleUrl, setConsoleUrl] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authRef = useRef<Auth | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        const config = await loadWebConfig();
        if (cancelled) {
          return;
        }
        setConsoleUrl(config.consoleUrl ?? null);

        const firebase = config.firebase;
        if (!firebase) {
          // Not this component's failure to report loudly: the page itself
          // surfaces a missing config. Staying quiet avoids a second banner.
          return;
        }

        const instance = await initAuth(firebase);
        if (cancelled) {
          return;
        }
        authRef.current = instance;

        unsubscribe = watchAuthState(instance, (user) => {
          if (!user) {
            setIdentity(null);
            return;
          }
          void readIdentity(user)
            .then((next) => {
              if (!cancelled) {
                setIdentity(next);
              }
            })
            .catch(() => {
              // The claims read failed, but the session is real. Show what is
              // known rather than pretending nobody is signed in, or the way
              // out would disappear again.
              if (!cancelled) {
                setIdentity({
                  uid: user.uid,
                  email: user.email,
                  displayName: user.displayName,
                  role: null,
                  organizationId: null,
                });
              }
            });
        });
      } catch {
        // Same reasoning as above: the page reports configuration failures.
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    setError(null);
    try {
      const instance = authRef.current;
      if (instance) {
        await signOutOfApp(instance);
      }
      const target = signedOutHref(consoleUrl);
      if (target) {
        // replace, not assign: a signed-out dashboard must not be reachable
        // with Back.
        window.location.replace(target);
        return;
      }
      // No console origin configured. The session is genuinely ended, so
      // reload to drop every in-memory trace of it.
      window.location.reload();
    } catch (err: unknown) {
      setSigningOut(false);
      setError(
        err instanceof Error
          ? `Sign-out failed: ${err.message}`
          : "Sign-out failed for an unknown reason.",
      );
    }
  }, [consoleUrl]);

  if (!identity) {
    const href = signInHref(consoleUrl);
    if (!href) {
      return null;
    }
    return (
      <div style={styles.wrap}>
        <div style={styles.identity}>
          <span style={styles.email}>Not signed in</span>
          <span style={styles.role}>This view shows no tenant data</span>
        </div>
        <a style={styles.link} href={href}>
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.identity}>
        <span style={styles.email}>{identity.email ?? identity.uid}</span>
        <span style={styles.role}>
          {identity.role ?? "NO ROLE CLAIM"}
          {identity.organizationId ? ` · ${identity.organizationId}` : ""}
        </span>
      </div>
      {error && <span style={styles.error}>{error}</span>}
      <button
        type="button"
        style={styles.button}
        onClick={() => {
          void handleSignOut();
        }}
        disabled={signingOut}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
