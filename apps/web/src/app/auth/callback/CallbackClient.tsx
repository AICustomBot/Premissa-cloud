"use client";

/**
 * Completes the console -> dashboard handoff.
 *
 * Arrives as <dashboard>/auth/callback#permissa_handoff=<custom token>, signs
 * in with that token, and replaces itself with the dashboard. Nothing is
 * rendered from the token and it is never stored: the Firebase SDK owns the
 * session from the moment it is redeemed.
 */
import { useEffect, useRef, useState } from "react";
import { initAuth } from "../../../lib/auth";
import { loadWebConfig } from "../../../lib/config";
import {
  clearHandoffFragment,
  completeHandoff,
  describeHandoffError,
  readHandoffToken,
} from "../../../lib/handoff";

type State =
  | { kind: "working" }
  | { kind: "failed"; message: string };

export default function CallbackClient() {
  const [state, setState] = useState<State>({ kind: "working" });

  // React runs effects twice in development. The fragment is consumed and
  // erased on the first pass, so a second pass would find no token and report
  // a spurious failure over a sign-in that actually succeeded.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    // Read and erase before the first await, so the token is out of the
    // address bar even if the network calls below are slow or fail.
    const token = readHandoffToken(window.location.hash);
    clearHandoffFragment();

    if (!token) {
      setState({
        kind: "failed",
        message:
          "This link carried no sign-in token. Open the PERMISSA sign-in page and sign in again.",
      });
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const config = await loadWebConfig();
        if (!config.firebase) {
          throw new Error(
            config.configError ??
              "This app has no Firebase configuration, so sign-in cannot be completed.",
          );
        }
        const auth = await initAuth(config.firebase);
        await completeHandoff(auth, token);
        if (cancelled) {
          return;
        }
        // replace, not push: the callback URL must not be reachable with Back,
        // and its token is already spent.
        window.location.replace("/");
      } catch (err: unknown) {
        if (!cancelled) {
          setState({ kind: "failed", message: describeHandoffError(err) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      {state.kind === "working" ? (
        <p>Completing sign-in…</p>
      ) : (
        <div style={{ maxWidth: 520 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>
            Sign-in could not be completed
          </h1>
          <p style={{ opacity: 0.8 }}>{state.message}</p>
        </div>
      )}
    </main>
  );
}
