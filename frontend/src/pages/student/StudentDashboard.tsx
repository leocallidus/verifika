import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, BookOpen, CheckCircle2, Clock3, Play, History, AlertCircle } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { ScoreBadge } from "../../components/ScoreBadge";
import { useAuth } from "../../store/auth";
import type { StudentDashboardOut, StudentNotificationsOut } from "../../types/api";

function fmt(dt: string) {
  return new Date(dt).toLocaleString("ru-RU");
}

function percent(done: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const q = useQuery<StudentDashboardOut>({
    queryKey: ["student", "dashboard"],
    queryFn: () => api.get("/api/student/dashboard").then((r) => r.data),
  });
  const notif = useQuery<StudentNotificationsOut>({
    queryKey: ["student", "notifications", { limit: 5 }],
    queryFn: () => api.get("/api/student/notifications?limit=5").then((r) => r.data),
  });

  return (
    <AppShell rightSlot={<div className="hidden md:flex items-center gap-2 text-sm text-[var(--color-text-muted)]">{user?.full_name}</div>}>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Дашборд</h1>
          {q.data && (
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Здравствуйте, {q.data.student.full_name}{q.data.student.group_name ? ` (${q.data.student.group_name})` : ""}. Обзор прогресса, активных тестов и уведомлений.
            </p>
          )}
          {!q.data && (
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Обзор прогресса, активных тестов и уведомлений.</p>
          )}
        </header>

        {q.isLoading && <Skeleton className="h-72 rounded-lg" />}
        {q.isError && <EmptyState icon={<AlertCircle />} title="Не удалось загрузить дашборд" description={errorMessage(q.error)} />}
        {q.data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card><div className="text-sm text-[var(--color-text-muted)]">Дисциплины</div><div className="mt-2 text-3xl font-semibold">{q.data.stats.disciplines_count}</div></Card>
              <Card><div className="text-sm text-[var(--color-text-muted)]">Завершено</div><div className="mt-2 text-3xl font-semibold">{q.data.stats.completed_sessions_count}</div></Card>
              <Card><div className="text-sm text-[var(--color-text-muted)]">Средний балл</div><div className="mt-2 text-3xl font-semibold">{q.data.stats.average_score_percent?.toFixed(1) ?? "—"}%</div></Card>
              <Card><div className="text-sm text-[var(--color-text-muted)]">Активные</div><div className="mt-2 text-3xl font-semibold">{q.data.stats.active_sessions_count}</div></Card>
            </div>

            <Card>
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold">Прогресс по темам</h2>
                <Badge tone="neutral">{q.data.topic_progress.length} дисциплин</Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {q.data.topic_progress.length === 0 && (
                  <EmptyState icon={<BookOpen />} title="Темы пока не назначены" className="py-10 lg:col-span-2" />
                )}
                {q.data.topic_progress.map((item) => {
                  const progress = percent(item.topics_completed, item.topics_total);
                  const isComplete = item.topics_total > 0 && item.topics_completed >= item.topics_total;
                  return (
                    <div key={item.discipline_id} className="rounded-lg border border-[var(--color-border)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{item.discipline_name}</div>
                          {item.next_topic_name && (
                            <div className="mt-1 text-xs text-[var(--color-text-muted)] truncate">Следующая тема: {item.next_topic_name}</div>
                          )}
                        </div>
                        <Badge tone={item.test_mode === "topic" ? "accent" : "neutral"}>
                          {item.test_mode === "topic" ? "по темам" : "общий"}
                        </Badge>
                      </div>
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-1">
                          <span>{item.topics_completed}/{item.topics_total} тем</span>
                          <span>{progress}%</span>
                        </div>
                        <div
                          className="h-2 rounded-full bg-[var(--color-bg-muted)] overflow-hidden"
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Badge tone={item.available_topic_tests_count > 0 ? "success" : "neutral"}>
                          доступно: {item.available_topic_tests_count}
                        </Badge>
                        <Badge tone="neutral">
                          средний: {item.average_score_percent?.toFixed(1) ?? "—"}%
                        </Badge>
                        {isComplete && (
                          <Badge tone="success" className="gap-1"><CheckCircle2 className="w-3 h-3" /> завершено</Badge>
                        )}
                        {item.next_topic_id && (
                          <Link to={`/student/topics/${item.next_topic_id}`} className="ml-auto">
                            <Button size="sm" variant="secondary">
                              {item.next_topic_attempts_left != null ? `Продолжить (${item.next_topic_attempts_left} попыт.)` : "Продолжить"}
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-lg font-semibold">Активные сессии</h2>
                  <Badge tone="accent">{q.data.unread_notifications_count} новых уведомл.</Badge>
                </div>
                <div className="space-y-3">
                  {q.data.active_sessions.length === 0 && <EmptyState icon={<Play />} title="Нет активных тестов" description="Продолжить нечего." className="py-10" />}
                  {q.data.active_sessions.map((s) => (
                    <div key={s.session_id} className="rounded-lg border border-[var(--color-border)] p-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{s.discipline_name}{s.topic_name ? ` · ${s.topic_name}` : ""}</div>
                        <div className="mt-1 text-sm text-[var(--color-text-muted)] flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> {fmt(s.expires_at)}</span>
                          <span>{s.answered_count}/{s.total_count}</span>
                        </div>
                      </div>
                      <Link to={`/student/test/${s.session_id}`}><Button size="sm" variant="secondary">Продолжить</Button></Link>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-lg font-semibold">Уведомления</h2>
                  <Link to="/student/notifications" className="text-xs text-[var(--color-accent)] hover:underline">Все</Link>
                </div>
                <div className="space-y-3">
                  {notif.isLoading && <Skeleton className="h-20 rounded-lg" />}
                  {!notif.isLoading && (notif.data?.items.length ?? 0) === 0 && (
                    <EmptyState icon={<Bell />} title="Нет новых уведомлений" className="py-10" />
                  )}
                  {notif.data?.items.slice(0, 5).map((n) => {
                    const Inner = (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{n.title}</div>
                          {n.body && <div className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2">{n.body}</div>}
                          <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{fmt(n.created_at)}</div>
                        </div>
                        {!n.is_read && <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />}
                      </div>
                    );
                    return n.link ? (
                      <Link key={n.notification_id} to={n.link} className="block rounded-lg border border-[var(--color-border)] p-3 hover:border-[var(--color-border-strong)]">
                        {Inner}
                      </Link>
                    ) : (
                      <div key={n.notification_id} className="rounded-lg border border-[var(--color-border)] p-3">
                        {Inner}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <h2 className="text-lg font-semibold mb-3">Ближайшие дедлайны</h2>
                <div className="space-y-3">
                  {q.data.upcoming_deadlines.length === 0 && <EmptyState icon={<BookOpen />} title="Дедлайнов нет" className="py-8" />}
                  {q.data.upcoming_deadlines.map((d) => (
                    <div key={d.topic_id} className="rounded-lg border border-[var(--color-border)] p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{d.topic_name}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{d.discipline_name} · до {fmt(d.available_until)}</div>
                      </div>
                      <Badge tone="warning">{d.attempts_left} попыт.</Badge>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <h2 className="text-lg font-semibold mb-3">Недавняя история</h2>
                <div className="space-y-3">
                  {q.data.recent_history.length === 0 && <EmptyState icon={<History />} title="Пока пусто" className="py-8" />}
                  {q.data.recent_history.map((s) => (
                    <Link key={s.session_id} to={`/student/results/${s.session_id}`} className="block rounded-lg border border-[var(--color-border)] p-3 hover:border-[var(--color-border-strong)]">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{s.discipline_name}{s.topic_name ? ` · ${s.topic_name}` : ""}</div>
                          <div className="text-xs text-[var(--color-text-muted)]">{s.completed_at ? fmt(s.completed_at) : ""}</div>
                        </div>
                        <ScoreBadge score={s.score} max={s.max_score} />
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
