import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { claimsApi, reportsApi, damageApi } from "../api/client";
import { logout, useCurrentUser } from "../hooks/useAuth";
import type { Claim, Report, DamageFinding } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function fmtMoney(val: number | null | undefined): string {
  if (val == null) return "—";
  return "EUR " + new Intl.NumberFormat("de-DE").format(val);
}

function getClaimNumber(id: string): string {
  return `CLM-${id.slice(0, 8).toUpperCase()}`;
}

// Pull typed value from JSONB section, return null if missing
function pick<T>(section: Record<string, unknown> | null, key: string): T | null {
  if (!section) return null;
  return (section[key] as T) ?? null;
}

// ─── UI atoms ─────────────────────────────────────────────────────────────────

/** Purple pill — marks fields whose values were extracted by AI from the interview */
function ExtractedBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: "#EDE9FE", color: "#6D28D9",
      fontSize: 11, fontWeight: 500,
      padding: "2px 9px", borderRadius: 20,
      whiteSpace: "nowrap", flexShrink: 0,
    }}>
      ✦ Extracted from interview — verify
    </span>
  );
}

interface FieldProps {
  label: string;
  value: React.ReactNode;
  extracted?: boolean;
}

function Field({ label, value, extracted }: FieldProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        marginBottom: 3,
      }}>
        <span style={{ fontSize: 12, color: "#9CA3AF", letterSpacing: "0.01em" }}>
          {label}
        </span>
        {extracted && <ExtractedBadge />}
      </div>
      <div style={{ fontSize: 14, color: "#111827", lineHeight: 1.55 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function SectionDivider() {
  return <hr style={{ border: "none", borderTop: "1px solid #F3F4F6", margin: "28px 0" }} />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 15, fontWeight: 700, color: "#111827",
      margin: "0 0 18px", letterSpacing: "-0.2px",
    }}>{children}</h2>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V6L12 2z"
        fill="#2563EB" fillOpacity="0.15" stroke="#2563EB" strokeWidth="1.5"/>
      <path d="M9 12l2 2 4-4" stroke="#2563EB" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
      <path d="M6 9l6 6 6-6" stroke="#6B7280" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="#2563EB" strokeWidth="1.5"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="19" x2="12" y2="23" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8" y1="23" x2="16" y2="23" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.75"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function SpinnerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#E5E7EB" strokeWidth="3"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Damage severity badge ────────────────────────────────────────────────────

const SEV_CFG = {
  red:   { bg: "#FEE2E2", color: "#991B1B", label: "Damage Confirmed" },
  amber: { bg: "#FEF3C7", color: "#B45309", label: "Worth Reviewing" },
  green: { bg: "#DCFCE7", color: "#166534", label: "Intact" },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function HQReportViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useCurrentUser();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [findings, setFindings] = useState<DamageFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [claimData, reportData] = await Promise.all([
        claimsApi.get(id),
        reportsApi.get(id),
      ]);
      setClaim(claimData);
      setReport(reportData);

      // Findings may not exist yet — fetch best-effort
      try {
        const fRes = await damageApi.list(id);
        setFindings(fRes.findings);
      } catch {
        // Findings not available — report still renders without them
      }
    } catch {
      setError("Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#9CA3AF", fontSize: 14, fontFamily: "system-ui, sans-serif", background: "#F9FAFB" }}>
        <SpinnerIcon /><span>Loading report…</span>
      </div>
    );
  }

  if (error || !claim || !report) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#DC2626", fontSize: 14, fontFamily: "system-ui, sans-serif", background: "#F9FAFB" }}>
        {error ?? "Report not found."}
      </div>
    );
  }

  // ── Extract typed data from JSONB sections ──────────────────────────────────
  const secA = report.section_a as Record<string, unknown> | null;
  const secB = report.section_b as Record<string, unknown> | null;
  const secC = report.section_c as Record<string, unknown> | null;
  const secG = report.section_g as Record<string, unknown> | null;

  const policyNumber  = pick<string>(secA, "policy_number")  ?? claim.policy.policy_number   ?? "—";
  const aiSummary     = pick<string>(secB, "ai_summary");
  const lastService   = pick<{ date: string; vendor: string }>(secB, "last_known_service");
  const equipId       = pick<string>(secC, "equipment_id");
  const manufacturer  = pick<string>(secC, "manufacturer")   ?? claim.equipment?.manufacturer ?? "—";
  const model         = pick<string>(secC, "model")          ?? claim.equipment?.model        ?? "—";
  const year          = pick<number>(secC, "year")           ?? claim.equipment?.year;
  const cadMatch      = pick<string>(secC, "cad_match_status") ?? claim.equipment?.cad_match_status ?? "—";
  const aiRec         = pick<string>(secG, "ai_recommendation");
  const aiRationale   = pick<string>(secG, "ai_rationale");
  const finSummary    = pick<{ confirmed_eur: number; pending_eur: number; total_claimed_eur: number }>(secG, "financial_summary");
  const adjDecision   = pick<string>(secG, "adjuster_decision");
  const adjNotes      = pick<string>(secG, "adjuster_notes");

  const coveragePeriod = claim.policy.coverage_start && claim.policy.coverage_end
    ? `${fmt(claim.policy.coverage_start)} – ${fmt(claim.policy.coverage_end)}`
    : "—";

  const claimNum = getClaimNumber(claim.id);
  const redFindings   = findings.filter(f => f.severity === "red");
  const amberFindings = findings.filter(f => f.severity === "amber");
  const greenFindings = findings.filter(f => f.severity === "green");

  const decisionColor = adjDecision === "concur" ? "#16A34A" : adjDecision === "override" ? "#D97706" : "#374151";

  return (
    <div className="rv-root">

      {/* ── Top nav ── */}
      <header className="rv-header">
        <div className="rv-header-left">
          <button className="rv-back" onClick={() => navigate(`/dashboard/claims/${id}`)}>
            <BackIcon />
          </button>
          <ShieldIcon />
          <div>
            <h1 className="rv-header-title">Inspection Report</h1>
            <span className="rv-header-sub">{claimNum}</span>
          </div>
        </div>
        <div className="rv-header-right">
          <span className="rv-header-user"><PersonIcon />{user?.name ?? "HQ"}</span>
          <button className="rv-logout" onClick={logout}><LogoutIcon />Logout</button>
          <button className="rv-download-btn">
            <DownloadIcon />
            Download PDF
          </button>
        </div>
      </header>

      {/* ── Report body ── */}
      <main className="rv-main">
        <div className="rv-paper">

          {/* ── Banner ── */}
          <div className="rv-banner">
            <div>
              <div className="rv-banner-title">Equipment Insurance Claim Report</div>
              <div className="rv-banner-sub">Claim Number: {claimNum}</div>
            </div>
            <div className="rv-banner-meta">
              <span className="rv-banner-meta-label">Generated by</span>
              <span className="rv-banner-meta-name">{claim.assigned_to?.name ?? "—"}</span>
              <span className="rv-banner-meta-date">
                {report.submitted_at ? fmt(report.submitted_at) : "—"}
              </span>
            </div>
          </div>

          {/* ══ Section A: Claim Summary ══════════════════════════════════════ */}
          <SectionTitle>Claim Summary</SectionTitle>
          <div className="rv-fields-2col">
            <Field label="Claim Number" value={claimNum} />
            <Field label="Policy Number" value={policyNumber} />
            <Field label="Company Name" value={claim.policy.holder_name} />
            <Field label="Coverage Period" value={coveragePeriod} />
            <Field label="Date of Report" value={fmt(report.submitted_at)} />
            <Field label="Claimed Amount" value={fmtMoney(claim.claimed_amount)} />
          </div>
          {aiSummary && (
            <Field
              label="Loss Description"
              value={<span className="rv-prose">{aiSummary}</span>}
              extracted
            />
          )}

          <SectionDivider />

          {/* ══ Section A: Policy Information ════════════════════════════════ */}
          <SectionTitle>Policy Information</SectionTitle>
          <div className="rv-fields-2col">
            <Field label="Policy Holder"   value={claim.policy.holder_name} />
            <Field label="Policy Number"   value={policyNumber} />
            <Field label="Coverage Period" value={coveragePeriod} />
            <Field label="Coverage Type"   value="Comprehensive Equipment Insurance" />
            <Field label="Sum Insured"     value={fmtMoney(claim.policy.insured_value)} />
            <Field label="Incident Type"   value={claim.policy.incident_type ?? "—"} />
          </div>

          <SectionDivider />

          {/* ══ Section C: Incident Details ═══════════════════════════════════ */}
          <SectionTitle>Incident Details</SectionTitle>
          <Field label="Location of Loss" value={claim.site_address} />
          <Field label="Site Contact"     value={claim.site_contact} />
          {lastService && (
            <Field
              label="Last Known Service"
              value={`${fmt(lastService.date)} — ${lastService.vendor}`}
              extracted
            />
          )}
          {aiSummary && (
            <Field
              label="Circumstances of Loss"
              value={<span className="rv-prose">{aiSummary}</span>}
              extracted
            />
          )}

          <SectionDivider />

          {/* ══ Section C: Equipment Assessment ══════════════════════════════ */}
          <SectionTitle>Equipment Assessment</SectionTitle>
          <div className="rv-fields-2col">
            <Field label="Equipment Type" value={claim.policy.equipment_type} />
            <Field label="Make / Model"   value={`${manufacturer} ${model}`} />
            <Field label="Year"           value={year ? String(year) : "—"} />
            <Field label="Equipment ID"   value={equipId ?? claim.equipment?.equipment_id_qr ?? "—"} />
            <Field label="CAD Reference Match" value={
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: cadMatch === "full" ? "#DCFCE7" : cadMatch === "partial" ? "#FEF9C3" : "#F3F4F6",
                color:      cadMatch === "full" ? "#166534" : cadMatch === "partial" ? "#92400E" : "#374151",
              }}>
                {cadMatch === "full" ? "Full match" : cadMatch === "partial" ? "Partial match" : "Not available"}
              </span>
            } />
          </div>

          <SectionDivider />

          {/* ══ Section D: Damage Analysis ════════════════════════════════════ */}
          <SectionTitle>Damage Analysis</SectionTitle>
          {findings.length === 0 ? (
            <p className="rv-empty">No damage findings recorded.</p>
          ) : (
            <>
              {redFindings.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="rv-sub-label">Confirmed Damage ({redFindings.length} component{redFindings.length > 1 ? "s" : ""})</div>
                  {redFindings.map(f => (
                    <div key={f.id} className="rv-finding rv-finding--red">
                      <div className="rv-finding-top">
                        <span className="rv-finding-component">{f.component_type.replace(/_/g, " ")}</span>
                        <span className="rv-finding-badge" style={{ background: SEV_CFG.red.bg, color: SEV_CFG.red.color }}>
                          {SEV_CFG.red.label}
                        </span>
                        {f.covered !== null && (
                          <span className="rv-finding-coverage" style={{
                            background: f.covered ? "#DCFCE7" : "#FEE2E2",
                            color:      f.covered ? "#166534" : "#991B1B",
                          }}>
                            {f.covered ? `Covered — ${f.policy_clause}` : "Not covered"}
                          </span>
                        )}
                      </div>
                      <div className="rv-finding-detail">
                        {f.deviation_type && <span>Type: {f.deviation_type}</span>}
                        {f.measurement != null && <span>Deviation: {f.measurement}mm</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {amberFindings.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="rv-sub-label">Worth Reviewing ({amberFindings.length} component{amberFindings.length > 1 ? "s" : ""})</div>
                  {amberFindings.map(f => (
                    <div key={f.id} className="rv-finding rv-finding--amber">
                      <div className="rv-finding-top">
                        <span className="rv-finding-component">{f.component_type.replace(/_/g, " ")}</span>
                        <span className="rv-finding-badge" style={{ background: SEV_CFG.amber.bg, color: SEV_CFG.amber.color }}>
                          {SEV_CFG.amber.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {greenFindings.length > 0 && (
                <div>
                  <div className="rv-sub-label">Intact ({greenFindings.length} component{greenFindings.length > 1 ? "s" : ""})</div>
                  <div className="rv-finding-tags">
                    {greenFindings.map(f => (
                      <span key={f.id} className="rv-finding-tag">{f.component_type.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <SectionDivider />

          {/* ══ Section G: Cost Estimation ════════════════════════════════════ */}
          <SectionTitle>Cost Estimation</SectionTitle>
          {finSummary ? (
            <table className="rv-cost-table">
              <tbody>
                <tr>
                  <td>Confirmed damage (covered components)</td>
                  <td className="rv-cost-amount">{fmtMoney(finSummary.confirmed_eur)}</td>
                </tr>
                {finSummary.pending_eur > 0 && (
                  <tr>
                    <td>Pending review (amber flags)</td>
                    <td className="rv-cost-amount rv-cost-amber">{fmtMoney(finSummary.pending_eur)}</td>
                  </tr>
                )}
                <tr className="rv-cost-divider">
                  <td>Total Claimed Amount</td>
                  <td className="rv-cost-amount">{fmtMoney(finSummary.total_claimed_eur)}</td>
                </tr>
                <tr className="rv-cost-total">
                  <td>Net Claim Amount</td>
                  <td className="rv-cost-amount">
                    {fmtMoney(finSummary.confirmed_eur + (finSummary.pending_eur ?? 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="rv-empty">Financial summary not yet available.</p>
          )}

          <SectionDivider />

          {/* ══ Section G: Recommendation ════════════════════════════════════ */}
          <SectionTitle>Recommendation</SectionTitle>

          {aiRec && (
            <div className="rv-rec-banner" style={{
              background: aiRec === "approve" ? "#DCFCE7" : aiRec === "escalate" ? "#FEF9C3" : "#FEE2E2",
              borderColor: aiRec === "approve" ? "#BBF7D0" : aiRec === "escalate" ? "#FDE68A" : "#FECACA",
              color: aiRec === "approve" ? "#166534" : aiRec === "escalate" ? "#92400E" : "#991B1B",
            }}>
              <span className="rv-rec-label">AI Recommendation</span>
              <span className="rv-rec-value">
                {aiRec.charAt(0).toUpperCase() + aiRec.slice(1)}
              </span>
            </div>
          )}

          {aiRationale && (
            <Field label="AI Rationale" value={<span className="rv-prose">{aiRationale}</span>} extracted />
          )}

          {adjDecision && (
            <div className="rv-adj-decision">
              <div className="rv-adj-label">Adjuster Decision</div>
              <span className="rv-adj-value" style={{ color: decisionColor }}>
                {adjDecision === "concur" ? "✓ Concur with AI recommendation" : "⚠ Override — see notes"}
              </span>
            </div>
          )}

          {adjNotes && (
            <Field label="Adjuster Notes" value={<span className="rv-prose">{adjNotes}</span>} />
          )}

          <SectionDivider />

          {/* ══ Interview Transcript (collapsible) ═══════════════════════════ */}
          <button
            className="rv-transcript-toggle"
            onClick={() => setTranscriptOpen(o => !o)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AudioIcon />
              <div>
                <div className="rv-transcript-title">Interview Transcript</div>
                {secB && pick<string>(secB, "transcript_ref") && (
                  <div className="rv-transcript-sub">Audio evidence reference available</div>
                )}
              </div>
            </div>
            <ChevronIcon open={transcriptOpen} />
          </button>

          {transcriptOpen && (
            <div className="rv-transcript-body">
              {secB && pick<string>(secB, "ai_summary") ? (
                <p className="rv-prose">{pick<string>(secB, "ai_summary")}</p>
              ) : (
                <p className="rv-empty">Transcript not available for this report.</p>
              )}
              {secB && pick<string>(secB, "transcript_ref") && (
                <div className="rv-transcript-ref">
                  <span>Verbatim transcript ref:</span>
                  <code>{pick<string>(secB, "transcript_ref")}</code>
                </div>
              )}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="rv-footer">
            <p>
              This report was generated using Mixed Reality inspection technology and AI-assisted
              data extraction. All AI-generated fields have been marked and should be verified by
              the reviewing adjuster.
            </p>
            <p>
              Generated on {report.submitted_at ? new Date(report.submitted_at).toLocaleString() : "—"} •
              Report ID: {claimNum}
            </p>
          </div>

        </div>
      </main>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .rv-root {
          min-height: 100vh;
          background: #F3F4F6;
          font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
          color: #111827;
        }

        /* ── Header ── */
        .rv-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          height: 64px;
          background: #fff;
          border-bottom: 1px solid #E5E7EB;
          position: sticky;
          top: 0;
          z-index: 10;
          gap: 16px;
        }

        .rv-header-left {
          display: flex; align-items: center; gap: 12px; min-width: 0;
        }

        .rv-back {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          border-radius: 8px; border: 1px solid #E5E7EB;
          background: #fff; cursor: pointer; flex-shrink: 0;
          transition: background 0.1s;
        }
        .rv-back:hover { background: #F3F4F6; }

        .rv-header-title {
          font-size: 16px; font-weight: 700; color: #111827;
          margin: 0; line-height: 1.2; letter-spacing: -0.3px;
        }

        .rv-header-sub { font-size: 11.5px; color: #6B7280; display: block; }

        .rv-header-right {
          display: flex; align-items: center; gap: 14px; flex-shrink: 0;
        }

        .rv-header-user {
          display: flex; align-items: center; gap: 6px;
          font-size: 13.5px; color: #374151; font-weight: 500;
        }

        .rv-logout {
          display: flex; align-items: center; gap: 5px;
          font-size: 13.5px; color: #6B7280;
          background: none; border: none; cursor: pointer;
          padding: 6px 8px; border-radius: 6px; font-family: inherit;
          transition: background 0.12s;
        }
        .rv-logout:hover { background: #F3F4F6; color: #374151; }

        .rv-download-btn {
          display: flex; align-items: center; gap: 7px;
          height: 36px; padding: 0 16px;
          background: #2563EB; color: #fff;
          border: none; border-radius: 8px;
          font-size: 13.5px; font-weight: 600;
          cursor: pointer; font-family: inherit;
          transition: background 0.12s;
          box-shadow: 0 1px 4px rgba(37,99,235,0.3);
        }
        .rv-download-btn:hover { background: #1D4ED8; }

        /* ── Main ── */
        .rv-main {
          padding: 32px;
          max-width: 860px;
          margin: 0 auto;
        }

        /* ── Paper ── */
        .rv-paper {
          background: #fff;
          border-radius: 14px;
          border: 1px solid #E5E7EB;
          padding: 0 0 32px;
          overflow: hidden;
        }

        /* ── Banner ── */
        .rv-banner {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 24px 32px;
          background: linear-gradient(135deg, #1D4ED8 0%, #2563EB 50%, #4338CA 100%);
          margin-bottom: 32px;
          gap: 16px;
        }

        .rv-banner-title {
          font-size: 17px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 4px;
          letter-spacing: -0.3px;
        }

        .rv-banner-sub {
          font-size: 13px;
          color: rgba(255,255,255,0.75);
        }

        .rv-banner-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 1px;
          text-align: right;
        }

        .rv-banner-meta-label {
          font-size: 11px;
          color: rgba(255,255,255,0.6);
        }

        .rv-banner-meta-name {
          font-size: 14px;
          font-weight: 600;
          color: #fff;
        }

        .rv-banner-meta-date {
          font-size: 12px;
          color: rgba(255,255,255,0.7);
        }

        /* ── Content padding ── */
        .rv-paper > *:not(.rv-banner):not(.rv-footer) {
          padding-left: 32px;
          padding-right: 32px;
        }

        .rv-paper hr { margin-left: 32px; margin-right: 32px; }

        /* ── Fields ── */
        .rv-fields-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 32px;
          margin-bottom: 4px;
        }

        .rv-prose {
          display: block;
          line-height: 1.65;
          color: #374151;
          font-size: 14px;
        }

        .rv-sub-label {
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 10px;
        }

        /* ── Findings ── */
        .rv-finding {
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 8px;
          border: 1px solid;
        }

        .rv-finding--red   { background: #FFF8F8; border-color: #FECACA; }
        .rv-finding--amber { background: #FFFDF5; border-color: #FDE68A; }

        .rv-finding-top {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .rv-finding-component {
          font-size: 13.5px;
          font-weight: 600;
          color: #111827;
          text-transform: capitalize;
        }

        .rv-finding-badge,
        .rv-finding-coverage {
          font-size: 11.5px;
          font-weight: 500;
          padding: 2px 9px;
          border-radius: 20px;
        }

        .rv-finding-detail {
          display: flex;
          gap: 16px;
          margin-top: 4px;
          font-size: 12.5px;
          color: #6B7280;
        }

        .rv-finding-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 4px;
        }

        .rv-finding-tag {
          background: #F0FDF4;
          color: #166534;
          border: 1px solid #BBF7D0;
          font-size: 12px;
          padding: 2px 10px;
          border-radius: 20px;
          text-transform: capitalize;
        }

        /* ── Cost table ── */
        .rv-cost-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 4px;
          font-size: 14px;
        }

        .rv-cost-table td {
          padding: 8px 0;
          border-bottom: 1px solid #F3F4F6;
          color: #374151;
        }

        .rv-cost-table td:last-child {
          text-align: right;
          font-variant-numeric: tabular-nums;
          font-weight: 500;
        }

        .rv-cost-amber { color: #D97706 !important; }

        .rv-cost-divider td {
          border-bottom: 2px solid #E5E7EB;
          padding-top: 12px;
        }

        .rv-cost-total td {
          font-weight: 700;
          font-size: 15px;
          color: #111827;
          border-bottom: none;
          padding-top: 10px;
        }

        /* ── Recommendation ── */
        .rv-rec-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: 10px;
          border: 1px solid;
          margin-bottom: 16px;
        }

        .rv-rec-label {
          font-size: 12px;
          font-weight: 500;
          opacity: 0.7;
        }

        .rv-rec-value {
          font-size: 15px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .rv-adj-decision {
          margin-bottom: 14px;
        }

        .rv-adj-label {
          font-size: 12px;
          color: #9CA3AF;
          margin-bottom: 3px;
        }

        .rv-adj-value {
          font-size: 14px;
          font-weight: 600;
        }

        /* ── Transcript toggle ── */
        .rv-transcript-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 14px 32px;
          background: #F9FAFB;
          border: none;
          border-top: 1px solid #E5E7EB;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.1s;
        }
        .rv-transcript-toggle:hover { background: #F3F4F6; }

        .rv-transcript-title {
          font-size: 14px;
          font-weight: 600;
          color: #111827;
        }

        .rv-transcript-sub {
          font-size: 12px;
          color: #6B7280;
          margin-top: 1px;
        }

        .rv-transcript-body {
          padding: 16px 32px;
          border-top: 1px solid #F3F4F6;
          background: #FAFAFA;
        }

        .rv-transcript-ref {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          font-size: 12px;
          color: #6B7280;
        }

        .rv-transcript-ref code {
          background: #F3F4F6;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11.5px;
          color: #374151;
        }

        /* ── Footer ── */
        .rv-footer {
          padding: 20px 32px 0;
          border-top: 1px solid #F3F4F6;
          margin-top: 8px;
        }

        .rv-footer p {
          font-size: 11.5px;
          color: #9CA3AF;
          margin: 0 0 4px;
          line-height: 1.6;
        }

        /* ── Utils ── */
        .rv-empty {
          font-size: 13.5px;
          color: #9CA3AF;
          margin: 0 0 12px;
          font-style: italic;
        }

        .rv-center {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 100vh;
          color: #9CA3AF;
          font-size: 14px;
        }

        .spinner { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 700px) {
          .rv-main { padding: 16px; }
          .rv-banner { flex-direction: column; }
          .rv-banner-meta { align-items: flex-start; text-align: left; }
          .rv-fields-2col { grid-template-columns: 1fr; }
          .rv-paper > *:not(.rv-banner):not(.rv-footer) { padding-left: 16px; padding-right: 16px; }
          .rv-header { padding: 0 16px; }
        }
      `}</style>
    </div>
  );
}