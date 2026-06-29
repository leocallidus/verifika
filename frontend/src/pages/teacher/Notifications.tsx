import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Play,
  FileEdit,
  MessageSquare,
  BookOpen,
  AlertTriangle,
  Code,
  Bot,
  ShieldAlert,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../api/client";
import { useToasts } from "../../components/ui/Toast";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { useTeacherNotificationStream } from "../../api/useTeacherNotificationStream";
import type { TeacherNotificationsOut } from "../../types/api";

function fmt(dt: string) {
  return new Date(dt).toLocaleString("ru-RU");
}

const TYPE_LABELS: Record<string, string> = {
  student_attempt_finished: "Завершение теста",
  student_attempt_started: "Студент начал тест",
  student_topic_attempt_started: "Тематический тест",
  grading_override: "Изменение оценки",
  comment_added: "Комментарий",
  discipline_assigned: "Назначение",
  discipline_revoked: "Отзыв",
  student_start_problem: "Проблема старта",
  attempts_exhausted: "Попытки исчерпаны",
  student_complaint: "Жалоба студента",
  ai_generation_failed: "Сбой ИИ",
  proctor_violation: "Прокторинг",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  student_attempt_finished: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
  student_attempt_started: <Play className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
  student_topic_attempt_started: <Play className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
  grading_override: <FileEdit className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
  comment_added: <MessageSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />,
  discipline_assigned: <BookOpen className="w-4 h-4 text-purple-600 dark:text-purple-400" />,
  discipline_revoked: <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
  student_start_problem: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
  attempts_exhausted: <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />,
  student_complaint: <MessageSquare className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
  ai_generation_failed: <Bot className="w-4 h-4 text-red-600 dark:text-red-400" />,
  proctor_violation: <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400" />,
};

type Filter =
  | "all"
  | "unread"
  | "student_attempt_finished"
  | "student_start_problem"
  | "attempts_exhausted"
  | "student_complaint"
  | "ai_generation_failed"
  | "proctor_violation";

export default function TeacherNotifications() {
  useTeacherNotificationStream();
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [showJson, setShowJson] = useState(false);

  const q = useQuery<TeacherNotificationsOut>({
    queryKey: ["teacher", "notifications", filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter === "unread") params.set("is_read", "false");
      if (filter !== "all" && filter !== "unread") params.set("type", filter);
      return api
        .get(`/api/teacher/notifications?limit=100&${params.toString()}`)
        .then((r) => r.data);
    },
  });

  const readAll = useMutation({
    mutationFn: () => api.post("/api/teacher/notifications/read-all"),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["teacher", "notifications"] });
      pushToast("success", "Уведомления прочитаны");
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api.post(`/api/teacher/notifications/${id}/read`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["teacher", "notifications"] }),
  });

  const renderMetadata = (n: any) => {
    const meta = n.meta || {};
    if (!meta.student_name && !meta.discipline_name) return null;

    return (
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-[var(--color-bg)]/60 p-3 rounded-lg border border-[var(--color-border)]/60 text-xs">
        {meta.student_name && (
          <div>
            <span className="text-[var(--color-text-muted)] block mb-0.5">Студент</span>
            <Link
              to={`/teacher/reference/students/${meta.student_id}`}
              className="font-medium hover:underline text-[var(--color-accent)]"
            >
              {meta.student_name}
            </Link>
          </div>
        )}

        {meta.discipline_name && (
          <div>
            <span className="text-[var(--color-text-muted)] block mb-0.5">Дисциплина / Тема</span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {meta.discipline_name}
              {meta.topic_name ? ` — ${meta.topic_name}` : ""}
            </span>
          </div>
        )}

        {meta.score !== undefined && meta.max_score !== undefined && (
          <div>
            <span className="text-[var(--color-text-muted)] block mb-0.5">Баллы</span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {meta.score} / {meta.max_score} ({meta.max_score > 0 ? Math.round((meta.score / meta.max_score) * 100) : 0}%)
            </span>
          </div>
        )}

        {meta.session_id && (
          <div>
            <span className="text-[var(--color-text-muted)] block mb-0.5">ID Сессии</span>
            <span className="font-mono text-[var(--color-text-primary)]">
              #{meta.session_id}
            </span>
          </div>
        )}

        {meta.reason && (
          <div className="col-span-full">
            <span className="text-[var(--color-text-muted)] block mb-0.5">Причина изменения</span>
            <span className="font-medium text-[var(--color-text-primary)] italic">
              «{meta.reason}»
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppShell>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Уведомления</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              События ваших дисциплин и групп.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] select-none cursor-pointer bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-3 h-9 rounded-md">
              <input
                type="checkbox"
                checked={showJson}
                onChange={(e) => setShowJson(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] cursor-pointer"
              />
              <Code className="w-4 h-4 text-[var(--color-text-muted)]" />
              <span>Показать JSON</span>
            </label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="input w-auto min-w-[160px]"
              aria-label="Фильтр"
            >
              <option value="all">Все типы</option>
              <option value="unread">Непрочитанные</option>
              <option value="student_attempt_finished">Завершения тестов</option>
              <option value="student_start_problem">Проблемы старта</option>
              <option value="attempts_exhausted">Исчерпанные попытки</option>
              <option value="student_complaint">Жалобы студентов</option>
              <option value="ai_generation_failed">Сбои ИИ</option>
              <option value="proctor_violation">Прокторинг</option>
            </select>
            <Button
              variant="secondary"
              iconLeft={<CheckCheck className="w-4 h-4" />}
              loading={readAll.isPending}
              onClick={() => readAll.mutate()}
            >
              Прочитать все
            </Button>
          </div>
        </header>

        {q.isLoading && <Skeleton className="h-48 rounded-lg" />}
        {q.isError && (
          <EmptyState
            icon={<Bell />}
            title="Не удалось загрузить уведомления"
            description={errorMessage(q.error)}
          />
        )}
        {q.data && q.data.items.length === 0 && (
          <EmptyState icon={<Bell />} title="Уведомлений пока нет" />
        )}
        {q.data && q.data.items.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-[var(--color-border)]">
              {q.data.items.map((n) => {
                const titleClass = n.is_read
                  ? "text-[var(--color-text-muted)]"
                  : "text-[var(--color-text-primary)] font-medium";
                
                const icon = TYPE_ICONS[n.type] || <Bell className="w-4 h-4 text-[var(--color-text-muted)]" />;

                return (
                  <li
                    key={n.notification_id}
                    className="p-4 hover:bg-[var(--color-bg-muted)]/20 transition flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="grid place-items-center w-9 h-9 rounded-md bg-[var(--color-bg-muted)] shrink-0">
                          {icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className={`text-sm truncate ${titleClass}`}>{n.title}</h2>
                            <Badge tone="neutral">{TYPE_LABELS[n.type] ?? n.type}</Badge>
                            {!n.is_read && <Badge tone="accent">новое</Badge>}
                            <span className="text-xs text-[var(--color-text-muted)] ml-2">
                              {fmt(n.created_at)}
                            </span>
                          </div>
                          {n.body && (
                            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                              {n.body}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {n.link && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => navigate(n.link!)}
                          >
                            Открыть
                          </Button>
                        )}
                        {!n.is_read && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => markRead.mutate(n.notification_id)}
                          >
                            Прочитано
                          </Button>
                        )}
                      </div>
                    </div>

                    {renderMetadata(n)}

                    {showJson && (
                      <pre className="mt-2 text-[11px] font-mono bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] p-3 rounded-md border border-[var(--color-border)] overflow-x-auto max-h-40">
                        {JSON.stringify(n.meta || n, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </AppShell>
  );
}
