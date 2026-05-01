import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { claimsApi, reportsApi, evidenceApi, getSession, getWsUrl } from "../api/client";
import { xrSession, XRSessionManager } from "../xr/session";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useWebSocket } from "../hooks/useWebSocket";
import { ClaimSummaryPanel } from "../ui/mr/ClaimSummaryPanel";
import { ConsentPanel } from "../ui/mr/ConsentPanel";
import { InterviewPanel } from "../ui/mr/InterviewPanel";
import { ChecklistOverlay } from "../ui/mr/ChecklistOverlay";
import type { Claim, ChecklistState } from "../types";
import { DEFAULT_CHECKLIST } from "../types";

// ─── Step machine ─────────────────────────────────────────────────────────────

type Step =
  | "loading"        // Fetching claim from backend
  | "pre-ar"         // 2D briefing before entering AR
  | "entering-ar"    // Requesting XR session
  | "claim-summary"  // UC-01: Claim data panel in AR
  | "consent"        // UC-02: Consent prompt
  | "recording"      // UC-02: Active interview recording
  | "processing"     // UC-02: Uploading + AI processing
  | "qr-scan"        // UC-03 placeholder (Phase 4)
  | "error";

// ─── Component ────────────────────────────────────────────────────────────────

export default function InspectApp() {
  const { claimId }  = useParams<{ claimId: string }>();
  const navigate     = useNavigate();

  const [step, setStep]         = useState<Step>("loading");
  const [claim, setClaim]       = useState<Claim | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [checklist, setChecklist] = useState<ChecklistState>(DEFAULT_CHECKLIST);

  const overlayRef = useRef<HTMLDivElement>(null);

  const recorder = useAudioRecorder();

  // WebSocket for live checklist updates from STT (Phase 3 wires this up).
  const wsEnabled = step === "recording" || step === "processing";
  useWebSocket({
    wsUrl: claimId ? getWsUrl(claimId) : "",
    enabled: wsEnabled,
    onMessage: (msg) => {
      if (msg.event === "checklist_update") setChecklist(msg.checklist);
    },
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!getSession()) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // ── Load claim ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!claimId) { setError("No claim ID"); setStep("error"); return; }

    claimsApi.get(claimId)
      .then((data) => {
        setClaim(data);
        // Cache for offline fallback — FR-MR-02.6
        localStorage.setItem(`claim_cache_${claimId}`, JSON.stringify(data));
        setStep("pre-ar");
      })
      .catch(() => {
        const cached = localStorage.getItem(`claim_cache_${claimId}`);
        if (cached) {
          setClaim(JSON.parse(cached) as Claim);
          setStep("pre-ar");
        } else {
          setError("Could not load claim. Check your connection.");
          setStep("error");
        }
      });

    xrSession.constructor; // ensure class is loaded
    XRSessionManager.isSupported("immersive-ar").then(setArSupported);
  }, [claimId]);

  // ── Enter AR ────────────────────────────────────────────────────────────────
  const enterAR = useCallback(async () => {
    if (!overlayRef.current || !claimId) return;
    setStep("entering-ar");

    try {
      await xrSession.start({
        mode: "immersive-ar",
        overlayRoot: overlayRef.current,
        onEnd: () => navigate(`/claims/${claimId}`, { replace: true }),
      });

      // Mark claim on_site — FR-MR-02.5 — non-blocking
      claimsApi.updateStatus(claimId, "on_site").catch(() => {});

      setStep("claim-summary");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start AR");
      setStep("pre-ar");
    }
  }, [claimId, navigate]);

  // ── UC-02: Recording flow ────────────────────────────────────────────────────
  const startConsent   = useCallback(() => setStep("consent"), []);

  const beginRecording = useCallback(async () => {
    setStep("recording");
    setChecklist(DEFAULT_CHECKLIST);

    try {
      const result = await recorder.start();
      // recorder.start() resolves when stop() is called
      setStep("processing");

      // Build FormData — GPS and timestamp bundled before upload (FR-MR-05.25)
      const filename = `interview_${Date.now()}.webm`;
      const fd = new FormData();
      fd.append("file", result.blob, filename);
      fd.append("type", "audio");
      fd.append("gps_lat",  String(result.gps?.lat ?? 0));
      fd.append("gps_lng",  String(result.gps?.lng ?? 0));
      if (result.gps?.accuracy != null) fd.append("gps_accuracy", String(result.gps.accuracy));
      fd.append("captured_at", result.startedAt);
      fd.append("device_id",   result.deviceId);
      fd.append("consent_flag", "true");

      // Upload and write a pending-STT stub to section_b
      await Promise.allSettled([
        evidenceApi.upload(claimId!, fd),
        reportsApi.updateSection(claimId!, "b", {
          ai_summary:         null,
          transcript_ref:     null,
          last_known_service: null,
          processing_status:  "pending_stt",
        }),
      ]);

      // Brief processing screen, then move to QR scan placeholder
      setTimeout(() => setStep("qr-scan"), 1_800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Recording failed");
      setStep("claim-summary");
    }
  }, [recorder, claimId]);

  const stopRecording = useCallback(() => recorder.stop(), [recorder]);

  // Manual mode — interviewee refuses recording (FR-MR-03.11)
  const enterManualMode = useCallback(() => {
    if (claimId) {
      reportsApi.updateSection(claimId, "b", {
        ai_summary:        null,
        transcript_ref:    null,
        manual_mode:       true,
        processing_status: "manual",
      }).catch(() => {});
    }
    setStep("qr-scan");
  }, [claimId]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (step === "loading") return <Fullscreen message="Loading claim…" />;
  if (step === "error")   return <Fullscreen message={error ?? "Error"} isError />;

  return (
    <>
      {/* 2D pre-AR briefing (before XR session starts) */}
      {(step === "pre-ar" || step === "entering-ar") && (
        <PreARScreen
          claim={claim!}
          arSupported={arSupported}
          entering={step === "entering-ar"}
          onEnter={enterAR}
          onBack={() => navigate(`/claims/${claimId}`)}
        />
      )}

      {/* XR overlay root — React renders here; WebXR overlays on passthrough */}
      <div
        ref={overlayRef}
        id="xr-overlay"
        style={{ display: (step === "pre-ar" || step === "entering-ar") ? "none" : "block" }}
      >
        {step === "claim-summary" && claim && (
          <ClaimSummaryPanel
            claimId={claim.id}
            policyHolder={claim.policy?.holder_name ?? "—"}
            equipmentType={claim.policy?.equipment_type ?? "—"}
            siteAddress={claim.site_address}
            siteContact={claim.site_contact}
            insuredValue={claim.policy?.insured_value ?? 0}
            claimedAmount={claim.claimed_amount}
            coverageStart={claim.policy?.coverage_start ?? ""}
            coverageEnd={claim.policy?.coverage_end ?? ""}
            onContinue={startConsent}
          />
        )}

        {step === "consent" && (
          <ConsentPanel onConfirm={beginRecording} onManualMode={enterManualMode} />
        )}

        {(step === "recording" || step === "processing") && (
          <>
            {step === "recording" && <ChecklistOverlay checklist={checklist} />}
            <InterviewPanel
              elapsedSeconds={recorder.elapsedSeconds}
              onStop={stopRecording}
              isProcessing={step === "processing"}
            />
          </>
        )}

        {step === "qr-scan" && (
          <Fullscreen message="QR Scan — Phase 4" dark />
        )}
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Fullscreen({ message, isError = false, dark = false }: { message: string; isError?: boolean; dark?: boolean }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: dark ? "#0a0a0f" : "#0a0a0f",
      color: isError ? "#f87171" : "rgba(255,255,255,0.5)",
      fontFamily: "-apple-system, sans-serif", fontSize: 15,
    }}>
      {message}
    </div>
  );
}

