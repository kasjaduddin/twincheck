import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { claimsApi } from "../api/client";
import { logout, useCurrentUser } from "../hooks/useAuth";
import type { Claim, ClaimStatus } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatCurrency(val: number): string {
  return "EUR " + new Intl.NumberFormat("de-DE").format(val);
}

function getClaimNumber(id: string): string {
  return `CLM-${id.slice(0, 8).toUpperCase()}`;
}

// Extract phone number digits for tel: link
function telLink(contact: string): string {
  const match = contact.match(/[\d\s\-\+()]+/);
  return match ? `tel:${match[0].replace(/\s/g, "")}` : "#";
}

// Google Maps link for address
function mapsLink(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

// ─── Hero card config per status ─────────────────────────────────────────────

interface HeroConfig {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaEnabled: boolean;
  bgFrom: string;
  bgTo: string;
}

function getHeroConfig(status: ClaimStatus): HeroConfig {
  switch (status) {
    case "assigned":
      return {
        title: "Ready for Inspection",
        subtitle: "Start Mixed Reality session to scan equipment and assess damage",
        ctaLabel: "Start Inspection",
        ctaEnabled: true,
        bgFrom: "#2563EB",
        bgTo: "#1D3FAA",
      };
    case "on_site":
      return {
        title: "Inspection In Progress",
        subtitle: "Continue your Mixed Reality inspection session",
        ctaLabel: "Continue Inspection",
        ctaEnabled: true,
        bgFrom: "#7C3AED",
        bgTo: "#5B21B6",
      };
    case "completed":
    case "ready_for_review":
    case "under_review":
    case "approved":
    case "escalated":
    case "rejected":
      return {
        title: "Inspection Completed",
        subtitle: "Report has been submitted and is under review by HQ",
        ctaLabel: "View Submitted Report",
        ctaEnabled: false,
        bgFrom: "#374151",
        bgTo: "#1F2937",
      };
    default:
      return {
        title: "Not Yet Available",
        subtitle: "This claim is not yet ready for inspection",
        ctaLabel: "Start Inspection",
        ctaEnabled: false,
        bgFrom: "#6B7280",
        bgTo: "#4B5563",
      };
  }
}

// ─── Status badge config ─────────────────────────────────────────────────────

const STATUS_CFG: Record<ClaimStatus, { label: string; bg: string; color: string; border: string }> = {
  unassigned:            { label: "Unassigned",       bg: "#F3F4F6", color: "#374151", border: "#E5E7EB" },
  assigned:              { label: "Assigned",         bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  on_site:               { label: "On-site",          bg: "#EDE9FE", color: "#6D28D9", border: "#DDD6FE" },
  completed:             { label: "Completed",        bg: "#D1FAE5", color: "#065F46", border: "#A7F3D0" },
  ready_for_review:      { label: "Ready for Review", bg: "#FEF9C3", color: "#92400E", border: "#FDE68A" },
  reconstruction_failed: { label: "Recon. Failed",   bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" },
  under_review:          { label: "Under Review",    bg: "#FFEDD5", color: "#C2410C", border: "#FED7AA" },
  approved:              { label: "Approved",         bg: "#DCFCE7", color: "#166534", border: "#BBF7D0" },
  escalated:             { label: "Escalated",        bg: "#FEF3C7", color: "#B45309", border: "#FDE68A" },
  rejected:              { label: "Rejected",         bg: "#FFE4E6", color: "#9F1239", border: "#FECDD3" },
};

const PRE_INSPECTION_NOTES = [
  "Verify policy holder identity on arrival",
  "Confirm equipment serial numbers match policy",
  "Document all visible damage before MR scan",
  "Record comprehensive interview",
];

// ─── Icons ───────────────────────────────────────────────────────────────────

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
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

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function ScanBracketsIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <path d="M4 12V6a2 2 0 0 1 2-2h6" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M32 12V6a2 2 0 0 0-2-2h-6" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M4 24v6a2 2 0 0 0 2 2h6" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M32 24v6a2 2 0 0 1-2 2h-6" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function PinIcon({ color = "#9CA3AF" }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke={color} strokeWidth="1.75"/>
      <circle cx="12" cy="10" r="3" stroke={color} strokeWidth="1.75"/>
    </svg>
  );
}

function PhoneIcon({ color = "#9CA3AF" }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.7 13.5 19.79 19.79 0 0 1 1.63 4.87 2 2 0 0 1 3.6 2.69h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.1a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
        stroke={color} strokeWidth="1.75"/>
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        stroke="#9CA3AF" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function MoneyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <line x1="12" y1="1" x2="12" y2="23" stroke="#16A34A" strokeWidth="1.75" strokeLinecap="round"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
        stroke="#16A34A" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="#9CA3AF" strokeWidth="1.5"/>
      <line x1="16" y1="2" x2="16" y2="6" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8"  y1="2" x2="8"  y2="6" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="3"  y1="10" x2="21" y2="10" stroke="#9CA3AF" strokeWidth="1.5"/>
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#9CA3AF" strokeWidth="1.5"/>
      <polyline points="14 2 14 8 20 8" stroke="#9CA3AF" strokeWidth="1.5"/>
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <polyline points="15 3 21 3 21 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function CheckCircleIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
        stroke={color} strokeWidth="1.75" strokeLinecap="round"/>
      <polyline points="22 4 12 14.01 9 11.01"
        stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}


function SpinnerIcon() {
  return (
    <svg className="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#E5E7EB" strokeWidth="3"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdjusterClaimDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useCurrentUser(); // session guard — keeps auth state active

  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClaim = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await claimsApi.get(id);
      setClaim(data);
    } catch {
      setError("Failed to load claim details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchClaim(); }, [fetchClaim]);

  function handleStartInspection() {
    // Deep link to MR App — UC-01 entry point
    navigate(`/inspect/${id}`);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#9CA3AF", fontSize: 14, fontFamily: "system-ui, sans-serif", background: "#F9FAFB" }}>
        <SpinnerIcon /><span>Loading…</span>
      </div>
    );
  }

  if (error || !claim) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#DC2626", fontSize: 14, fontFamily: "system-ui, sans-serif", background: "#F9FAFB" }}>
        {error ?? "Claim not found."}
      </div>
    );
  }

  const claimNum  = getClaimNumber(claim.id);
  const statusCfg = STATUS_CFG[claim.status];
  const hero      = getHeroConfig(claim.status);
  const equipment = claim.equipment;

  const coveragePeriod = claim.policy.coverage_start && claim.policy.coverage_end
    ? `${formatDate(claim.policy.coverage_start)} – ${formatDate(claim.policy.coverage_end)}`
    : "—";

  // CAD match display
  const cadMatchLabel =
    equipment?.cad_match_status === "full"    ? "Verified" :
    equipment?.cad_match_status === "partial" ? "Partial match" :
    equipment ? "Not available" : "Pending QR scan";

  const cadMatchColor =
    equipment?.cad_match_status === "full"    ? "#16A34A" :
    equipment?.cad_match_status === "partial" ? "#D97706" : "#6B7280";

  const cadMatchBg =
    equipment?.cad_match_status === "full"    ? "#DCFCE7" :
    equipment?.cad_match_status === "partial" ? "#FEF3C7" : "#F3F4F6";

  return (
    <div className="acd-root">

      {/* ── Header ── */}
      <header className="acd-header">
        <div className="acd-header-left">
          <button className="acd-back" onClick={() => navigate("/claims")}>
            <BackIcon />
          </button>
          <ShieldIcon />
          <div>
            <h1 className="acd-title">{claimNum}</h1>
            <span className="acd-sub">Claim Details</span>
          </div>
        </div>
        <div className="acd-header-right">
          <span
            className="acd-status-badge"
            style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}` }}
          >
            {statusCfg.label}
          </span>
          <button className="acd-logout" onClick={logout}>
            <LogoutIcon />
            Logout
          </button>
        </div>
      </header>

      {/* ── 2-col layout ── */}
      <main className="acd-main">

        {/* ── LEFT COLUMN ── */}
        <div className="acd-left">

          {/* Hero CTA card */}
          <div
            className="acd-hero"
            style={{ background: `linear-gradient(135deg, ${hero.bgFrom} 0%, ${hero.bgTo} 100%)` }}
          >
            <div className="acd-hero-top">
              <div>
                <h2 className="acd-hero-title">{hero.title}</h2>
                <p className="acd-hero-sub">{hero.subtitle}</p>
              </div>
              <div className="acd-hero-brackets">
                <ScanBracketsIcon />
              </div>
            </div>

            <button
              className="acd-hero-btn"
              onClick={handleStartInspection}
              disabled={!hero.ctaEnabled}
            >
              <ScanIcon />
              {hero.ctaLabel}
            </button>
          </div>

          {/* Claim Information */}
          <div className="acd-card">
            <h2 className="acd-card-title">Claim Information</h2>

            {/* Site Address */}
            <div className="acd-field acd-field--bordered">
              <div className="acd-field-label-row">
                <PinIcon />
                <span className="acd-field-label">Site Address</span>
              </div>
              <div className="acd-field-value-row">
                <span className="acd-field-value">{claim.site_address}</span>
                <a
                  href={mapsLink(claim.site_address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="acd-maps-link"
                >
                  <ExternalLinkIcon />
                  Open Maps
                </a>
              </div>
            </div>

            {/* Site Contact */}
            <div className="acd-field acd-field--bordered">
              <div className="acd-field-label-row">
                <PhoneIcon />
                <span className="acd-field-label">Site Contact</span>
              </div>
              <span className="acd-field-value">{claim.site_contact}</span>
            </div>

            {/* Equipment Type */}
            <div className="acd-field acd-field--bordered">
              <div className="acd-field-label-row">
                <WrenchIcon />
                <span className="acd-field-label">Equipment Type</span>
              </div>
              <span className="acd-field-value">{claim.policy.equipment_type}</span>
            </div>

            {/* Insured Value */}
            <div className="acd-field acd-field--bordered">
              <div className="acd-field-label-row">
                <MoneyIcon />
                <span className="acd-field-label">Insured Value</span>
              </div>
              <span className="acd-field-value acd-field-value--money">
                {formatCurrency(claim.policy.insured_value)}
              </span>
            </div>

            {/* Coverage Period */}
            <div className="acd-field acd-field--bordered">
              <div className="acd-field-label-row">
                <CalendarIcon />
                <span className="acd-field-label">Coverage Period</span>
              </div>
              <span className="acd-field-value">{coveragePeriod}</span>
            </div>

            {/* Claimed Amount */}
            <div className="acd-field acd-field--bordered">
              <div className="acd-field-label-row">
                <MoneyIcon />
                <span className="acd-field-label">Claimed Amount</span>
              </div>
              <span className="acd-field-value acd-field-value--money">
                {formatCurrency(claim.claimed_amount)}
              </span>
            </div>

            {/* Policy Number */}
            <div className="acd-field">
              <div className="acd-field-label-row">
                <DocIcon />
                <span className="acd-field-label">Policy Number</span>
              </div>
              <span className="acd-field-value">{claim.policy.policy_number ?? "—"}</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="acd-right">

          {/* CAD Reference */}
          <div className="acd-card">
            <h2 className="acd-card-title">CAD Reference</h2>

            <div className="acd-sidebar-field">
              <span className="acd-sidebar-label">Model ID</span>
              <div className="acd-model-id-box">
                {equipment?.equipment_id_qr ?? "Not yet scanned"}
              </div>
            </div>

            <div className="acd-sidebar-field">
              <span className="acd-sidebar-label">Status</span>
              <span
                className="acd-cad-badge"
                style={{ background: cadMatchBg, color: cadMatchColor }}
              >
                {equipment?.cad_match_status === "full" && (
                  <CheckCircleIcon color={cadMatchColor} />
                )}
                {cadMatchLabel}
              </span>
            </div>

            <div className="acd-sidebar-field">
              <span className="acd-sidebar-label">Last Updated</span>
              <span className="acd-sidebar-value">
                {equipment ? equipment.created_at.slice(0, 16).replace("T", " ") : "—"}
              </span>
            </div>

            <div
              className="acd-cad-note"
              style={{
                background: equipment?.cad_match_status === "full" ? "#F0FDF4" : "#F9FAFB",
                borderColor: equipment?.cad_match_status === "full" ? "#BBF7D0" : "#E5E7EB",
                color: equipment?.cad_match_status === "full" ? "#166534" : "#6B7280",
              }}
            >
              {equipment?.cad_match_status === "full"
                ? "3D reference model is ready for comparison during inspection"
                : equipment?.cad_match_status === "partial"
                ? "Partial model available — some components may not be detected"
                : "Scan equipment QR code to load 3D reference model"}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="acd-card">
            <h2 className="acd-card-title">Quick Actions</h2>
            <div className="acd-actions">
              <a
                href={telLink(claim.site_contact)}
                className="acd-action-btn acd-action-btn--green"
              >
                <PhoneIcon color="#16A34A" />
                Call Site Contact
              </a>
              <a
                href={mapsLink(claim.site_address)}
                target="_blank"
                rel="noopener noreferrer"
                className="acd-action-btn acd-action-btn--blue"
              >
                <PinIcon color="#2563EB" />
                Navigate to Site
              </a>
            </div>
          </div>

          {/* Pre-Inspection Notes */}
          <div className="acd-card">
            <h2 className="acd-card-title">Pre-Inspection Notes</h2>
            <div className="acd-notes">
              {PRE_INSPECTION_NOTES.map((note, i) => (
                <div key={i} className="acd-note-item">
                  <span className="acd-note-check">✓</span>
                  <span className="acd-note-text">{note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .acd-root {
          min-height: 100vh;
          background: #F9FAFB;
          font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
          color: #111827;
        }

        /* ── Header ── */
        .acd-header {
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

        .acd-header-left {
          display: flex; align-items: center; gap: 12px; min-width: 0;
        }

        .acd-back {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          border-radius: 8px; border: 1px solid #E5E7EB;
          background: #fff; cursor: pointer; flex-shrink: 0;
          transition: background 0.1s;
        }
        .acd-back:hover { background: #F3F4F6; }

        .acd-title {
          font-size: 17px; font-weight: 700; color: #111827;
          margin: 0; line-height: 1.2; letter-spacing: -0.3px;
        }

        .acd-sub { font-size: 12px; color: #6B7280; display: block; }

        .acd-header-right {
          display: flex; align-items: center; gap: 14px; flex-shrink: 0;
        }

        .acd-status-badge {
          padding: 5px 14px; border-radius: 20px;
          font-size: 13px; font-weight: 500; white-space: nowrap;
        }

        .acd-logout {
          display: flex; align-items: center; gap: 6px;
          font-size: 13.5px; color: #374151; font-weight: 500;
          background: none; border: none; cursor: pointer;
          padding: 6px 10px; border-radius: 7px; font-family: inherit;
          transition: background 0.12s;
        }
        .acd-logout:hover { background: #F3F4F6; }

        /* ── Layout ── */
        .acd-main {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 20px;
          padding: 24px 32px;
          align-items: start;
        }

        .acd-left, .acd-right {
          display: flex; flex-direction: column; gap: 16px;
        }

        /* ── Card ── */
        .acd-card {
          background: #fff;
          border: 1px solid #E5E7EB;
          border-radius: 14px;
          padding: 22px 24px;
        }

        .acd-card-title {
          font-size: 15px; font-weight: 700; color: #111827;
          margin: 0 0 18px; letter-spacing: -0.2px;
        }

        /* ── Hero ── */
        .acd-hero {
          border-radius: 14px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .acd-hero-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .acd-hero-title {
          font-size: 22px; font-weight: 700; color: #fff;
          margin: 0 0 6px; letter-spacing: -0.5px; line-height: 1.2;
        }

        .acd-hero-sub {
          font-size: 13.5px; color: rgba(255,255,255,0.8);
          margin: 0; line-height: 1.5;
        }

        .acd-hero-brackets { flex-shrink: 0; margin-top: 2px; }

        .acd-hero-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          height: 52px;
          background: #fff;
          color: #2563EB;
          font-size: 15px;
          font-weight: 700;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          letter-spacing: -0.2px;
          transition: background 0.12s, transform 0.1s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        }
        .acd-hero-btn:hover:not(:disabled) {
          background: #F0F7FF;
          transform: translateY(-1px);
        }
        .acd-hero-btn:active:not(:disabled) { transform: none; }
        .acd-hero-btn:disabled {
          opacity: 0.5; cursor: not-allowed; color: #374151;
        }

        /* ── Claim fields ── */
        .acd-field {
          padding: 14px 0;
        }

        .acd-field--bordered {
          border-bottom: 1px solid #F3F4F6;
        }

        .acd-field-label-row {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 5px;
        }

        .acd-field-label {
          font-size: 12px;
          color: #9CA3AF;
          letter-spacing: 0.01em;
        }

        .acd-field-value-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .acd-field-value {
          font-size: 14.5px;
          font-weight: 500;
          color: #111827;
          line-height: 1.4;
        }

        .acd-field-value--money {
          color: #059669;
          font-size: 16px;
          font-weight: 700;
        }

        .acd-maps-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 13px;
          font-weight: 500;
          color: #2563EB;
          text-decoration: none;
          white-space: nowrap;
          flex-shrink: 0;
          margin-top: 1px;
          transition: color 0.12s;
        }
        .acd-maps-link:hover { color: #1D4ED8; }

        /* ── Sidebar fields ── */
        .acd-sidebar-field {
          margin-bottom: 14px;
        }

        .acd-sidebar-label {
          display: block;
          font-size: 12px;
          color: #9CA3AF;
          margin-bottom: 6px;
        }

        .acd-sidebar-value {
          font-size: 14px;
          font-weight: 500;
          color: #111827;
        }

        .acd-model-id-box {
          background: #F3F4F6;
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          font-family: "SF Mono", "Fira Code", monospace;
          letter-spacing: 0.02em;
          word-break: break-all;
        }

        .acd-cad-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
        }

        .acd-cad-note {
          margin-top: 4px;
          padding: 10px 13px;
          border-radius: 8px;
          border: 1px solid;
          font-size: 13px;
          line-height: 1.5;
        }

        /* ── Quick actions ── */
        .acd-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .acd-action-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: background 0.12s, transform 0.1s;
          cursor: pointer;
        }
        .acd-action-btn:hover { transform: translateY(-1px); }
        .acd-action-btn:active { transform: none; }

        .acd-action-btn--green {
          background: #F0FDF4;
          color: #16A34A;
          border: 1px solid #BBF7D0;
        }
        .acd-action-btn--green:hover { background: #DCFCE7; }

        .acd-action-btn--blue {
          background: #EFF6FF;
          color: #2563EB;
          border: 1px solid #BFDBFE;
        }
        .acd-action-btn--blue:hover { background: #DBEAFE; }

        /* ── Pre-inspection notes ── */
        .acd-notes {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .acd-note-item {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          background: #EFF6FF;
          border-radius: 8px;
          padding: 10px 13px;
          border: 1px solid #BFDBFE;
        }

        .acd-note-check {
          font-size: 12px;
          font-weight: 700;
          color: #2563EB;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .acd-note-text {
          font-size: 13px;
          color: #1E40AF;
          line-height: 1.4;
        }

        /* ── Utils ── */
        .acd-center {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; min-height: 100vh;
          color: #9CA3AF; font-size: 14px;
        }

        .spinner { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 900px) {
          .acd-main {
            grid-template-columns: 1fr;
            padding: 16px;
          }
          .acd-header { padding: 0 16px; }
        }
      `}</style>
    </div>
  );
}