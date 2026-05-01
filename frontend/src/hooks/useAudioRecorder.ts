import { useState, useRef, useCallback } from "react";
import { useGPS, GPSCoordinates } from "./useGPS";

export type RecordingState = "idle" | "requesting" | "recording" | "processing";

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  startedAt: string;   // Device ISO timestamp — captured before upload
  stoppedAt: string;   // Device ISO timestamp
  gps: GPSCoordinates | null;
  deviceId: string;
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const startedAtRef = useRef("");
  const gpsRef      = useRef<GPSCoordinates | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef  = useRef<((r: RecordingResult) => void) | null>(null);
  const rejectRef   = useRef<((e: Error) => void) | null>(null);

  const { capture: captureGPS } = useGPS();

  // start() returns a promise that resolves when stop() is called.
  // FR-MR-03.7: stop → auto-save, no confirm dialog.
  const start = useCallback((): Promise<RecordingResult> => {
    return new Promise(async (resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current  = reject;

      setState("requesting");
      setError(null);
      setElapsedSeconds(0);

      // Capture GPS at recording start, not at upload time. FR-MR-05.25.
      try {
        gpsRef.current = await captureGPS();
      } catch {
        gpsRef.current = null; // Non-blocking
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16_000, // 16 kHz optimal for Whisper STT
          },
        });
      } catch {
        const msg = "Microphone access denied";
        setError(msg);
        setState("idle");
        reject(new Error(msg));
        return;
      }

      // Prefer webm/opus: best compression + quality on Quest 3 browser
      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current   = [];
      startedAtRef.current = new Date().toISOString();

      // Collect data every 5 s for Phase 3 real-time STT streaming
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);

        const blob      = new Blob(chunksRef.current, { type: mimeType });
        const stoppedAt = new Date().toISOString();
        // Stable device identifier — consistent across sessions on same device
        const deviceId  = btoa(navigator.userAgent).slice(0, 32);

        setState("processing");
        resolveRef.current?.({
          blob,
          mimeType,
          startedAt: startedAtRef.current,
          stoppedAt,
          gps: gpsRef.current,
          deviceId,
        });
      };

      recorder.onerror = () => {
        setError("Recording error");
        setState("idle");
        rejectRef.current?.(new Error("Recording error"));
      };

      recorder.start(5_000);

      timerRef.current = setInterval(() => {
        setElapsedSeconds(s => s + 1);
      }, 1_000);

      setState("recording");
    });
  }, [captureGPS]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  return { state, error, elapsedSeconds, start, stop, isRecording: state === "recording" };
}