function PreARScreen({
  claim, arSupported, entering, onEnter, onBack,
}: {
  claim: Claim;
  arSupported: boolean | null;
  entering: boolean;
  onEnter: () => void;
  onBack: () => void;
}) {
  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0f",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 32, fontFamily: "-apple-system, 'SF Pro Text', sans-serif",
    }}>
      <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
        {/* Icon */}
        <div style={{ fontSize: 44, marginBottom: 16 }}>🔍</div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>
          {claim.policy?.holder_name ?? "Claim Inspection"}
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", margin: "0 0 32px" }}>
          {claim.policy?.equipment_type} · {claim.site_address.split(",")[0]}
        </p>

        {arSupported === false && (
          <div style={{
            background: "rgba(250,204,21,0.08)",
            border: "1px solid rgba(250,204,21,0.25)",
            borderRadius: 10, padding: 12,
            fontSize: 13, color: "#fde68a", marginBottom: 20,
          }}>
            AR not supported on this device. Open on Quest 3 browser.
          </div>
        )}

        <button
          onClick={onEnter}
          disabled={entering || arSupported === false}
          style={{
            width: "100%", padding: 16,
            background: arSupported === false ? "#1f2937" : "#2563eb",
            color: "#fff", border: "none", borderRadius: 14,
            fontSize: 16, fontWeight: 700,
            cursor: entering || arSupported === false ? "not-allowed" : "pointer",
            opacity: entering ? 0.6 : 1,
            marginBottom: 12, fontFamily: "inherit",
            transition: "opacity 0.2s",
          }}
        >
          {entering ? "Starting…" : "Enter AR Inspection"}
        </button>

        <button
          onClick={onBack}
          style={{
            width: "100%", padding: 12,
            background: "transparent", color: "rgba(255,255,255,0.28)",
            border: "none", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          ← Back to claim
        </button>
      </div>
    </div>
  );
}
