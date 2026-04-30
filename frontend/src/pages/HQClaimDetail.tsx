import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { claimsApi, usersApi } from "../api/client";
import { logout, useCurrentUser } from "../hooks/useAuth";
import type { Claim, ClaimStatus, AdjusterSummary } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " "); // "2026-04-27 09:15"
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getClaimNumber(id: string): string {
  return `CLM-${id.slice(0, 8).toUpperCase()}`;
}

// ─── Status badge config ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ClaimStatus, { label: string; bg: string; color: string; border: string }> = {
  unassigned:            { label: "Unassigned",        bg: "#F3F4F6", color: "#374151", border: "#E5E7EB" },
  assigned:              { label: "Assigned",          bg: "#DBEAFE", color: "#1D4ED8", border: "#BFDBFE" },
  on_site:               { label: "On-site",           bg: "#EDE9FE", color: "#6D28D9", border: "#DDD6FE" },
  completed:             { label: "Completed",         bg: "#D1FAE5", color: "#065F46", border: "#A7F3D0" },
  ready_for_review:      { label: "Ready for Review",  bg: "#FEF9C3", color: "#92400E", border: "#FDE68A" },
  reconstruction_failed: { label: "Recon. Failed",    bg: "#FEE2E2", color: "#991B1B", border: "#FECACA" },
  under_review:          { label: "Under Review",     bg: "#FFEDD5", color: "#C2410C", border: "#FED7AA" },
  approved:              { label: "Approved",          bg: "#DCFCE7", color: "#166534", border: "#BBF7D0" },
  escalated:             { label: "Escalated",         bg: "#FEF3C7", color: "#B45309", border: "#FDE68A" },
  rejected:              { label: "Rejected",          bg: "#FFE4E6", color: "#9F1239", border: "#FECDD3" },
};

// Statuses where the claim has a submitted report (Inspection Report section shown)
const HAS_REPORT_STATUSES: ClaimStatus[] = [
  "completed", "ready_for_review", "reconstruction_failed",
  "under_review", "approved", "escalated", "rejected",
];

// Statuses where "Review Claim" VR button is shown
const CAN_REVIEW_STATUSES: ClaimStatus[] = ["ready_for_review"];

// Statuses where reassign is allowed (all except terminal)
const CAN_REASSIGN_STATUSES: ClaimStatus[] = [
  "assigned", "on_site", "completed", "ready_for_review", "under_review",
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

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
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

function BuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="#9CA3AF" strokeWidth="1.5"/>
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke="#9CA3AF" strokeWidth="1.5"/>
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#9CA3AF" strokeWidth="1.5"/>
      <polyline points="14 2 14 8 20 8" stroke="#9CA3AF" strokeWidth="1.5"/>
      <line x1="16" y1="13" x2="8" y2="13" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="16" y1="17" x2="8" y2="17" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="#9CA3AF" strokeWidth="1.5"/>
      <line x1="16" y1="2" x2="16" y2="6" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8" y1="2" x2="8" y2="6" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="3" y1="10" x2="21" y2="10" stroke="#9CA3AF" strokeWidth="1.5"/>
    </svg>
  );
}

function MoneyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <line x1="12" y1="1" x2="12" y2="23" stroke="#16A34A" strokeWidth="1.75" strokeLinecap="round"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="#16A34A" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="#9CA3AF" strokeWidth="1.5"/>
      <circle cx="12" cy="10" r="3" stroke="#9CA3AF" strokeWidth="1.5"/>
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.7 13.5 19.79 19.79 0 0 1 1.63 4.87 2 2 0 0 1 3.6 2.69h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10.1a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="#9CA3AF" strokeWidth="1.5"/>
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#2563EB" strokeWidth="1.5"/>
      <polyline points="12 6 12 12 16 14" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.75"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
    </svg>
  );
}

function PersonAddIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.75"/>
      <line x1="19" y1="8" x2="19" y2="14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      <line x1="22" y1="11" x2="16" y2="11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <polyline points="23 4 23 10 17 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
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

// ─── Assign Modal ─────────────────────────────────────────────────────────────

interface AssignModalProps {
  claimId: string;
  isReassign: boolean;
  onClose: () => void;
  onSuccess: (claim: Claim) => void;
}

