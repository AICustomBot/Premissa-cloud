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
  MIN_PASSWORD_LENGTH,
  describeAuthError,
  getIdToken,
  initAuth,
  needsEmailVerification,
  readIdentity,
  refreshEmailVerification,
  registerWithEmailPassword,
  resendEmailVerification,
  sendPasswordReset,
  signInWithEmailPassword,
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
  buttonLink: {
    padding: 0,
    border: "none",
    background: "none",
    color: "#7fb0e0",
    fontSize: 13.5,
    cursor: "pointer",
    textDecoration: "underline",
  },
  tabs: {
    display: "flex",
    gap: 6,
    marginBottom: 16,
    borderBottom: "1px solid #232a31",
  },
  tab: {
    padding: "8px 12px",
    border: "none",
    background: "none",
    color: "#9aa4ad",
    fontSize: 14,
    cursor: "pointer",
    borderBottom: "2px solid transparent",
  },
  tabActive: {
    padding: "8px 12px",
    border: "none",
    background: "none",
    color: "#e7e9ea",
    fontSize: 14,
    cursor: "pointer",
    borderBottom: "2px solid #3b6ea5",
  },
  field: { marginBottom: 12 },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "9px 11px",
    borderRadius: 7,
    border: "1px solid #2b333b",
    background: "#0d1114",
    color: "#e7e9ea",
    fontSize: 14,
  },
  hint: { margin: "6px 0 0", color: "#77828b", fontSize: 12.5 },
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
  ok: {
    margin: "14px 0 0",
    padding: 14,
    borderRadius: 7,
    background: "#11201a",
    border: "1px solid #1f4634",
    color: "#9fdcbc",
    fontSize: 13.5,
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
  divider: {
    margin: "18px 0 14px",
    borderTop: "1px solid #232a31",
    paddingTop: 14,
    color: "#77828b",
    fontSize: 12.5,
  },
};

type AuthMode = "signin" | "register";

