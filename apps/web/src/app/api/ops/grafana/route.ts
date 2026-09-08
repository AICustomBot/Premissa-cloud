import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const mcpUrl = process.env.GRAFANA_MCP_URL?.trim() || "";
  const mcpToken = process.env.GRAFANA_MCP_TOKEN?.trim() || "";
  const isEnabled =
    process.env.GRAFANA_MCP_ENABLED === "true" ||
    (mcpUrl.length > 0 && mcpToken.length > 0);

  let status: "ONLINE" | "STANDBY" | "ERROR" = isEnabled ? "ONLINE" : "STANDBY";
  let latencyMs: number | null = null;
  let details = isEnabled
    ? "Grafana MCP Endpoint Active"
    : "Standby (Optional Telemetry)";

  if (isEnabled && mcpUrl) {
    try {
      const start = Date.now();
      // Optional ping probe to Grafana health/metrics endpoint if accessible
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${mcpUrl.replace(/\/$/, "")}/api/health`, {
        headers: {
          Authorization: `Bearer ${mcpToken}`,
        },
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (res && (res.ok || res.status === 401 || res.status === 403)) {
        latencyMs = Date.now() - start;
        status = res.ok ? "ONLINE" : "STANDBY";
        details = res.ok
          ? "Connected to Grafana Cloud"
          : "Auth Handshake Required";
      } else {
        latencyMs = Date.now() - start;
        details = "Endpoint Configured";
      }
    } catch {
      status = "STANDBY";
      details = "Standby (Endpoint unreachable or private VPC)";
    }
  }

  return NextResponse.json({
    provider: "Grafana Cloud MCP & OpenTelemetry",
    enabled: isEnabled,
    configured: isEnabled,
    status,
    latencyMs,
    details,
    endpoint: mcpUrl ? mcpUrl.replace(/\/\/.*@/, "//***@") : "Not configured",
    circuitBreaker: "FALLBACK_TO_INTERNAL_AUDIT",
  });
}