function AssignModal({ claimId, isReassign, onClose, onSuccess }: AssignModalProps) {
  const [adjusters, setAdjusters] = useState<AdjusterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    usersApi.adjusters().then((res) => {
      setAdjusters(res.adjusters);
      setLoading(false);
    });
  }, []);

  async function handleAssign() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = isReassign
        ? await claimsApi.reassign(claimId, selected)
        : await claimsApi.assign(claimId, selected);
      onSuccess(updated);
    } catch {
      setError("Failed to assign adjuster. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {isReassign ? "Reassign Adjuster" : "Assign Adjuster"}
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="modal-loading"><SpinnerIcon /><span>Loading adjusters…</span></div>
        ) : (
          <div className="modal-adjuster-list">
            {adjusters.map((adj) => (
              <label key={adj.id} className={`modal-adjuster-row${selected === adj.id ? " modal-adjuster-row--selected" : ""}`}>
                <input
                  type="radio"
                  name="adjuster"
                  value={adj.id}
                  checked={selected === adj.id}
                  onChange={() => setSelected(adj.id)}
                  className="modal-radio"
                />
                <div className="modal-adjuster-avatar">
                  {adj.name.charAt(0).toUpperCase()}
                </div>
                <div className="modal-adjuster-info">
                  <span className="modal-adjuster-name">{adj.name}</span>
                  <span className="modal-adjuster-meta">{adj.email}</span>
                </div>
                <span className={`modal-claims-count${adj.active_claims_count === 0 ? " modal-claims-count--free" : ""}`}>
                  {adj.active_claims_count} active
                </span>
              </label>
            ))}
          </div>
        )}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="modal-btn-confirm"
            onClick={handleAssign}
            disabled={!selected || submitting}
          >
            {submitting ? (
              <><SpinnerIcon size={16} /> Assigning…</>
            ) : (
              isReassign ? "Reassign" : "Assign"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HQClaimDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useCurrentUser();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isReassign, setIsReassign] = useState(false);

  const fetchClaim = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await claimsApi.get(id);
      setClaim(data);
    } catch {
      setError("Failed to load claim. Please go back and try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchClaim(); }, [fetchClaim]);

  function openAssignModal(reassign: boolean) {
    setIsReassign(reassign);
    setShowModal(true);
  }

  function handleAssignSuccess(updated: Claim) {
    setClaim(updated);
    setShowModal(false);
  }

  function handleReviewClaim() {
    // Deep link to MR App VR review session — UC-07
    navigate(`/review/${id}`);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#9CA3AF", fontSize: 14, fontFamily: "system-ui, sans-serif", background: "#F9FAFB" }}>
        <SpinnerIcon /><span>Loading claim…</span>
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

  const statusCfg = STATUS_CONFIG[claim.status];
  const isAssigned = !!claim.assigned_to;
  const hasReport = HAS_REPORT_STATUSES.includes(claim.status);
  const canReview = CAN_REVIEW_STATUSES.includes(claim.status);
  const canReassign = CAN_REASSIGN_STATUSES.includes(claim.status);
  const coveragePeriod = claim.policy.coverage_start && claim.policy.coverage_end
    ? `${formatDate(claim.policy.coverage_start)} – ${formatDate(claim.policy.coverage_end)}`
    : "—";

  return (
    <div className="cd-root">
      {/* ── Top nav ── */}
      <header className="cd-header">
        <div className="cd-header-left">
          <button className="cd-back-btn" onClick={() => navigate("/dashboard")}>
            <BackIcon />
          </button>
          <ShieldIcon />
          <div>
            <h1 className="cd-header-title">{getClaimNumber(claim.id)}</h1>
            <span className="cd-header-sub">Claim Details</span>
          </div>
        </div>
        <div className="cd-header-right">
          <span
            className="cd-status-badge"
            style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}` }}
          >
            {statusCfg.label}
          </span>
          <span className="cd-header-user">
            <PersonIcon />
            {user?.name ?? "HQ User"}
          </span>
          <button className="cd-logout-btn" onClick={logout}>
            <LogoutIcon />
            Logout
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="cd-main">

        {/* FNOL Data card */}
        <section className="cd-card">
          <h2 className="cd-card-title">FNOL Data</h2>
          <div className="cd-grid">
            <div className="cd-field">
              <span className="cd-field-icon"><BuildingIcon /></span>
              <div>
                <span className="cd-field-label">Policy Holder</span>
                <span className="cd-field-value">{claim.policy.holder_name}</span>
              </div>
            </div>
            <div className="cd-field">
              <span className="cd-field-icon"><DocIcon /></span>
              <div>
                <span className="cd-field-label">Policy Number</span>
                <span className="cd-field-value">{claim.policy.policy_number ?? "—"}</span>
              </div>
            </div>
            <div className="cd-field">
              <span className="cd-field-icon"><CalendarIcon /></span>
              <div>
                <span className="cd-field-label">Coverage Period</span>
                <span className="cd-field-value">{coveragePeriod}</span>
              </div>
            </div>
            <div className="cd-field">
              <span className="cd-field-icon"><MoneyIcon /></span>
              <div>
                <span className="cd-field-label">Claimed Amount</span>
                <span className="cd-field-value cd-field-value--money">
                  EUR {formatCurrency(claim.claimed_amount)}
                </span>
              </div>
            </div>
            <div className="cd-field">
              <span className="cd-field-icon"><PinIcon /></span>
              <div>
                <span className="cd-field-label">Site Address</span>
                <span className="cd-field-value">{claim.site_address}</span>
              </div>
            </div>
            <div className="cd-field">
              <span className="cd-field-icon"><PhoneIcon /></span>
              <div>
                <span className="cd-field-label">Site Contact</span>
                <span className="cd-field-value">{claim.site_contact}</span>
              </div>
            </div>
            <div className="cd-field">
              <span className="cd-field-icon"><WrenchIcon /></span>
              <div>
                <span className="cd-field-label">Equipment Type</span>
                <span className="cd-field-value">{claim.policy.equipment_type}</span>
              </div>
            </div>
            <div className="cd-field">
              <span className="cd-field-icon"><MoneyIcon /></span>
              <div>
                <span className="cd-field-label">Insured Value</span>
                <span className="cd-field-value cd-field-value--money">
                  EUR {formatCurrency(claim.policy.insured_value)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Assignment card */}
        <section className="cd-card">
          <h2 className="cd-card-title">Assignment</h2>

          {/* Assignee info row */}
          {isAssigned ? (
            <div className="cd-assignee-row">
              <div className="cd-assignee-left">
                <span className="cd-assignee-icon"><PersonIcon /></span>
                <div>
                  <span className="cd-assignee-label">Assigned to</span>
                  <span className="cd-assignee-name">{claim.assigned_to!.name}</span>
                </div>
              </div>
              <div className="cd-assignee-right">
                <ClockIcon />
                <span className="cd-assignee-time">{formatDateTime(claim.updated_at)}</span>
              </div>
            </div>
          ) : (
            <div className="cd-no-assignee">No adjuster assigned yet</div>
          )}

          {/* Action buttons */}
          <div className="cd-action-row">
            {!isAssigned ? (
              /* Unassigned → single full-width button */
              <button className="cd-btn-primary cd-btn--full" onClick={() => openAssignModal(false)}>
                <PersonAddIcon />
                Assign Adjuster
              </button>
            ) : (
              /* Assigned → Review Claim (if ready) + Reassign */
              <>
                {canReview && (
                  <button className="cd-btn-review cd-btn--flex" onClick={handleReviewClaim}>
                    <EyeIcon />
                    Review Claim
                  </button>
                )}
                {canReassign && (
                  <button className="cd-btn-secondary" onClick={() => openAssignModal(true)}>
                    <RefreshIcon />
                    Reassign
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Inspection Report — only for claims with submitted reports */}
        {hasReport && (
          <section className="cd-card">
            <h2 className="cd-card-title">Inspection Report</h2>
            <div className="cd-report-row">
              <div className="cd-report-left">
                <span className="cd-report-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                      stroke="#2563EB" strokeWidth="1.5"/>
                    <polyline points="14 2 14 8 20 8" stroke="#2563EB" strokeWidth="1.5"/>
                    <line x1="16" y1="13" x2="8" y2="13" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="16" y1="17" x2="8" y2="17" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </span>
                <div>
                  <span className="cd-report-name">Final Assessment Report</span>
                  <span className="cd-report-sub">Generated from MR inspection session</span>
                </div>
              </div>
              <button
                className="cd-btn-view-report"
                onClick={() => navigate(`/dashboard/claims/${claim.id}/report`)}
              >
                <EyeIcon />
                View Report
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Assign / Reassign modal */}
      {showModal && id && (
        <AssignModal
          claimId={id}
          isReassign={isReassign}
          onClose={() => setShowModal(false)}
          onSuccess={handleAssignSuccess}
        />
      )}

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .cd-root {
          min-height: 100vh;
          background: #F9FAFB;
          font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
          color: #111827;
        }

        /* ── Header ── */
        .cd-header {
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

        .cd-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .cd-back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid #E5E7EB;
          background: #fff;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.1s;
        }
        .cd-back-btn:hover { background: #F3F4F6; }

        .cd-header-title {
          font-size: 17px;
          font-weight: 700;
          color: #111827;
          margin: 0;
          line-height: 1.2;
          letter-spacing: -0.3px;
        }

        .cd-header-sub {
          font-size: 12px;
          color: #6B7280;
          display: block;
        }

        .cd-header-right {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-shrink: 0;
        }

        .cd-status-badge {
          padding: 5px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
        }

        .cd-header-user {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13.5px;
          color: #374151;
          font-weight: 500;
        }

        .cd-logout-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13.5px;
          color: #6B7280;
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px 8px;
          border-radius: 6px;
          font-family: inherit;
          transition: background 0.12s;
        }
        .cd-logout-btn:hover { background: #F3F4F6; color: #374151; }

        /* ── Main ── */
        .cd-main {
          padding: 28px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 960px;
        }

        /* ── Card ── */
        .cd-card {
          background: #fff;
          border: 1px solid #E5E7EB;
          border-radius: 14px;
          padding: 24px 28px;
        }

        .cd-card-title {
          font-size: 15px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 20px;
          letter-spacing: -0.2px;
        }

        /* ── FNOL grid ── */
        .cd-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
        }

        .cd-field {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 0;
          border-bottom: 1px solid #F3F4F6;
        }

        /* Remove bottom border from last row (items 5-8) */
        .cd-field:nth-child(n+5) { border-bottom: none; }

        .cd-field-icon {
          display: flex;
          align-items: center;
          margin-top: 2px;
          flex-shrink: 0;
        }

        .cd-field-label {
          display: block;
          font-size: 12px;
          color: #9CA3AF;
          margin-bottom: 3px;
          letter-spacing: 0.01em;
        }

        .cd-field-value {
          display: block;
          font-size: 14px;
          color: #111827;
          font-weight: 500;
          line-height: 1.4;
        }

        .cd-field-value--money { color: #059669; }

        /* ── Assignment card ── */
        .cd-no-assignee {
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 16px 20px;
          text-align: center;
          color: #9CA3AF;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .cd-assignee-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #EFF6FF;
          border: 1px solid #BFDBFE;
          border-radius: 10px;
          padding: 14px 18px;
          margin-bottom: 16px;
        }

        .cd-assignee-left {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #1D4ED8;
        }

        .cd-assignee-icon { display: flex; align-items: center; }

        .cd-assignee-label {
          display: block;
          font-size: 11.5px;
          color: #3B82F6;
          margin-bottom: 1px;
        }

        .cd-assignee-name {
          display: block;
          font-size: 14.5px;
          font-weight: 600;
          color: #1D4ED8;
        }

        .cd-assignee-right {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #2563EB;
          font-variant-numeric: tabular-nums;
        }

        /* ── Action buttons ── */
        .cd-action-row {
          display: flex;
          gap: 12px;
          align-items: stretch;
        }

        .cd-btn-primary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 48px;
          background: #2563EB;
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.12s, transform 0.1s;
          box-shadow: 0 2px 8px rgba(37,99,235,0.3);
        }
        .cd-btn-primary:hover { background: #1D4ED8; transform: translateY(-1px); }
        .cd-btn-primary:active { transform: none; }
        .cd-btn--full { width: 100%; }

        .cd-btn-review {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 48px;
          background: #16A34A;
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.12s, transform 0.1s;
          box-shadow: 0 2px 8px rgba(22,163,74,0.3);
        }
        .cd-btn-review:hover { background: #15803D; transform: translateY(-1px); }
        .cd-btn--flex { flex: 1; }

        .cd-btn-secondary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          height: 48px;
          padding: 0 20px;
          background: #fff;
          color: #374151;
          font-size: 14px;
          font-weight: 500;
          border: 1.5px solid #E5E7EB;
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          transition: background 0.12s, border-color 0.12s;
        }
        .cd-btn-secondary:hover { background: #F9FAFB; border-color: #D1D5DB; }

        /* ── Report card ── */
        .cd-report-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #EFF6FF;
          border: 1px solid #BFDBFE;
          border-radius: 10px;
          padding: 14px 18px;
          gap: 16px;
        }

        .cd-report-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cd-report-icon { display: flex; align-items: center; flex-shrink: 0; }

        .cd-report-name {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #1D4ED8;
        }

        .cd-report-sub {
          display: block;
          font-size: 12.5px;
          color: #3B82F6;
          margin-top: 1px;
        }

        .cd-btn-view-report {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 40px;
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
          flex-shrink: 0;
          transition: background 0.12s;
        }
        .cd-btn-view-report:hover { background: #1D4ED8; }

        /* ── Loading / Error ── */
        .cd-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 100vh;
          color: #9CA3AF;
          font-size: 14px;
        }

        .cd-error {
          padding: 64px 32px;
          text-align: center;
          color: #DC2626;
          font-size: 14px;
        }

        /* ── Modal ── */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 24px;
        }

        .modal-box {
          background: #fff;
          border-radius: 16px;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid #E5E7EB;
        }

        .modal-title {
          font-size: 16px;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 16px;
          color: #9CA3AF;
          cursor: pointer;
          padding: 4px;
          line-height: 1;
        }
        .modal-close:hover { color: #374151; }

        .modal-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 40px;
          color: #9CA3AF;
          font-size: 14px;
        }

        .modal-adjuster-list {
          padding: 8px 0;
          max-height: 320px;
          overflow-y: auto;
        }

        .modal-adjuster-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 24px;
          cursor: pointer;
          transition: background 0.1s;
          border-radius: 0;
        }
        .modal-adjuster-row:hover { background: #F9FAFB; }
        .modal-adjuster-row--selected { background: #EFF6FF; }

        .modal-radio { display: none; }

        .modal-adjuster-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #DBEAFE;
          color: #1D4ED8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .modal-adjuster-row--selected .modal-adjuster-avatar {
          background: #2563EB;
          color: #fff;
        }

        .modal-adjuster-info { flex: 1; min-width: 0; }

        .modal-adjuster-name {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #111827;
        }

        .modal-adjuster-meta {
          display: block;
          font-size: 12px;
          color: #9CA3AF;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .modal-claims-count {
          font-size: 12px;
          color: #9CA3AF;
          background: #F3F4F6;
          padding: 2px 8px;
          border-radius: 20px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .modal-claims-count--free {
          background: #DCFCE7;
          color: #166534;
        }

        .modal-error {
          padding: 0 24px 12px;
          font-size: 13px;
          color: #DC2626;
          text-align: center;
        }

        .modal-footer {
          display: flex;
          gap: 10px;
          padding: 16px 24px 20px;
          border-top: 1px solid #E5E7EB;
          justify-content: flex-end;
        }

        .modal-btn-cancel {
          height: 40px;
          padding: 0 18px;
          background: #fff;
          border: 1.5px solid #E5E7EB;
          border-radius: 8px;
          font-size: 14px;
          color: #374151;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.12s;
        }
        .modal-btn-cancel:hover { background: #F9FAFB; }
        .modal-btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

        .modal-btn-confirm {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 40px;
          padding: 0 20px;
          background: #2563EB;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.12s;
        }
        .modal-btn-confirm:hover:not(:disabled) { background: #1D4ED8; }
        .modal-btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

        .spinner { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 768px) {
          .cd-grid { grid-template-columns: repeat(2, 1fr); }
          .cd-field:nth-child(n+5) { border-bottom: 1px solid #F3F4F6; }
          .cd-field:nth-child(n+7) { border-bottom: none; }
          .cd-main { padding: 20px 16px; }
          .cd-header { padding: 0 16px; }
        }
      `}</style>
    </div>
  );
}