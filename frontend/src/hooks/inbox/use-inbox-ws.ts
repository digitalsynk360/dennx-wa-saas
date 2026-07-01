"use client";
import { useEffect, useRef, useCallback } from "react";
import { getActiveWorkspaceId } from "@/lib/auth-storage";

export function useInboxWebSocket(onMessage: (event: { event: string; data: unknown }) => void) {
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const workspaceId = getActiveWorkspaceId();
    if (!workspaceId) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/api/v1/ws";
    const ws = new WebSocket(`${wsUrl}/${workspaceId}`);

    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        onMessage(parsed);
      } catch {}
    };

    ws.onclose = () => {
      // Reconnect after 3s
      setTimeout(connect, 3000);
    };

    ws.onopen = () => {
      // Send periodic ping to keep alive
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 25000);
      ws.onclose = () => { clearInterval(ping); setTimeout(connect, 3000); };
    };

    wsRef.current = ws;
  }, [onMessage]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);
}
