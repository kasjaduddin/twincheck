import { useEffect, useRef, useCallback, useState } from "react";
import type { ChecklistState } from "../types";

export type WSMessage =
  | { event: "section_updated"; section: string; status_text: string; data: Record<string, unknown> }
  | { event: "section_complete"; section: string }
  | { event: "checklist_update"; checklist: ChecklistState }
  | { event: "pong" };

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface Options {
  wsUrl: string;          // Full wss:// URL including ?token= param
  onMessage?: (msg: WSMessage) => void;
  enabled?: boolean;
}

export function useWebSocket({ wsUrl, onMessage, enabled = true }: Options) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef              = useRef<WebSocket | null>(null);
  const pingRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const retriedRef         = useRef(false);
  const onMessageRef       = useRef(onMessage);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const connect = useCallback(() => {
    if (!enabled || !wsUrl) return;
    setStatus("connecting");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      retriedRef.current = false;
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: "ping" }));
        }
      }, 30_000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WSMessage;
        onMessageRef.current?.(msg);
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onclose = (e) => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (e.code === 4001) {
        // Auth failure — don't retry, token needs refresh
        setStatus("error");
        return;
      }
      setStatus("disconnected");
      // Single reconnect attempt for transient network blips
      if (!retriedRef.current) {
        retriedRef.current = true;
        setTimeout(connect, 2_000);
      }
    };

    ws.onerror = () => setStatus("error");
  }, [wsUrl, enabled]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [connect, enabled]);

  return { status };
}
