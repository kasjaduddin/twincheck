import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { claimsApi } from "../api/client";
import { logout, useCurrentUser } from "../hooks/useAuth";
import type { Claim, ClaimStatus } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return iso.slice(0, 10); // "2026-04-28"
}

function getClaimNumber(id: string): string {
  // Show last segment of UUID as a short ID for demo display.
  // In production the backend would return a human-readable claim number.
  return `CLM-${id.slice(0, 8).toUpperCase()}`;
}

// ─── Status badge config ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ClaimStatus,
  { label: string; bg: string; color: string }
> = {
  unassigned:            { label: "Unassigned",       bg: "#F3F4F6", color: "#374151" },
  assigned:              { label: "Assigned",         bg: "#DBEAFE", color: "#1D4ED8" },
  on_site:               { label: "On-site",          bg: "#EDE9FE", color: "#6D28D9" },
  completed:             { label: "Completed",        bg: "#D1FAE5", color: "#065F46" },
  ready_for_review:      { label: "Ready for Review", bg: "#FEF9C3", color: "#92400E" },
  reconstruction_failed: { label: "Recon. Failed",   bg: "#FEE2E2", color: "#991B1B" },
  under_review:          { label: "Under Review",    bg: "#FFEDD5", color: "#C2410C" },
  approved:              { label: "Approved",         bg: "#DCFCE7", color: "#166534" },
  escalated:             { label: "Escalated",        bg: "#FEF3C7", color: "#B45309" },
  rejected:              { label: "Rejected",         bg: "#FFE4E6", color: "#9F1239" },
};

