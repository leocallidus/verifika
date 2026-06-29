import { useEffect } from "react";
import { useNotifications } from "../store/notifications";
import { getToken } from "./client";

export function useSSE() {
  const push = useNotifications((s) => s.push);
  const setConnected = useNotifications((s) => s.setConnected);

  useEffect(() => {
    const tok = getToken();
    if (!tok) return;
    const apiBase = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";
    const url = `${apiBase}/api/v2/notifications/stream?token=${encodeURIComponent(tok)}`;
    const es = new EventSource(url);
    es.addEventListener("hello", () => setConnected(true));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        push({
          notification_id: data.notification_id ?? Math.floor(Math.random() * 1e9),
          user_role: "teacher",
          user_id: 0,
          event_type: data.event_type || "message",
          payload: data.payload || {},
          read_at: null,
          created_at: data.created_at || new Date().toISOString(),
        });
      } catch {}
    };
    es.onerror = () => setConnected(false);
    return () => {
      es.close();
      setConnected(false);
    };
  }, [push, setConnected]);
}
