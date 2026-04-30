import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { claimsApi } from "../api/client";
import { logout, useCurrentUser } from "../hooks/useAuth";
import type { Claim, ClaimStatus } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return iso.slice(0, 10); // "2026-04-28"
}

function formatCurrency(val: number): string {
  return "EUR " + new Intl.NumberFormat("de-DE").format(val);
}

function getClaimNumber(id: string): string {
  return `CLM-${id.slice(0, 8).toUpperCase()}`;
}

// Priority derived from claimed amount — used for visual urgency badge only
type Priority = "urgent" | "high" | "normal";

function getPriority(amount: number): Priority {
  if (amount >= 150_000) return "urgent";
  if (amount >= 70_000)  return "high";
  return "normal";
}

// ─── Status display config ────────────────────────────────────────────────────

interface StatusDisplay {
  label: string;
  bg: string;
  color: string;
  icon: "clock" | "check";
}

function getStatusDisplay(status: ClaimStatus): StatusDisplay {
  switch (status) {
    case "assigned":
      return { label: "Pending Inspection", bg: "#FEF9C3", color: "#B45309", icon: "clock" };
    case "on_site":
      return { label: "In Inspection", bg: "#EDE9FE", color: "#6D28D9", icon: "clock" };
    case "completed":
    case "ready_for_review":
    case "under_review":
    case "approved":
    case "escalated":
    case "rejected":
      return { label: "Completed", bg: "#DCFCE7", color: "#166534", icon: "check" };
    default:
      return { label: status, bg: "#F3F4F6", color: "#374151", icon: "clock" };
  }
}

const PRIORITY_CFG = {
  urgent: { label: "Urgent", bg: "#FFE4E6", color: "#9F1239" },
  high:   { label: "High",   bg: "#FEF3C7", color: "#B45309" },
  normal: { label: "Normal", bg: "#EFF6FF", color: "#1D4ED8" },
};

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

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="#9CA3AF" strokeWidth="1.75"/>
      <circle cx="12" cy="10" r="3" stroke="#9CA3AF" strokeWidth="1.75"/>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="#9CA3AF" strokeWidth="1.75"/>
      <line x1="16" y1="2" x2="16" y2="6" stroke="#9CA3AF" strokeWidth="1.75" strokeLinecap="round"/>
      <line x1="8"  y1="2" x2="8"  y2="6" stroke="#9CA3AF" strokeWidth="1.75" strokeLinecap="round"/>
      <line x1="3"  y1="10" x2="21" y2="10" stroke="#9CA3AF" strokeWidth="1.75"/>
    </svg>
  );
}

function MoneyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <line x1="12" y1="1" x2="12" y2="23" stroke="#16A34A" strokeWidth="1.75" strokeLinecap="round"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
        stroke="#16A34A" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function ClockIconStat({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.75"/>
      <polyline points="12 6 12 12 16 14" stroke={color} strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function CheckCircleIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
        stroke={color} strokeWidth="1.75" strokeLinecap="round"/>
      <polyline points="22 4 12 14.01 9 11.01"
        stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}


function SmallClockIcon({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2"/>
      <polyline points="12 6 12 12 16 14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function SmallCheckIcon({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <polyline points="22 4 12 14.01 9 11.01" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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

// ─── Claim Card ───────────────────────────────────────────────────────────────

function ClaimCard({ claim, onClick }: { claim: Claim; onClick: () => void }) {
  const priority = getPriority(claim.claimed_amount);
  const priCfg = PRIORITY_CFG[priority];
  const statusDisplay = getStatusDisplay(claim.status);

  // Extract city from full address (everything before first comma)
  const city = claim.site_address.split(",")[0].trim();

  return (
    <div className="cc-card">
      {/* Top row */}
      <div className="cc-top-row">
        <div>
          <span className="cc-label">Claim Number</span>
          <span className="cc-claim-num">{getClaimNumber(claim.id)}</span>
        </div>
        <span
          className="cc-priority"
          style={{ background: priCfg.bg, color: priCfg.color }}
        >
          {priCfg.label}
        </span>
      </div>

      {/* Policy holder */}
      <div className="cc-section">
        <span className="cc-label">Policy Holder</span>
        <span className="cc-value">{claim.policy.holder_name}</span>
      </div>

      {/* Equipment (labelled "Vehicle" in design — maps to equipment_type) */}
      <div className="cc-section">
        <span className="cc-label">Equipment</span>
        <span className="cc-value">{claim.policy.equipment_type}</span>
      </div>

      {/* Meta row */}
      <div className="cc-meta-row">
        <span className="cc-meta-item">
          <PinIcon />
          {city}
        </span>
        <span className="cc-meta-item">
          <CalendarIcon />
          Assigned: {formatDate(claim.updated_at)}
        </span>
      </div>

      {/* Amount */}
      <div className="cc-amount-row">
        <MoneyIcon />
        <span className="cc-amount">{formatCurrency(claim.claimed_amount)}</span>
      </div>

      {/* Footer */}
      <div className="cc-footer">
        <span
          className="cc-status-pill"
          style={{ background: statusDisplay.bg, color: statusDisplay.color }}
        >
          {statusDisplay.icon === "check"
            ? <SmallCheckIcon color={statusDisplay.color} />
            : <SmallClockIcon color={statusDisplay.color} />
          }
          {statusDisplay.label}
        </span>
        <button className="cc-view-btn" onClick={onClick}>
          View Details
        </button>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, iconType, iconColor, valueColor,
}: {
  label: string;
  value: number;
  iconType: "clock" | "check";
  iconColor: string;
  valueColor: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {iconType === "check"
          ? <CheckCircleIcon color={iconColor} />
          : <ClockIconStat color={iconColor} />
        }
      </div>
      <span className="stat-value" style={{ color: valueColor }}>{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdjusterClaimsList() {
  const navigate = useNavigate();
  useCurrentUser(); // session guard

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await claimsApi.list({ per_page: 50 });
      setClaims(res.claims);
    } catch {
      setError("Failed to load claims. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  // Compute stat counts
  const totalAssigned = claims.length;
  const pending     = claims.filter(c => c.status === "assigned").length;
  const inProgress  = claims.filter(c => c.status === "on_site").length;
  const completed   = claims.filter(c =>
    ["completed","ready_for_review","under_review","approved","escalated","rejected"].includes(c.status)
  ).length;

  return (
    <div className="al-root">

      {/* ── Header ── */}
      <header className="al-header">
        <div className="al-header-left">
          <ShieldIcon />
          <div>
            <h1 className="al-header-title">Adjuster Dashboard</h1>
            <span className="al-header-sub">My Assigned Claims</span>
          </div>
        </div>
        <button className="al-logout-btn" onClick={logout}>
          <LogoutIcon />
          Logout
        </button>
      </header>

      <main className="al-main">

        {/* ── Stat cards ── */}
        <div className="al-stats">
          <StatCard label="Total Assigned" value={totalAssigned} iconType="clock" iconColor="#9CA3AF" valueColor="#111827" />
          <StatCard label="Pending"        value={pending}       iconType="clock" iconColor="#F59E0B" valueColor="#F59E0B" />
          <StatCard label="In Progress"    value={inProgress}    iconType="clock" iconColor="#7C3AED" valueColor="#7C3AED" />
          <StatCard label="Completed"      value={completed}     iconType="check" iconColor="#16A34A" valueColor="#16A34A" />
        </div>

        {/* ── Claims grid ── */}
        {loading ? (
          <div className="al-center"><SpinnerIcon /><span>Loading claims…</span></div>
        ) : error ? (
          <div className="al-center" style={{ color: "#DC2626" }}>{error}</div>
        ) : claims.length === 0 ? (
          <div className="al-center">
            <div className="al-empty">
              <span className="al-empty-icon">📋</span>
              <span className="al-empty-title">No claims assigned</span>
              <span className="al-empty-sub">Contact HQ if you're expecting an assignment.</span>
            </div>
          </div>
        ) : (
          <div className="al-grid">
            {claims.map(claim => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                onClick={() => navigate(`/claims/${claim.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .al-root {
          min-height: 100vh;
          background: #F9FAFB;
          font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
          color: #111827;
        }

        /* ── Header ── */
        .al-header {
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
        }

        .al-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .al-header-title {
          font-size: 17px;
          font-weight: 700;
          color: #111827;
          margin: 0;
          line-height: 1.2;
          letter-spacing: -0.3px;
        }

        .al-header-sub {
          font-size: 12px;
          color: #6B7280;
          display: block;
        }

        .al-logout-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: #374151;
          background: none;
          border: none;
          cursor: pointer;
          padding: 7px 12px;
          border-radius: 8px;
          font-family: inherit;
          font-weight: 500;
          transition: background 0.12s;
        }
        .al-logout-btn:hover { background: #F3F4F6; }

        /* ── Main ── */
        .al-main {
          padding: 28px 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* ── Stat cards ── */
        .al-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .stat-card {
          background: #fff;
          border: 1px solid #E5E7EB;
          border-radius: 14px;
          padding: 20px 22px;
        }

        .stat-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .stat-label {
          font-size: 13px;
          color: #6B7280;
          font-weight: 500;
        }

        .stat-value {
          font-size: 32px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -1px;
        }

        /* ── Grid ── */
        .al-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        /* ── Claim card ── */
        .cc-card {
          background: #fff;
          border: 1px solid #E5E7EB;
          border-radius: 14px;
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 0;
          transition: box-shadow 0.15s, transform 0.12s;
        }

        .cc-card:hover {
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }

        .cc-top-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .cc-priority {
          font-size: 12px;
          font-weight: 600;
          padding: 3px 11px;
          border-radius: 20px;
          white-space: nowrap;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .cc-label {
          display: block;
          font-size: 12px;
          color: #9CA3AF;
          margin-bottom: 3px;
          letter-spacing: 0.01em;
        }

        .cc-claim-num {
          display: block;
          font-size: 18px;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.4px;
          line-height: 1.2;
        }

        .cc-section {
          margin-bottom: 12px;
        }

        .cc-value {
          display: block;
          font-size: 15px;
          font-weight: 600;
          color: #111827;
          line-height: 1.3;
        }

        /* Meta (location + date) */
        .cc-meta-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 14px;
        }

        .cc-meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #6B7280;
        }

        /* Amount */
        .cc-amount-row {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 18px;
        }

        .cc-amount {
          font-size: 16px;
          font-weight: 700;
          color: #059669;
          letter-spacing: -0.3px;
        }

        /* Footer */
        .cc-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 14px;
          border-top: 1px solid #F3F4F6;
          gap: 10px;
        }

        .cc-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12.5px;
          font-weight: 500;
          padding: 5px 11px;
          border-radius: 20px;
        }

        .cc-view-btn {
          height: 36px;
          padding: 0 18px;
          background: #2563EB;
          color: #fff;
          font-size: 13.5px;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          transition: background 0.12s;
          flex-shrink: 0;
        }
        .cc-view-btn:hover { background: #1D4ED8; }

        /* ── Empty / loading ── */
        .al-center {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 80px 24px;
          color: #9CA3AF;
          font-size: 14px;
        }

        .al-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          text-align: center;
        }

        .al-empty-icon { font-size: 32px; }

        .al-empty-title {
          font-size: 16px;
          font-weight: 600;
          color: #374151;
        }

        .al-empty-sub {
          font-size: 13.5px;
          color: #9CA3AF;
        }

        .spinner { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 900px) {
          .al-stats { grid-template-columns: repeat(2, 1fr); }
          .al-grid  { grid-template-columns: 1fr; }
          .al-main  { padding: 20px 16px; }
          .al-header { padding: 0 16px; }
        }
      `}</style>
    </div>
  );
}