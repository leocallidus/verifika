import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, Users, Building2, Bell, ShieldCheck, AlertTriangle } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { api, errorMessage } from "../../api/client";
import { adminApi, openAdminStream } from "../../api/admin";
import { getToken } from "../../api/client";
import type {
  AdminActiveSessionOut,
  AdminEventOut,
  AdminStatsSummaryOut,
} from "../../types/api";

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("ru-RU") : "—";

interface LiveEvent extends AdminEventOut {}

export default function AdminDashboard() {
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

  const stats = useQuery<AdminStatsSummaryOut>({
    queryKey: ["admin", "stats", "summary"],
    queryFn: () => adminApi.statsSummary().then((r) => r.data),
    refetchInterval: 15_000,
  });

  const sessions = useQuery({
    queryKey: ["admin", "sessions", "active"],
    queryFn: () => adminApi.activeSessions().then((r) => r.data),
    refetchInterval: 10_000,
  });

  const recentEvents = useQuery({
    queryKey: ["admin", "events", "recent"],
    queryFn: () => adminApi.listEvents({ page_size: 8 }).then((r) => r.data),
    refetchInterval: 10_000,
  });

  // SSE live feed (parallel channel alongside the requested /api/admin/stream).
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let counter = 0;
    const es = openAdminStream(token, (data) => {
      const ev: LiveEvent = {
        notification_id: -Date.now() - ++counter,  // negative to avoid colliding with DB IDs
        user_role: null,
        user_id: null,
        event_type: data.event_type,
        severity: data.severity ?? 0,
        channel: "admin",
        payload: (data.payload as Record<string, unknown>) ?? null,
        metadata: (data.metadata as Record<string, unknown>) ?? null,
        created_at: data.created_at ?? new Date().toISOString(),
      };
      setLiveEvents((prev) => [ev, ...prev].slice(0, 30));
    });
    return () => es.close();
  }, []);

  const mergedEvents: LiveEvent[] = [
    ...liveEvents.filter(
      (l) => !(recentEvents.data?.items ?? []).some((r) => r.event_type === l.event_type),
    ),
    ...(recentEvents.data?.items ?? []),
  ].slice(0, 12);

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-[var(--color-accent)]" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Дашборд администратора
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Сводка по пользователям, активные сессии и лента событий в реальном времени.
            </p>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mb-6">
          <SummaryCard
            icon={<Users className="w-5 h-5" />}
            label="Преподаватели"
            value={stats.data?.teachers_total ?? null}
            loading={stats.isLoading}
          />
          <SummaryCard
            icon={<Users className="w-5 h-5" />}
            label="Студенты"
            value={stats.data?.students_total ?? null}
            loading={stats.isLoading}
          />
          <SummaryCard
            icon={<Building2 className="w-5 h-5" />}
            label="Группы"
            value={stats.data?.groups_total ?? null}
            loading={stats.isLoading}
          />
          <SummaryCard
            icon={<Database className="w-5 h-5" />}
            label="Дисциплины"
            value={stats.data?.disciplines_total ?? null}
            loading={stats.isLoading}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--color-accent)]" />
                Активные сессии
              </h2>
              <Badge tone="info">
                {sessions.data?.items.length ?? 0}
              </Badge>
            </div>
            {sessions.isLoading && <Skeleton className="h-24 w-full" />}
            {sessions.isError && (
              <EmptyState
                icon={<AlertTriangle />}
                title="Не удалось загрузить"
                description={errorMessage(sessions.error)}
              />
            )}
            {sessions.data && sessions.data.items.length === 0 && (
              <EmptyState
                icon={<Activity />}
                title="Сейчас никто не проходит тест"
                description="Как только студент начнёт попытку — она появится здесь."
              />
            )}
            {sessions.data && sessions.data.items.length > 0 && (
              <ul className="divide-y divide-[var(--color-border)]">
                {sessions.data.items.map((s: AdminActiveSessionOut) => (
                  <li key={s.session_id} className="py-2 flex items-center gap-3">
                    <span className="grid place-items-center w-8 h-8 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] shrink-0">
                      <Activity className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{s.student_name}</div>
                      <div className="text-xs text-[var(--color-text-muted)] truncate">
                        {s.discipline_name} • {s.teacher_name}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] text-right">
                      <div>старт: {fmtDate(s.started_at)}</div>
                      <div>
                        {s.questions_answered}/{s.questions_total} ответов
                      </div>
                    </div>
                    <Badge
                      tone={s.status === "stuck" ? "warning" : s.status === "force_finished" ? "danger" : "success"}
                    >
                      {s.status === "stuck"
                        ? "застрял"
                        : s.status === "force_finished"
                          ? "завершена"
                          : "идёт"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4 text-[var(--color-accent)]" />
                Лента в реальном времени
              </h2>
              <span className="text-xs text-[var(--color-text-muted)]">
                {mergedEvents.length > 0 ? "live • SSE" : "—"}
              </span>
            </div>
            {mergedEvents.length === 0 && (
              <EmptyState
                icon={<Bell />}
                title="Событий пока нет"
                description="Новые события появятся здесь мгновенно."
              />
            )}
            <ul className="space-y-2 max-h-[480px] overflow-auto pr-1">
              {mergedEvents.map((e, idx) => (
                <li
                  key={e.notification_id ?? `${e.event_type}-${e.created_at}-${idx}`}
                  className="border border-[var(--color-border)] rounded-md p-2"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className={
                        "w-1.5 h-1.5 rounded-full inline-block " +
                        (e.severity >= 2
                          ? "bg-[var(--color-danger)]"
                          : e.severity >= 1
                            ? "bg-[var(--color-warning)]"
                            : "bg-[var(--color-success)]")
                      }
                    />
                    <span className="truncate">{e.event_type}</span>
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {fmtDate(e.created_at)}
                  </div>
                  {e.payload && (
                    <div className="text-xs mt-1 truncate">
                      {typeof e.payload === "string"
                        ? e.payload
                        : JSON.stringify(e.payload).slice(0, 160)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-3 mt-6">
          <a className="card hover:border-[var(--color-border-strong)] transition" href="/admin/users">
            <Users className="w-5 h-5 text-[var(--color-accent)] mb-2" />
            <div className="font-semibold">Пользователи</div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">CRUD преподавателей и студентов.</p>
          </a>
          <a className="card hover:border-[var(--color-border-strong)] transition" href="/admin/groups">
            <Building2 className="w-5 h-5 text-[var(--color-accent)] mb-2" />
            <div className="font-semibold">Группы</div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Архивирование и bulk-transfer.</p>
          </a>
          <a className="card hover:border-[var(--color-border-strong)] transition" href="/admin/disciplines">
            <Database className="w-5 h-5 text-[var(--color-accent)] mb-2" />
            <div className="font-semibold">Дисциплины</div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Привязка преподавателей.</p>
          </a>
        </div>
      </section>
    </AppShell>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  loading: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="grid place-items-center w-10 h-10 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
          <div className="text-2xl font-semibold mt-0.5">
            {loading ? <Skeleton className="h-7 w-16" /> : (value ?? "—")}
          </div>
        </div>
      </div>
    </Card>
  );
}