export function App({ config }: { config: ConsoleConfig }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<ConsoleIdentity | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [unverified, setUnverified] = useState(false);

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
            setUnverified(false);
            return;
          }
          setUnverified(needsEmailVerification(nextUser));
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
    setNotice(null);
    try {
      await fn();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const requireAuth = (): Auth => {
    if (!auth) {
      throw new ApiError("Authentication is not configured.");
    }
    return auth;
  };

  const onSignInWithGoogle = () =>
    run(async () => {
      await signInWithGoogle(requireAuth());
    });

  const onSubmitPassword = (event: React.FormEvent) => {
    event.preventDefault();
    return run(async () => {
      const instance = requireAuth();
      if (!email.trim()) {
        throw new ApiError("Enter your email address.");
      }
      if (mode === "register") {
        if (password.length < MIN_PASSWORD_LENGTH) {
          throw new ApiError(
            `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
          );
        }
        await registerWithEmailPassword(instance, email, password);
        setPassword("");
        setNotice(
          `Account created. A verification link was sent to ${email.trim()}. Open it, then choose "I have verified".`,
        );
        return;
      }
      await signInWithEmailPassword(instance, email, password);
      setPassword("");
    });
  };

  const onResetPassword = () =>
    run(async () => {
      const instance = requireAuth();
      if (!email.trim()) {
        throw new ApiError(
          "Enter the account's email address first, then request the reset.",
        );
      }
      await sendPasswordReset(instance, email);
      setNotice(
        `If an account exists for ${email.trim()}, a password reset link is on its way.`,
      );
    });

  const onResendVerification = () =>
    run(async () => {
      if (!user) {
        throw new ApiError("Sign in first.");
      }
      await resendEmailVerification(user);
      setNotice(`Verification link sent again to ${user.email ?? "this account"}.`);
    });

  const onConfirmVerified = () =>
    run(async () => {
      if (!user) {
        throw new ApiError("Sign in first.");
      }
      const verified = await refreshEmailVerification(user);
      setUnverified(!verified);
      if (verified) {
        setIdentity(await readIdentity(user));
        setNotice("Address verified. This session can now call the API.");
        return;
      }
      throw new ApiError(
        "This address is still unverified. Open the link in the email, then try again.",
      );
    });

  const onSignOut = () =>
    run(async () => {
      if (!auth) {
        return;
      }
      await signOutOfConsole(auth);
      setHealth(null);
      setProjects(null);
      setUnverified(false);
    });

  const onOpenDashboard = () =>
    run(async () => {
      if (!user) {
        throw new ApiError("Sign in first.");
      }
      const target = config.dashboardUrl;
      if (!target) {
        throw new ApiError(
          "The dashboard URL is not configured on this console.",
        );
      }
      // The SDK returns a valid token, refreshing it if the current one is
      // close to its one-hour expiry. The token travels in the URL fragment,
      // which is never sent to the dashboard's server or written to its
      // access logs.
      const token = await getIdToken(user);
      window.location.assign(`${target}/#handoff=${encodeURIComponent(token)}`);
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
      if (unverified) {
        throw new ApiError(
          "The API rejects password identities with an unverified address. Verify the address first.",
        );
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
          <code style={styles.code}>{getApiBaseUrl() || "not configured"}</code>
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
              <div style={styles.tabs}>
                <button
                  style={mode === "signin" ? styles.tabActive : styles.tab}
                  onClick={() => setMode("signin")}
                  disabled={busy}
                >
                  Sign in
                </button>
                <button
                  style={mode === "register" ? styles.tabActive : styles.tab}
                  onClick={() => setMode("register")}
                  disabled={busy}
                >
                  Create account
                </button>
              </div>

              <form onSubmit={onSubmitPassword}>
                <div style={styles.field}>
                  <label style={styles.label} htmlFor="console-email">
                    Email
                  </label>
                  <input
                    id="console-email"
                    style={styles.input}
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    required
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label} htmlFor="console-password">
                    Password
                  </label>
                  <input
                    id="console-password"
                    style={styles.input}
                    type="password"
                    autoComplete={
                      mode === "register" ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    required
                    minLength={mode === "register" ? MIN_PASSWORD_LENGTH : 1}
                  />
                  {mode === "register" && (
                    <p style={styles.hint}>
                      At least {MIN_PASSWORD_LENGTH} characters. A verification
                      link is sent immediately; the API refuses unverified
                      password accounts.
                    </p>
                  )}
                </div>
                <div style={styles.row}>
                  <button
                    style={styles.buttonPrimary}
                    type="submit"
                    disabled={busy}
                  >
                    {mode === "register" ? "Create account" : "Sign in"}
                  </button>
                  {mode === "signin" && (
                    <button
                      style={styles.buttonLink}
                      type="button"
                      onClick={onResetPassword}
                      disabled={busy}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
              </form>

              <div style={styles.divider}>or</div>
              <button
                style={styles.button}
                onClick={onSignInWithGoogle}
                disabled={busy}
              >
                Continue with Google
              </button>
            </>
          )}

          {config.firebase && authReady && user && (
            <>
              <div style={styles.identityGrid}>
                <span style={styles.identityKey}>Signed in</span>
                <span>{identity?.email ?? user.email ?? user.uid}</span>
                <span style={styles.identityKey}>User ID</span>
                <code style={styles.code}>{user.uid}</code>
                <span style={styles.identityKey}>Email verified</span>
                <span>{user.emailVerified ? "yes" : "no"}</span>
                <span style={styles.identityKey}>Role claim</span>
                <span>{identity?.role ?? "none"}</span>
                <span style={styles.identityKey}>Organisation</span>
                <span>{identity?.organizationId ?? "none"}</span>
              </div>

              {config.dashboardUrl && !unverified && (
                <>
                  <div style={styles.row}>
                    <button
                      style={styles.buttonPrimary}
                      onClick={onOpenDashboard}
                      disabled={busy}
                    >
                      Open Dashboard
                    </button>
                  </div>
                  <p style={styles.hint}>
                    Hands this signed-in session to the PERMISSA dashboard. The
                    token travels in the URL fragment, so it never reaches a
                    server or an access log.
                  </p>
                </>
              )}

              {unverified && (
                <div style={styles.warn}>
                  This address is not verified, so the API will reject it with
                  EMAIL_NOT_VERIFIED. Open the link sent to{" "}
                  {user.email ?? "your address"}, then confirm below.
                  <div style={styles.row}>
                    <button
                      style={styles.button}
                      onClick={onConfirmVerified}
                      disabled={busy}
                    >
                      I have verified
                    </button>
                    <button
                      style={styles.button}
                      onClick={onResendVerification}
                      disabled={busy}
                    >
                      Resend link
                    </button>
                  </div>
                </div>
              )}

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

        {notice && <div style={styles.ok}>{notice}</div>}
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
