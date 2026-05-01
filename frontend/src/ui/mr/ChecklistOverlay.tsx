import type { ChecklistState } from "../../types";

// FR-MR-03.3: overlay checklist di pojok kiri headset, non-intrusive
// FR-MR-03.6: item belum ter-check tidak memblokir adjuster untuk stop
// FR-MR-03.5: items auto-check via WebSocket dari STT (Phase 3)

const ITEMS: { key: keyof ChecklistState; label: string }[] = [
  { key: "incident_when",           label: "When did it happen?" },
  { key: "first_discovered",        label: "Who first discovered it?" },
  { key: "equipment_condition",     label: "Condition before incident?" },
  { key: "scheduled_maintenance",   label: "Scheduled maintenance prior?" },
  { key: "last_known_service",      label: "Last service — date & vendor?" },
  { key: "other_witnesses",         label: "Any other witnesses?" },
];

interface Props {
  checklist: ChecklistState;
}

export function ChecklistOverlay({ checklist }: Props) {
  const answered = Object.values(checklist).filter(Boolean).length;
  const total    = ITEMS.length;
  const allDone  = answered === total;

  return (
    <div style={{
      position: "fixed",
      top: "1.5rem",
      left: "1.25rem",
      width: 248,
      background: "rgba(0,0,0,0.68)",
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 14,
      padding: "12px 14px",
      zIndex: 50,
      fontFamily: "-apple-system, 'SF Pro Text', sans-serif",
      color: "#fff",
      pointerEvents: "none", // Passive — don't intercept taps
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
          Interview
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: allDone ? "#4ade80" : "#facc15" }}>
          {answered}/{total}
        </span>
      </div>

      {/* Items */}
      {ITEMS.map(({ key, label }) => {
        const done = checklist[key];
        return (
          <div key={key} style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "3px 0",
            opacity: done ? 0.4 : 1,
            transition: "opacity 0.3s",
          }}>
            <span style={{
              flexShrink: 0,
              marginTop: 1,
              width: 15,
              height: 15,
              borderRadius: 4,
              background: done ? "#4ade80" : "transparent",
              border: done ? "none" : "1.5px solid rgba(255,255,255,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}>
              {done && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3 5.5L8 1" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span style={{
              fontSize: 11,
              lineHeight: 1.4,
              color: done ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.88)",
              textDecoration: done ? "line-through" : "none",
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
