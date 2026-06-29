import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "./client";
import { useAuth } from "../store/auth";
import { useNotifications } from "../store/notifications";
import { showSystemNotification } from "../lib/system-notifications";

let studentStreamSubscribers = 0;
let studentStream: EventSource | null = null;

function releaseStudentStream(setConnected: (v: boolean) => void): boolean {
  studentStreamSubscribers -= 1;
  if (studentStreamSubscribers <= 0) {
    studentStreamSubscribers = 0;
    studentStream?.close();
    studentStream = null;
    setConnected(false);
    return true;
  }
  return false;
}

const STUDENT_NOTIFICATION_TITLES: Record<string, string> = {
  test_graded: "Тест оценён",
  student_attempt_finished: "Тест завершён",
  comment_added: "Новый комментарий",
  test_available: "Доступен тест",
  deadline_approaching: "Приближается дедлайн",
};

export function useStudentNotificationStream() {
  const qc = useQueryClient();
  const push = useNotifications((s) => s.push);
  const setConnected = useNotifications((s) => s.setConnected);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    if (!user || user.role !== "student") return;
    const tok = getToken();
    if (!tok) return;
    if (studentStreamSubscribers > 0) {
      studentStreamSubscribers += 1;
      return () => releaseStudentStream(setConnected);
    }
    studentStreamSubscribers = 1;

    const base = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";
    const es = new EventSource(`${base}/api/student/notifications/stream?token=${encodeURIComponent(tok)}`);
    studentStream = es;
    setConnected(true);
    let closed = false;
    const ping = async () => {
      try {
        await api.get("/api/student/notifications?limit=1");
        setConnected(true);
      } catch {
        if (!closed) setConnected(false);
      }
    };
    es.addEventListener("hello", () => setConnected(true));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const payload = data.payload || {};
        const eventType = data.event_type || "message";
        push({
          notification_id: data.notification_id ?? Date.now(),
          user_role: "student",
          user_id: 0,
          event_type: eventType,
          payload,
          read_at: null,
          created_at: data.created_at || new Date().toISOString(),
        });
        void qc.invalidateQueries({ queryKey: ["student", "notifications"] });
        void qc.invalidateQueries({ queryKey: ["student", "dashboard"] });
        void showSystemNotification({
          title: payload.title || STUDENT_NOTIFICATION_TITLES[eventType] || "Уведомление",
          body: payload.body || payload.summary || "",
          link: payload.link || "",
          severity: data.severity,
        });
      } catch {}
    };
    es.onerror = () => {
      setConnected(false);
      void ping();
    };
    return () => {
      closed = releaseStudentStream(setConnected);
    };
  }, [push, qc, setConnected, user]);
}