// Tab definitions — counts are computed from full claim list
const TABS: { key: ClaimStatus | "all"; label: string }[] = [
  { key: "all",             label: "All" },
  { key: "unassigned",      label: "Unassigned" },
  { key: "assigned",        label: "Assigned" },
  { key: "on_site",         label: "On-site" },
  { key: "ready_for_review",label: "Ready for Review" },
  { key: "under_review",    label: "Under Review" },
  { key: "approved",        label: "Approved" },
  { key: "rejected",        label: "Rejected" },
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

function PersonIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.75"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
        stroke="#9CA3AF" strokeWidth="1.75"/>
      <circle cx="12" cy="10" r="3" stroke="#9CA3AF" strokeWidth="1.75"/>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="#9CA3AF" strokeWidth="1.75"/>
      <line x1="16" y1="2" x2="16" y2="6" stroke="#9CA3AF" strokeWidth="1.75" strokeLinecap="round"/>
      <line x1="8"  y1="2" x2="8"  y2="6" stroke="#9CA3AF" strokeWidth="1.75" strokeLinecap="round"/>
      <line x1="3"  y1="10" x2="21" y2="10" stroke="#9CA3AF" strokeWidth="1.75"/>
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function HQDashboard() {
  const navigate = useNavigate();
  const user = useCurrentUser();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ClaimStatus | "all">("all");

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load all claims — 44 fit in one page per TechDecisions: pagination removed
      const res = await claimsApi.list({ per_page: 50 });
      setClaims(res.claims);
    } catch {
      setError("Failed to load claims. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  // Compute tab counts from full claim list
  const tabCounts = TABS.reduce<Record<string, number>>((acc, tab) => {
    acc[tab.key] =
      tab.key === "all"
        ? claims.length
        : claims.filter((c) => c.status === tab.key).length;
    return acc;
  }, {});

  // Filter displayed rows by active tab
  const visibleClaims =
    activeTab === "all"
      ? claims
      : claims.filter((c) => c.status === activeTab);

  async function handleLogout() {
    await logout();
  }

  return (
    <div className="dash-root">
      {/* ── Top nav ── */}
      <header className="dash-header">
        <div className="dash-header-left">
          <ShieldIcon />
          <div className="dash-header-title-group">
            <h1 className="dash-header-title">Claims Dashboard</h1>
            <span className="dash-header-sub">HQ Management</span>
          </div>
        </div>
        <div className="dash-header-right">
          <span className="dash-user">
            <PersonIcon size={15} />
            {user?.name ?? "HQ User"}
          </span>
          <button className="dash-logout-btn" onClick={handleLogout}>
            <LogoutIcon />
            Logout
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="dash-main">
        <div className="dash-card">
          {/* Status filter tabs */}
          <div className="dash-tabs">
            {TABS.map((tab) => {
              const count = tabCounts[tab.key] ?? 0;
              // Hide tabs with zero claims (except "all")
              if (tab.key !== "all" && count === 0) return null;
              return (
                <button
                  key={tab.key}
                  className={`dash-tab${activeTab === tab.key ? " dash-tab--active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  <span className="dash-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          {loading ? (
            <div className="dash-loading">
              <SpinnerIcon />
              <span>Loading claims…</span>
            </div>
          ) : error ? (
            <div className="dash-error">{error}</div>
          ) : visibleClaims.length === 0 ? (
            <div className="dash-empty">No claims in this category.</div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Claim ID</th>
                    <th>Company Name</th>
                    <th>Equipment Type</th>
                    <th>Site Location</th>
                    <th>FNOL Date</th>
                    <th>Status</th>
                    <th>Assigned To</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleClaims.map((claim) => {
                    const cfg = STATUS_CONFIG[claim.status];
                    return (
                      <tr
                        key={claim.id}
                        className="dash-row"
                        onClick={() => navigate(`/dashboard/claims/${claim.id}`)}
                      >
                        {/* Claim ID */}
                        <td className="dash-td dash-td--id">
                          {getClaimNumber(claim.id)}
                        </td>

                        {/* Company name */}
                        <td className="dash-td">
                          {claim.policy.holder_name}
                        </td>

                        {/* Equipment type */}
                        <td className="dash-td">
                          {claim.policy.equipment_type}
                        </td>

                        {/* Site location */}
                        <td className="dash-td dash-td--location">
                          <PinIcon />
                          <span>{claim.site_address}</span>
                        </td>

                        {/* FNOL date */}
                        <td className="dash-td dash-td--date">
                          <CalendarIcon />
                          <span>{formatDate(claim.created_at)}</span>
                        </td>

                        {/* Status badge */}
                        <td className="dash-td">
                          <span
                            className="dash-badge"
                            style={{ background: cfg.bg, color: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                        </td>

                        {/* Assigned to */}
                        <td className="dash-td dash-td--assignee">
                          {claim.assigned_to ? (
                            <>
                              <PersonIcon size={14} />
                              <span>{claim.assigned_to.name}</span>
                            </>
                          ) : (
                            <span className="dash-unassigned">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .dash-root {
          min-height: 100vh;
          background: #F9FAFB;
          font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
          color: #111827;
        }

        /* ── Header ── */
        .dash-header {
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

        .dash-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .dash-header-title-group {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .dash-header-title {
          font-size: 17px;
          font-weight: 700;
          color: #111827;
          margin: 0;
          line-height: 1.2;
          letter-spacing: -0.3px;
        }

        .dash-header-sub {
          font-size: 12px;
          color: #6B7280;
          letter-spacing: 0.01em;
        }

        .dash-header-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .dash-user {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 14px;
          color: #374151;
          font-weight: 500;
        }

        .dash-logout-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: #6B7280;
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px 8px;
          border-radius: 6px;
          font-family: inherit;
          transition: background 0.12s, color 0.12s;
        }

        .dash-logout-btn:hover {
          background: #F3F4F6;
          color: #374151;
        }

        /* ── Main ── */
        .dash-main {
          padding: 28px 32px;
        }

        .dash-card {
          background: #fff;
          border: 1px solid #E5E7EB;
          border-radius: 14px;
          overflow: hidden;
        }

        /* ── Tabs ── */
        .dash-tabs {
          display: flex;
          gap: 0;
          padding: 0 4px;
          border-bottom: 1px solid #E5E7EB;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .dash-tabs::-webkit-scrollbar { display: none; }

        .dash-tab {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 14px 18px 13px;
          font-size: 14px;
          font-weight: 500;
          color: #6B7280;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          white-space: nowrap;
          font-family: inherit;
          transition: color 0.12s;
          margin-bottom: -1px;
        }

        .dash-tab:hover { color: #374151; }

        .dash-tab--active {
          color: #2563EB;
          border-bottom-color: #2563EB;
        }

        .dash-tab-count {
          font-size: 12px;
          font-weight: 600;
          background: #F3F4F6;
          color: #6B7280;
          padding: 1px 7px;
          border-radius: 20px;
          line-height: 1.6;
        }

        .dash-tab--active .dash-tab-count {
          background: #DBEAFE;
          color: #1D4ED8;
        }

        /* ── Table ── */
        .dash-table-wrap {
          overflow-x: auto;
        }

        .dash-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .dash-table thead tr {
          background: #F9FAFB;
          border-bottom: 1px solid #E5E7EB;
        }

        .dash-table th {
          padding: 12px 20px;
          text-align: left;
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          white-space: nowrap;
          letter-spacing: 0.01em;
        }

        .dash-row {
          border-bottom: 1px solid #F3F4F6;
          cursor: pointer;
          transition: background 0.1s;
        }

        .dash-row:hover { background: #F9FAFB; }
        .dash-row:last-child { border-bottom: none; }

        .dash-td {
          padding: 16px 20px;
          color: #374151;
          vertical-align: middle;
        }

        .dash-td--id {
          font-size: 13px;
          font-weight: 600;
          color: #111827;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }

        .dash-td--location,
        .dash-td--date {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          color: #6B7280;
          font-size: 13.5px;
        }

        .dash-td--location svg,
        .dash-td--date svg {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .dash-td--assignee {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #374151;
          font-size: 13.5px;
        }

        .dash-td--assignee svg { color: #9CA3AF; flex-shrink: 0; }

        .dash-unassigned {
          color: #D1D5DB;
          font-weight: 500;
        }

        /* ── Badge ── */
        .dash-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 11px;
          border-radius: 20px;
          font-size: 12.5px;
          font-weight: 500;
          white-space: nowrap;
          line-height: 1.5;
        }

        /* ── States ── */
        .dash-loading,
        .dash-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 64px 24px;
          color: #9CA3AF;
          font-size: 14px;
        }

        .dash-error {
          padding: 64px 24px;
          text-align: center;
          color: #DC2626;
          font-size: 14px;
        }

        .spinner {
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
