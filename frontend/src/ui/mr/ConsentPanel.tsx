import { useState } from "react";

// FR-MR-03.1: adjuster reads consent to narasumber, narasumber confirms verbally.
// Adjuster ticks checkbox to confirm consent was given before recording starts.

interface Props {
  onConfirm: () => void;
  onManualMode: () => void;
}

export function ConsentPanel({ onConfirm, onManualMode }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div style={panel}>
      <div style={{ fontSize: 30, textAlign: "center", marginBottom: 10 }}>🎙️</div>
      <h2 style={{ fontSize: 19, fontWeight: 700, textAlign: "center", margin: "0 0 18px" }}>
        Interview Recording
      </h2>

      {/* Script to read aloud */}
      <div style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12, padding: "13px 15px", marginBottom: 16,
      }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.38)", margin: "0 0 7px" }}>
          Read aloud to interviewee
        </p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.82)", lineHeight: 1.6, fontStyle: "italic", margin: 0 }}>
          "This interview will be recorded for insurance claim processing. The recording will be stored securely and used only by our claims team. Do you consent to being recorded?"
        </p>
      </div>

      {/* Confirmation */}
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 22 }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={e => setConfirmed(e.target.checked)}
          style={{ width: 17, height: 17, cursor: "pointer", accentColor: "#2563eb" }}
        />
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.78)" }}>
          Interviewee confirmed consent verbally
        </span>
      </label>

      <button
        onClick={onConfirm}
        disabled={!confirmed}
        style={{
          ...btnBase,
          background: "#2563eb",
          opacity: confirmed ? 1 : 0.38,
          cursor: confirmed ? "pointer" : "not-allowed",
          marginBottom: 10,
        }}
      >
        Begin Recording
      </button>

      <button onClick={onManualMode} style={{ ...btnBase, background: "transparent", color: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 13 }}>
        Interviewee refuses — use manual mode
      </button>
    </div>
  );
}

const panel: React.CSSProperties = {
  position: "fixed",
  top: "50%", left: "50%",
  transform: "translate(-50%, -50%)",
  width: 400,
  background: "rgba(8,8,14,0.85)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 20,
  padding: "26px 30px",
  fontFamily: "-apple-system, 'SF Pro Text', sans-serif",
  color: "#fff",
  zIndex: 40,
};

const btnBase: React.CSSProperties = {
  width: "100%", padding: "13px 20px",
  color: "#fff", border: "none", borderRadius: 12,
  fontSize: 15, fontWeight: 600, cursor: "pointer",
  fontFamily: "inherit",
};
