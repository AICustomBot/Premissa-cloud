import { useCallback, useState } from "react";
import {
  API_BASE_URL,
  ApiError,
  getHealth,
  listProjects,
  type ProjectSummary,
} from "./api.js";

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
  label: {
    display: "block",
    fontSize: 13,
    color: "#9aa4ad",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "9px 11px",
    borderRadius: 7,
    border: "1px solid #2b333b",
    background: "#0d1114",
    color: "#e7e9ea",
    fontSize: 14,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
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
};

export function App() {
  // Held in memory only. Never written to localStorage or sessionStorage, so
  // publishing this page cannot leak a credential.
  const [token, setToken] = useState("");
  const [health, setHealth] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Unexpected failure.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const onCheckHealth = () =>
    run(async () => {
      setProjects(null);
      const result = await getHealth();
      setHealth(JSON.stringify(result, null, 2));
    });

  const onListProjects = () =>
    run(async () => {
      if (!token.trim()) {
        throw new ApiError("Paste a Firebase ID token first.");
      }
      setHealth(null);
      const result = await listProjects(token.trim());
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
            {API_BASE_URL || "not configured — set VITE_API_BASE_URL"}
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
          <label style={styles.label} htmlFor="token">
            Firebase ID token
          </label>
          <input
            id="token"
            style={styles.input}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste a bearer token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div style={styles.row}>
            <button
              style={styles.button}
              onClick={onListProjects}
              disabled={busy}
            >
              Load projects
            </button>
          </div>

          {projects && projects.length === 0 && (
            <pre style={styles.pre}>
              No projects visible to this identity.
            </pre>
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
