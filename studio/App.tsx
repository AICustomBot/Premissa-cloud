import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getApiBaseUrl,
  getHealth,
  listProjects,
  type ProjectSummary,
} from "./api.js";
import type { ConsoleConfig } from "./config.js";
import {
  describeAuthError,
  getIdToken,
  initAuth,
  readIdentity,
  signInWithGoogle,
  signOutOfConsole,
  watchAuthState,
  type ConsoleIdentity,
} from "./firebase.js";
import type { Auth, User } from "firebase/auth";

const styles = {
  page: {
    minHeight: "100vh",
    margin: 0,
    background: "#0b0d10",
    color: "#e7e9ea",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    lineHeight: 1.5,
  },
  shell: { maxWidth: 880, margin: "0 auto", padding: "48px 24px 72px" },
  h1: { fontSize: 28, margin: "0 0 4px", letterSpacing: "-0.01em" },
  sub: { color: "#9aa4ad", margin: "0 0 32px", fontSize: 15 },
  card: {
    background: "#14181d",
    border: "1px solid #232a31",
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
  },
  label: { display: "block", fontSize: 13, color: "#9aa4ad", marginBottom: 6 },
  row: { display: "flex", gap: 10, flexWrap: "wrap" as const, marginTop: 14 },
  button: {
    padding: "9px 16px",
    borderRadius: 7,
    border: "1px solid #2b333b",
    background: "#1d242b",
    color: "#e7e9ea",
    fontSize: 14,
    cursor: "pointer",
  },
  buttonPrimary: {
    padding: "10px 18px",
    borderRadius: 7,
    border: "1px solid #3b6ea5",
    background: "#1b4b7d",
    color: "#eaf2fa",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  pre: {
    margin: "14px 0 0",
    padding: 14,
    borderRadius: 7,
    background: "#0d1114",
    border: "1px solid #232a31",
    fontSize: 13,
    overflowX: "auto" as const,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  error: {
    margin: "14px 0 0",
    padding: 14,
    borderRadius: 7,
    background: "#2a1416",
    border: "1px solid #5b2126",
    color: "#ffb4b4",
    fontSize: 14,
  },
  warn: {
    margin: "14px 0 0",
    padding: 14,
    borderRadius: 7,
    background: "#1d1913",
    border: "1px solid #3d3320",
    color: "#e2cf9f",
    fontSize: 13.5,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    marginTop: 14,
    fontSize: 14,
  },
  th: {
    textAlign: "left" as const,
    padding: "8px 10px",
    borderBottom: "1px solid #2b333b",
    color: "#9aa4ad",
    fontWeight: 500,
  },
  td: { padding: "8px 10px", borderBottom: "1px solid #1c2228" },
  notice: {
    marginTop: 32,
    padding: 16,
    borderRadius: 8,
    border: "1px solid #3d3320",
    background: "#1d1913",
    color: "#e2cf9f",
    fontSize: 13.5,
  },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
  },
  identityGrid: {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: "6px 14px",
    fontSize: 14,
    marginTop: 4,
  },
  identityKey: { color: "#9aa4ad" },
};

export function App({ config }: { config: ConsoleConfig }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<ConsoleIdentity | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const firebase = config.firebase;
    if (!firebase) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    initAuth(firebase)
      .then((instance) => {
        if (cancelled) {
          return;
        }
        setAuth(instance);
        unsubscribe = watchAuthState(instance, (nextUser) => {
          setUser(nextUser);
          setAuthReady(true);
          if (!nextUser) {
            setIdentity(null);
            setProjects(null);
            return;
          }
          readIdentity(nextUser)
            .then(setIdentity)
            .catch(() => setIdentity(null));
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(describeAuthError(err));
          setAuthReady(true);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [config.firebase]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : describeAuthError(err),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const onSignIn = () =>
    run(async () => {
      if (!auth) {
        throw new ApiError("Authentication is not configured.");
      }
      await signInWithGoogle(auth);
    });

  const onSignOut = () =>
    run(async () => {
      if (!auth) {
        return;
      }
      await signOutOfConsole(auth);
      setHealth(null);
      setProjects(null);
    });

  const onCheckHealth = () =>
    run(async () => {
      setProjects(null);
      const result = await getHealth();
      setHealth(JSON.stringify(result, null, 2));
    });

  const onListProjects = () =>
    run(async () => {
      if (!user) {
        throw new ApiError("Sign in first.");
      }
      setHealth(null);
      // The SDK returns a valid token, refreshing it if the current one is
      // close to its one-hour expiry. No token is stored by this code.
      const token = await getIdToken(user);
      const result = await listProjects(token);
      setProjects(result.items ?? []);
    });

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <h1 style={styles.h1}>PERMISSA</h1>
        <p style={styles.sub}>
          Operator console for evidence-gated screenplay clearance research.
        </p>

        <div style={styles.card}>
          <span style={styles.label}>API base URL</span>
          <code style={styles.code}>
            {getApiBaseUrl() || "not configured"}
          </code>
          <div style={styles.row}>
            <button
              style={styles.button}
              onClick={onCheckHealth}
              disabled={busy}
            >
              Check API health
            </button>
          </div>
          {health && <pre style={styles.pre}>{health}</pre>}
        </div>

        <div style={styles.card}>
          <span style={styles.label}>Identity</span>

          {!config.firebase && (
            <div style={styles.warn}>
              {config.configError ??
                "Sign-in is unavailable because the Firebase web configuration is missing."}
            </div>
          )}

          {config.firebase && !authReady && (
            <p style={{ margin: 0, color: "#9aa4ad" }}>Loading session…</p>
          )}

          {config.firebase && authReady && !user && (
            <>
              <p style={{ margin: "0 0 4px" }}>
                Sign in with your Google account to use the console.
              </p>
              <div style={styles.row}>
                <button
                  style={styles.buttonPrimary}
                  onClick={onSignIn}
                  disabled={busy}
                >
                  Continue with Google
                </button>
              </div>
            </>
          )}

          {config.firebase && authReady && user && (
            <>
              <div style={styles.identityGrid}>
                <span style={styles.identityKey}>Signed in</span>
                <span>{identity?.email ?? user.email ?? user.uid}</span>
                <span style={styles.identityKey}>User ID</span>
                <code style={styles.code}>{user.uid}</code>
                <span style={styles.identityKey}>Role claim</span>
                <span>{identity?.role ?? "none"}</span>
                <span style={styles.identityKey}>Organisation</span>
                <span>{identity?.organizationId ?? "none"}</span>
              </div>

              {identity && (!identity.role || !identity.organizationId) && (
                <div style={styles.warn}>
                  This identity has no role and/or organisation claim, so the API
                  will treat it as a PRODUCER with no organisation scope. Grant
                  claims with <code style={styles.code}>npm run claims:set</code>
                  , then sign out and back in — custom claims only appear in
                  newly issued tokens.
                </div>
              )}

              <div style={styles.row}>
                <button
                  style={styles.button}
                  onClick={onListProjects}
                  disabled={busy}
                >
                  Load projects
                </button>
                <button
                  style={styles.button}
                  onClick={onSignOut}
                  disabled={busy}
                >
                  Sign out
                </button>
              </div>
            </>
          )}

          {projects && projects.length === 0 && (
            <pre style={styles.pre}>No projects visible to this identity.</pre>
          )}

          {projects && projects.length > 0 && (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Title</th>
                  <th style={styles.th}>Jurisdiction</th>
                  <th style={styles.th}>Version</th>
                  <th style={styles.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td style={styles.td}>{p.title ?? p.id}</td>
                    <td style={styles.td}>{p.jurisdiction ?? "—"}</td>
                    <td style={styles.td}>{p.version ?? "—"}</td>
                    <td style={styles.td}>
                      {p.createdAt ? p.createdAt.slice(0, 10) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.notice}>
          PERMISSA produces research support. It does not produce legal advice,
          legal opinions, clearance certification, or insurer/studio approval.
          Clearance status and confidence are determined server-side by a
          deterministic evidence gate and are never computed in this browser.
        </div>
      </div>
    </div>
  );
}
