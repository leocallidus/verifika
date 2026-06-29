import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, BookOpen, Calendar, Database, Users, LineChart, Radio, FileCheck } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Skeleton, EmptyState } from "../../components/ui/Feedback";
import { AppShell } from "../../components/AppShell";
import { SSEBadge } from "../../components/SSEBadge";
import { useSSE } from "../../api/sse";
import { useAuth } from "../../store/auth";
import type { TeacherDisciplinesOut } from "../../types/api";

export default function TeacherHome() {
  const { user } = useAuth();
  useSSE();
  const q = useQuery<TeacherDisciplinesOut>({
    queryKey: ["teacher", "disciplines"],
    queryFn: () => api.get("/api/teacher/disciplines").then((r) => r.data),
  });

  const pendingReviews = useQuery<{ total: number }>({
    queryKey: ["teacher", "pending-file-reviews-count"],
    queryFn: () =>
      api.get("/api/teacher/pending-file-reviews", { params: { page: 1, limit: 1 } }).then((r) => ({
        total: r.data.total ?? 0,
      })),
    refetchInterval: 60_000,
  });

  return (
    <AppShell
      rightSlot={
        <div className="hidden md:flex items-center gap-2">
          <SSEBadge />
        </div>
      }
    >
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Ваши дисциплины</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Управляйте расписанием, банком вопросов и группами.
          </p>
        </header>

        {q.isLoading && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="h-36">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-full mt-2" />
                <Skeleton className="h-3 w-2/3 mt-2" />
              </Card>
            ))}
          </div>
        )}
        {q.isError && (
          <EmptyState
            icon={<BookOpen />}
            title="Не удалось загрузить"
            description={errorMessage(q.error)}
          />
        )}
        {q.data && q.data.disciplines.length === 0 && (
          <EmptyState
            icon={<BookOpen />}
            title="Дисциплин пока нет"
            description="Обратитесь к администратору, чтобы получить назначения."
          />
        )}
        {q.data && q.data.disciplines.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {q.data.disciplines.map((d) => (
              <Card key={d.discipline_id} className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="grid place-items-center w-10 h-10 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] shrink-0">
                    <BookOpen className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-[var(--color-text-primary)] truncate">
                      {d.name}
                    </h2>
                    {d.description && (
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                        {d.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge tone="neutral">{d.question_count} вопросов</Badge>
                      <Badge tone="neutral">{d.time_limit_minutes} мин</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-[var(--color-border)]">
                  <Link
                    to={`/teacher/policy/${d.discipline_id}`}
                    className="btn btn-ghost btn-sm flex-1"
                  >
                    <Calendar className="w-3.5 h-3.5" /> Расписание
                  </Link>
                  <Link
                    to={`/teacher/bank?disc=${d.discipline_id}`}
                    className="btn btn-ghost btn-sm flex-1"
                  >
                    <Database className="w-3.5 h-3.5" /> Банк
                  </Link>
                  <Link
                    to="/teacher/diagnostics"
                    className="btn btn-ghost btn-sm flex-1"
                  >
                    <Activity className="w-3.5 h-3.5" /> Диагностика
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3 mt-6">
          <Link to="/teacher/dashboard" className="card hover:border-[var(--color-border-strong)] transition">
            <LineChart className="w-5 h-5 text-[var(--color-accent)] mb-2" />
            <div className="font-semibold">Дашборд</div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Аналитика, динамика и heatmap.</p>
          </Link>
          <Link to="/teacher/groups" className="card hover:border-[var(--color-border-strong)] transition">
            <Users className="w-5 h-5 text-[var(--color-accent)] mb-2" />
            <div className="font-semibold">Группы</div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Список студентов и журнал.</p>
          </Link>
          <Link to="/teacher/notifications" className="card hover:border-[var(--color-border-strong)] transition">
            <Radio className="w-5 h-5 text-[var(--color-accent)] mb-2" />
            <div className="font-semibold">SSE-лента</div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">События в реальном времени.</p>
          </Link>
        </div>

        <div className="mt-4">
          <Link
            to="/teacher/file-reviews"
            className="card hover:border-[var(--color-border-strong)] transition flex items-center gap-4"
          >
            <div className="grid place-items-center w-10 h-10 rounded-md bg-[var(--color-warning)]/10 text-[var(--color-warning)] shrink-0">
              <FileCheck className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">Файловые ответы на проверке</div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Студенческие работы, ожидающие ручной оценки.
              </p>
            </div>
            {pendingReviews.data != null && (
              <Badge tone={pendingReviews.data.total > 0 ? "warning" : "neutral"}>
                {pendingReviews.data.total > 0 ? `${pendingReviews.data.total} ожидает` : "0"}
              </Badge>
            )}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
