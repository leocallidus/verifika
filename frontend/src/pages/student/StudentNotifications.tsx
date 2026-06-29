import { Link } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, CheckCheck, MessageSquare, Play, Trophy } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { useToasts } from "../../components/ui/Toast";
import { useStudentNotificationStream } from "../../api/useStudentNotificationStream";
import type { StudentNotificationsOut } from "../../types/api";

function fmt(dt: string) {
  return new Date(dt).toLocaleString("ru-RU");
}

export default function StudentNotifications() {
  useStudentNotificationStream();
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [filter, setFilter] = useState<"all" | "unread" | "tests" | "deadlines" | "grades" | "comments">("all");
  const q = useQuery<StudentNotificationsOut>({
    queryKey: ["student", "notifications", filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter === "unread") params.set("is_read", "false");
      if (filter === "tests") params.set("type", "test_available");
      if (filter === "deadlines") params.set("type", "deadline_approaching");
      if (filter === "grades") params.set("type", "test_graded");
      if (filter === "comments") params.set("type", "comment_added");
      return api.get(`/api/student/notifications?${params.toString()}`).then((r) => r.data);
    },
  });
  const readAll = useMutation({
    mutationFn: () => api.post("/api/student/notifications/read-all"),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["student", "notifications"] });
      pushToast("success", "Уведомления прочитаны");
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const markRead = useMutation({
    mutationFn: (id: number) => api.post(`/api/student/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student", "notifications"] }),
  });

  return (
    <AppShell>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Уведомления</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Новые тесты, дедлайны, оценки и комментарии.</p>
          </div>
          <Button variant="secondary" iconLeft={<CheckCheck className="w-4 h-4" />} loading={readAll.isPending} onClick={() => readAll.mutate()}>
            Прочитать все
          </Button>
        </header>
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            ["all", "Все"],
            ["unread", "Новые"],
            ["tests", "Тесты"],
            ["deadlines", "Дедлайны"],
            ["grades", "Оценки"],
            ["comments", "Комментарии"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value as typeof filter)}
              className={[
                "rounded-md border px-3 py-1.5 text-sm",
                filter === value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        {q.isLoading && <Skeleton className="h-48 rounded-lg" />}
        {q.isError && <EmptyState icon={<Bell />} title="Не удалось загрузить уведомления" description={errorMessage(q.error)} />}
        {q.data && q.data.items.length === 0 && <EmptyState icon={<Bell />} title="Уведомлений пока нет" />}
        {q.data && q.data.items.length > 0 && (
          <Card className="p-0 overflow-hidden">
            {q.data.items.map((n) => {
              const icon = n.type === "test_available"
                ? <Play className="w-4 h-4 text-[var(--color-accent)]" />
                : n.type === "deadline_approaching"
                  ? <CalendarClock className="w-4 h-4 text-[var(--color-warning)]" />
                  : n.type === "test_graded"
                    ? <Trophy className="w-4 h-4 text-[var(--color-success)]" />
                    : n.type === "comment_added"
                      ? <MessageSquare className="w-4 h-4 text-[var(--color-info)]" />
                      : <Bell className="w-4 h-4 text-[var(--color-text-muted)]" />;
              const content = (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    <span className="mt-0.5 shrink-0">{icon}</span>
                    <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium truncate">{n.title}</h2>
                      {!n.is_read && <Badge tone="accent">новое</Badge>}
                    </div>
                    {n.body && <p className="mt-1 text-sm text-[var(--color-text-muted)]">{n.body}</p>}
                    <div className="mt-2 text-xs text-[var(--color-text-muted)]">{fmt(n.created_at)}</div>
                    </div>
                  </div>
                  {!n.is_read && (
                    <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); markRead.mutate(n.notification_id); }}>
                      Прочитано
                    </Button>
                  )}
                </div>
              );
              return n.link ? (
                <Link key={n.notification_id} to={n.link} className="block p-4 border-b border-[var(--color-border)] hover:bg-[var(--color-bg-muted)]">
                  {content}
                </Link>
              ) : (
                <div key={n.notification_id} className="p-4 border-b border-[var(--color-border)]">
                  {content}
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </AppShell>
  );
}
