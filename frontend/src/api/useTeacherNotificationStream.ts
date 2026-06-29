import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getToken } from "./client";
import { useAuth } from "../store/auth";
import { useToasts } from "../components/ui/Toast";
import { showSystemNotification } from "../lib/system-notifications";

let teacherStreamSubscribers = 0;
let teacherStream: EventSource | null = null;

function releaseTeacherStream() {
  teacherStreamSubscribers -= 1;
  if (teacherStreamSubscribers <= 0) {
    teacherStreamSubscribers = 0;
    teacherStream?.close();
    teacherStream = null;
  }
}

/**
 * TZ tz-teacher-production-ready.md § 3.3 — подписка преподавателя на
 * персональные уведомления через SSE и показ OS-уведомлений / Toast.
 */
export function useTeacherNotificationStream() {
  const user = useAuth((s) => s.user);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user || user.role !== "teacher") return;
    const tok = getToken();
    if (!tok) return;
    if (teacherStreamSubscribers > 0) {
      teacherStreamSubscribers += 1;
      return releaseTeacherStream;
    }
    teacherStreamSubscribers = 1;

    const base = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";
    const es = new EventSource(
      `${base}/api/teacher/notifications/stream?token=${encodeURIComponent(tok)}`,
    );
    teacherStream = es;

    es.onmessage = async (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.hello || data.keep) return;

        const payload = data.payload || {};
        const eventType = data.event_type || "";

        const title = payload.title || {
          student_attempt_finished: "Сессия студента завершена",
          student_attempt_started: "Студент начал тест",
          student_topic_attempt_started: "Студент начал тематический тест",
          grading_override: "Оценка изменена",
          comment_added: "Новый комментарий",
          discipline_assigned: "Назначение на дисциплину",
          discipline_revoked: "Отзыв с дисциплины",
          student_start_problem: "Проблема старта теста",
          attempts_exhausted: "У студента исчерпаны попытки",
          student_complaint: "Жалоба студента",
          ai_generation_failed: "Сбой генерации ИИ",
          proctor_violation: "Нарушение прокторинга",
        }[eventType] || "Событие";

        const body = payload.body || payload.summary || "";
        const link = payload.link || "";

        await queryClient.invalidateQueries({ queryKey: ["teacher", "notifications"] });
        await queryClient.invalidateQueries({ queryKey: ["teacher", "dashboard"] });

        const isCritical = [
          "student_attempt_finished",
          "student_start_problem",
          "attempts_exhausted",
          "student_complaint",
          "ai_generation_failed",
          "proctor_violation",
        ].includes(eventType) || (data.severity && data.severity >= 1);

        await showSystemNotification({
          title,
          body,
          link,
          severity: data.severity,
        });

        // Show in-app Toast with action button if it has a redirect link
        if (link) {
          pushToast({
            tone: isCritical ? "warning" : "info",
            title,
            body,
            action: {
              label: "Открыть",
              onClick: () => {
                window.location.href = link;
              },
            },
          });
        } else {
          pushToast(isCritical ? "warning" : "info", `${title}: ${body}`);
        }
      } catch (err) {
        console.error("Error processing teacher notification stream:", err);
      }
    };

    return releaseTeacherStream;
  }, [user, pushToast, queryClient]);
}
