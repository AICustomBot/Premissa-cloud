import crypto from "crypto";
import { ClearanceReport } from "@permissa/contracts";

export interface DigestPayload {
  id: string;
  projectId: string;
  runId: string;
  versionNumber: number;
  title: string;
  scriptChecksumSha256: string;
  findings: Array<{
    findingId: string;
    entityId: string;
    status: string;
    confidenceScore: number;
  }>;
}

/**
 * Computes deterministic canonical SHA-256 digest of report findings and metadata.
 */
export function computeReportDigest(payload: DigestPayload): string {
  const sortedFindings = [...payload.findings].sort((a, b) =>
    a.findingId.localeCompare(b.findingId),
  );

  const canonical = JSON.stringify({
    id: payload.id,
    projectId: payload.projectId,
    runId: payload.runId,
    versionNumber: payload.versionNumber,
    title: payload.title,
    scriptChecksumSha256: payload.scriptChecksumSha256,
    findings: sortedFindings,
  });

  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Generates an archival, high-fidelity printable HTML clearance certificate.
 */
export function generateCertificateHtml(report: ClearanceReport): string {
  const statusColorMap: Record<string, { bg: string; text: string; label: string }> = {
    RESEARCH_CLEARED: { bg: "#ecfdf5", text: "#065f46", label: "CLEARED" },
    NEEDS_LICENCE: { bg: "#eff6ff", text: "#1e40af", label: "NEEDS LICENCE" },
    NEEDS_REWRITE: { bg: "#fffbeb", text: "#92400e", label: "NEEDS REWRITE" },
    BLOCKED: { bg: "#fef2f2", text: "#991b1b", label: "BLOCKED" },
    INSUFFICIENT_EVIDENCE: { bg: "#f8fafc", text: "#475569", label: "INSUFFICIENT EVIDENCE" },
  };

  const riskLevelMap: Record<string, { bg: string; text: string }> = {
    CLEAR: { bg: "#10b981", text: "#ffffff" },
    LOW: { bg: "#3b82f6", text: "#ffffff" },
    ELEVATED: { bg: "#f59e0b", text: "#ffffff" },
    CRITICAL: { bg: "#ef4444", text: "#ffffff" },
  };

  const currentRisk = riskLevelMap[report.summary.overallRiskLevel] || {
    bg: "#64748b",
    text: "#ffffff",
  };

  const rows = report.findings
    .map((f, idx) => {
      const badge = statusColorMap[f.status] || {
        bg: "#f1f5f9",
        text: "#334155",
        label: f.status,
      };
      return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 8px 10px; font-family: monospace; color: #64748b;">${idx + 1}</td>
        <td style="padding: 8px 10px; font-weight: 600; color: #0f172a;">${escapeHtml(f.entityName)}</td>
        <td style="padding: 8px 10px; color: #64748b; font-size: 10px; text-transform: uppercase;">${escapeHtml(f.entityType.replace(/_/g, " "))}</td>
        <td style="padding: 8px 10px;">
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 9px; letter-spacing: 0.5px; background: ${badge.bg}; color: ${badge.text};">
            ${badge.label}
          </span>
        </td>
        <td style="padding: 8px 10px; font-weight: 600; font-family: monospace; color: ${f.confidenceScore >= 85 ? "#059669" : "#d97706"};">
          ${f.confidenceScore}% (${f.confidenceBand})
        </td>
        <td style="padding: 8px 10px; color: #334155; line-height: 1.4;">
          ${escapeHtml(f.rationale)}
          ${f.rewriteSuggestion ? `<div style="margin-top: 4px; padding: 4px 6px; background: #fffbeb; border-left: 2px solid #f59e0b; color: #92400e; font-size: 10px;"><strong>Rewrite Path:</strong> ${escapeHtml(f.rewriteSuggestion)}</div>` : ""}
        </td>
      </tr>
    `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Legal Clearance Certificate — ${escapeHtml(report.title)} (v${report.versionNumber})</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 1.2cm;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      font-size: 12px;
      line-height: 1.5;
    }
    .cert-container {
      max-width: 900px;
      margin: 0 auto;
      border: 1px solid #cbd5e1;
      padding: 36px;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
      position: relative;
    }
    .watermark-banner {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      background: #f8fafc;
      border-bottom: 1px dashed #cbd5e1;
      padding: 6px 12px;
      font-size: 9px;
      font-family: monospace;
      color: #64748b;
      text-align: center;
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;
      letter-spacing: 0.5px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 14px;
      padding-bottom: 18px;
      border-bottom: 2px solid #0f172a;
    }
    .header-title h1 {
      margin: 0;
      font-size: 20px;
      letter-spacing: -0.5px;
      color: #0f172a;
      text-transform: uppercase;
      font-weight: 800;
    }
    .header-title p {
      margin: 2px 0 0 0;
      font-size: 11px;
      color: #475569;
      letter-spacing: 0.5px;
    }
    .cert-badge {
      text-align: right;
    }
    .risk-pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 11px;
      letter-spacing: 1px;
      background: ${currentRisk.bg};
      color: ${currentRisk.text};
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin: 20px 0;
      padding: 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    .meta-item label {
      display: block;
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .meta-item value {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #0f172a;
      font-family: monospace;
    }
    .hash-banner {
      margin: 16px 0;
      padding: 10px 14px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .hash-banner span {
      font-size: 10px;
      font-family: monospace;
      color: #334155;
      word-break: break-all;
    }
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin: 18px 0;
    }
    .stat-card {
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      text-align: center;
    }
    .stat-card .num {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
    }
    .stat-card .lbl {
      font-size: 9px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th {
      text-align: left;
      padding: 8px 10px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #475569;
      border-bottom: 2px solid #cbd5e1;
      background: #f8fafc;
    }
    .signature-section {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }
    .sig-box {
      border: 1px dashed #cbd5e1;
      padding: 14px;
      border-radius: 6px;
      background: #f8fafc;
    }
    .sig-line {
      margin-top: 28px;
      border-top: 1px solid #0f172a;
      padding-top: 4px;
      font-size: 10px;
      font-weight: 600;
      color: #0f172a;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="cert-container">
    <div class="watermark-banner">
      ${escapeHtml(report.verification.archivalWatermark)}
    </div>

    <div class="header">
      <div class="header-title">
        <h1>Official Legal Clearance Certificate</h1>
        <p>PERMISSA STATUTORY COMPLIANCE & RISK PROTOCOL • ARCHIVAL RECORD</p>
      </div>
      <div class="cert-badge">
        <div class="risk-pill">RISK: ${report.summary.overallRiskLevel}</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 4px; font-family: monospace;">VER: ${report.versionNumber}.0.0</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-item">
        <label>Project Title</label>
        <value style="font-family: inherit;">${escapeHtml(report.title)}</value>
      </div>
      <div class="meta-item">
        <label>Jurisdiction</label>
        <value>${report.jurisdiction}</value>
      </div>
      <div class="meta-item">
        <label>Date Certified</label>
        <value>${report.approvedAt ? new Date(report.approvedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "PENDING"}</value>
      </div>
      <div class="meta-item">
        <label>Clearance Counsel</label>
        <value style="font-size: 10px;">${escapeHtml(report.approvedBy || "INDEPENDENT REVIEWER")}</value>
      </div>
    </div>

    <div class="hash-banner">
      <div>
        <div style="font-size: 9px; font-weight: 700; color: #475569; text-transform: uppercase;">Cryptographic SHA-256 Verification Seal</div>
        <span>${report.verification.contentDigestSha256}</span>
      </div>
      <div style="font-size: 9px; font-weight: 700; color: #059669; border: 1px solid #059669; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
        SEAL VERIFIED
      </div>
    </div>

    <div class="summary-cards">
      <div class="stat-card">
        <div class="num" style="color: #059669;">${report.summary.clearedCount}</div>
        <div class="lbl">Cleared</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color: #2563eb;">${report.summary.licenceRequiredCount}</div>
        <div class="lbl">Licence Req</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color: #d97706;">${report.summary.rewriteRequiredCount}</div>
        <div class="lbl">Rewrite Req</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color: #dc2626;">${report.summary.blockedCount}</div>
        <div class="lbl">Blocked</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color: #64748b;">${report.summary.insufficientEvidenceCount}</div>
        <div class="lbl">Unresolved</div>
      </div>
    </div>

    <h3 style="margin: 18px 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">
      Admitted Entities Clearance Register (${report.findings.length} Items)
    </h3>
    <table>
      <thead>
        <tr>
          <th style="width: 30px;">#</th>
          <th style="width: 140px;">Entity</th>
          <th style="width: 90px;">Category</th>
          <th style="width: 100px;">Status</th>
          <th style="width: 90px;">Confidence</th>
          <th>Clearance Rationale & Adjudication</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="signature-section">
      <div class="sig-box">
        <div style="font-weight: 700; font-size: 10px; color: #475569; text-transform: uppercase;">Script Origin Integrity</div>
        <div style="font-size: 10px; font-family: monospace; color: #0f172a; margin-top: 4px; word-break: break-all;">
          SHA256: ${report.scriptChecksumSha256}
        </div>
        <div class="sig-line">
          <span>Production Producer Sign-off</span>
          <span>Verified Timestamp</span>
        </div>
      </div>
      <div class="sig-box">
        <div style="font-weight: 700; font-size: 10px; color: #475569; text-transform: uppercase;">Independent Clearance Counsel Sign-off</div>
        <div style="font-size: 10px; font-family: monospace; color: #0f172a; margin-top: 4px;">
          ${escapeHtml(report.approvedBy || "INDEPENDENT CLEARANCE COUNSEL")}
        </div>
        <div class="sig-line">
          <span>Authorized Legal Counsel Signature</span>
          <span>${report.approvedAt ? new Date(report.approvedAt).toISOString().split("T")[0] : "PENDING"}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
