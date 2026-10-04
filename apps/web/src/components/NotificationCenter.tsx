import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { notificationEventSchema } from "@wrapt/contracts";

/** Hält die persistente Benachrichtigungsabfrage über den Ereigniskanal aktuell. */
export function NotificationCenter() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer = 0;
    let closed = false;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/notifications/ws`);
      socket.onopen = () => { retry = 0; };
      socket.onmessage = (event) => {
        let raw: unknown;
        try { raw = JSON.parse(String(event.data)); } catch { return; }
        if (!notificationEventSchema.safeParse(raw).success) return;
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      };
      socket.onclose = () => { if (!closed) timer = window.setTimeout(connect, Math.min(15_000, 1_000 * 2 ** retry++)); };
    };
    connect();
    return () => { closed = true; window.clearTimeout(timer); socket?.close(); };
  }, [queryClient]);

  return null;
}
