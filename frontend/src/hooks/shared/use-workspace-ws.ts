"use client";
import { useEffect, useRef, useCallback } from "react";
import { getActiveWorkspaceId } from "@/lib/auth-storage";

const MAX_RETRIES = 8;

/**
 * Shared workspace-scoped WebSocket connection. One socket per page,
 * used to replace setInterval polling anywhere the backend already
 * pushes an event (campaign_update, campaign_recipient_update,
 * kb_task_update, new_message, message_status_update, ...).
 */
export function useWorkspaceWebSocket(onMessage: (event: { event: string; data: unknown }) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const stoppedRef = useRef(false);

  const connect = useCallback(() => {
    if (stoppedRef.current) return;
    const workspaceId = getActiveWorkspaceId();
    if (!workspaceId) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/api/v1/ws";
    const ws = new WebSocket(`${wsUrl}/${workspaceId}`);
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      retriesRef.current = 0;
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 25000);
    };

    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        onMessage(parsed);
      } catch {}
    };

    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval);
      if (stoppedRef.current) return;
      retriesRef.current += 1;
      if (retriesRef.current > MAX_RETRIES) {
        console.warn("WebSocket: max retries reached, stopping reconnect.");
        return;
      }
      const delay = Math.min(3000 * 2 ** (retriesRef.current - 1), 60000);
      setTimeout(connect, delay);
    };

    wsRef.current = ws;
  }, [onMessage]);

  useEffect(() => {
    stoppedRef.current = false;
    connect();
    return () => {
      stoppedRef.current = true;
      wsRef.current?.close();
    };
  }, [connect]);
}