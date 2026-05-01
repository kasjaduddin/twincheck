import { useEffect, useRef, useState } from "react";

// FR-MR-03.7: Stop → auto-save, no confirm dialog
// FR-MR-03.10: High ambient noise alert

interface Props {
  elapsedSeconds: number;
  onStop: () => void;
  isProcessing: boolean;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function formatElapsed(s: number) {
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

export function InterviewPanel({ elapsedSeconds, onStop, isProcessing }: Props) {
  const [noiseAlert, setNoiseAlert] = useState(false);
  const ctxRef  = useRef<AudioContext | null>(null);
  const rafRef  = useRef<number>(0);

  // Ambient noise detection — FR-MR-03.10
  useEffect(() => {
    if (isProcessing) return;
    let highCount = 0;

    (async () => {
      try {
        const ctx  = new AudioContext();
        ctxRef.current = ctx;
        const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source   = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          if (avg > 80) { highCount++; if (highCount > 10) setNoiseAlert(true); }
          else { highCount = 0; setNoiseAlert(false); }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch { /* Non-critical */ }
    })();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close();
    };
  }, [isProcessing]);

  if (isProcessing) {
    return (
      <div style={panel}>
        <div style={{ fontSize: 28, textAlign: "center", marginBottom: 10 }}>⚙️</div>
        <h3 style={{ fontSize: 17, fontWeight: 700, textAlign: "center", margin: "0 0 8px" }}>
          Processing interview…
        </h3>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center", lineHeight: 1.5, margin: "0 0 20px" }}>
          AI is generating transcript. You can proceed to Equipment Scan.
        </p>
        <div style={{
          width: 26, height: 26, margin: "0 auto",
          border: "3px solid rgba(255,255,255,0.1)",
          borderTop: "3px solid #2563eb",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={panel}>
      {/* Noise alert */}
      {noiseAlert && (
        <div style={{
          background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.3)",
          borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#fde68a", marginBottom: 14,
        }}>
          ⚠️ High ambient noise — STT accuracy may be reduced
        </div>
      )}

      {/* Recording indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 10, height: 10, borderRadius: "50%", background: "#ef4444", flexShrink: 0,
          animation: "pulse-rec 1.5s ease-in-out infinite",
        }} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "#ef4444", flex: 1 }}>
          RECORDING
        </span>
        <span style={{ fontSize: 14, fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>

      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, margin: "0 0 18px" }}>
        Checklist items check automatically as topics are covered.
      </p>

      {/* Stop — no confirm dialog, FR-MR-03.7 */}
      <button
        onClick={onStop}
        style={{
          width: "100%", padding: 13,
          background: "rgba(239,68,68,0.12)",
          color: "#ef4444",
          border: "1.5px solid rgba(239,68,68,0.35)",
          borderRadius: 12, fontSize: 15, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Stop Recording
      </button>

      <style>{`
        @keyframes pulse-rec {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}

const panel: React.CSSProperties = {
  position: "fixed",
  top: "50%", left: "50%",
  transform: "translate(-50%, -50%)",
  width: 360,
  background: "rgba(8,8,14,0.85)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(220,50,50,0.25)",
  borderRadius: 20,
  padding: "22px 26px",
  fontFamily: "-apple-system, 'SF Pro Text', sans-serif",
  color: "#fff",
  zIndex: 40,
};
