import { useQuery } from "@tanstack/react-query";
import { 
  Database, 
  Activity, 
  Bell, 
  ShieldCheck, 
  Cpu, 
  Layers, 
  Wifi, 
  Clock, 
  Terminal,
  RefreshCw 
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { errorMessage } from "../../api/client";
import { adminApi } from "../../api/admin";
import type { AdminHealthOut, AdminStatsSummaryOut } from "../../types/api";

export default function AdminHealth() {
  const health = useQuery<AdminHealthOut>({
    queryKey: ["admin", "health", "db"],
    queryFn: () => adminApi.healthDb().then((r) => r.data),
    refetchInterval: 10_000,
  });
  
  const stats = useQuery<AdminStatsSummaryOut>({
    queryKey: ["admin", "stats", "summary"],
    queryFn: () => adminApi.statsSummary().then((r) => r.data),
    refetchInterval: 15_000,
  });

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-[var(--color-accent)] animate-pulse" />
              Здоровье системы
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Мониторинг инфраструктуры: базы данных, очередей задач, SSE, провайдера ИИ и логов ошибок.
            </p>
          </div>
          <button 
            onClick={() => { health.refetch(); stats.refetch(); }}
            className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition"
          >
            <RefreshCw className={`w-4 h-4 ${(health.isFetching || stats.isFetching) ? "animate-spin" : ""}`} />
            Обновить статус
          </button>
        </header>

        {/* 1. Infrastructure Health Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Database Card */}
          <Card className="flex flex-col justify-between p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-muted)] flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                База данных
              </span>
              <Badge tone={health.data?.db_ok ? "success" : "danger"}>
                {health.data?.db_ok ? "Online" : "Offline"}
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">
                {health.isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : health.data?.db_ok ? (
                  `${health.data.db_latency_ms ?? "—"} ms`
                ) : (
                  "Недоступна"
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Задержка запроса SELECT 1
              </p>
            </div>
            {health.data?.last_migration && (
              <div className="text-xs border-t pt-2 mt-2 truncate text-[var(--color-text-muted)]">
                Версия схемы: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">{health.data.last_migration}</code>
              </div>
            )}
          </Card>

          {/* SSE Card */}
          <Card className="flex flex-col justify-between p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-muted)] flex items-center gap-2">
                <Wifi className="w-5 h-5 text-green-500" />
                Канал SSE (События)
              </span>
              <Badge tone="success">В сети</Badge>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">
                {health.isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  health.data?.sse_connections_count ?? 0
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Активных подписчиков на шине
              </p>
            </div>
            <div className="text-xs border-t pt-2 mt-2 text-[var(--color-text-muted)] truncate">
              Уведомлений в БД: {health.data?.notifications_count ?? 0}
            </div>
          </Card>

          {/* AI Provider Card */}
          <Card className="flex flex-col justify-between p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-muted)] flex items-center gap-2">
                <Cpu className="w-5 h-5 text-purple-500" />
                AI-провайдер
              </span>
              <Badge tone={health.data?.ai_enabled ? (health.data.ai_ok ? "success" : "warning") : "neutral"}>
                {!health.data?.ai_enabled ? "Отключен" : (health.data.ai_ok ? "Доступен" : "Ошибка")}
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">
                {health.isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : !health.data?.ai_enabled ? (
                  "ВЫКЛ"
                ) : health.data.ai_ok ? (
                  `${health.data.ai_latency_ms ?? "—"} ms`
                ) : (
                  "Ошибка подключения"
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Задержка API Polza.ai
              </p>
            </div>
            {health.data?.ai_model && (
              <div className="text-xs border-t pt-2 mt-2 truncate text-[var(--color-text-muted)]">
                Модель: <span className="font-mono text-[10px]">{health.data.ai_model}</span>
              </div>
            )}
          </Card>

          {/* API response times */}
          <Card className="flex flex-col justify-between p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-muted)] flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                Отклик API
              </span>
              <Badge tone="neutral">HTTP метрики</Badge>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">
                {health.isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : health.data?.api_response_stats?.avg_ms ? (
                  `${health.data.api_response_stats.avg_ms} ms`
                ) : (
                  "—"
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Среднее время ответа (скользящее)
              </p>
            </div>
            <div className="text-xs border-t pt-2 mt-2 text-[var(--color-text-muted)] flex justify-between">
              <span>Мин: {health.data?.api_response_stats?.min_ms ?? 0} ms</span>
              <span>Макс: {health.data?.api_response_stats?.max_ms ?? 0} ms</span>
              <span>Всего: {health.data?.api_response_stats?.count ?? 0}</span>
            </div>
          </Card>
        </div>

        {/* 2. Middle Row: Queues and Stats */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* AI Task Queues Status */}
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-[var(--color-accent)]" />
              Очередь фоновой генерации (ИИ)
            </h2>
            {health.isLoading && <Skeleton className="h-24 w-full" />}
            {health.data && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50">
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">В обработке</div>
                    <div className="text-2xl font-bold mt-1 text-blue-700 dark:text-blue-300">
                      {health.data.ai_generation_tasks?.processing ?? 0}
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg border border-green-100 dark:border-green-900/50">
                    <div className="text-xs text-green-600 dark:text-green-400 font-medium">Завершено</div>
                    <div className="text-2xl font-bold mt-1 text-green-700 dark:text-green-300">
                      {health.data.ai_generation_tasks?.done ?? 0}
                    </div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-100 dark:border-red-900/50">
                    <div className="text-xs text-red-600 dark:text-red-400 font-medium">Ошибки</div>
                    <div className="text-2xl font-bold mt-1 text-red-700 dark:text-red-300">
                      {health.data.ai_generation_tasks?.error ?? 0}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] text-center">
                  Фоновые задачи FastAPI BackgroundTasks по генерации вопросов
                </p>
              </div>
            )}
          </Card>

          {/* System stats */}
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-[var(--color-accent)]" />
              Сводная статистика
            </h2>
            {stats.isLoading && <Skeleton className="h-24 w-full" />}
            {stats.isError && (
              <EmptyState title="Не удалось загрузить сводку" description={errorMessage(stats.error)} />
            )}
            {stats.data && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <Cell label="Пользователей" value={stats.data.users_total} />
                <Cell label="Студентов" value={stats.data.students_total} />
                <Cell label="Преподавателей" value={stats.data.teachers_total} />
                <Cell label="Групп" value={stats.data.groups_total} />
                <Cell label="Дисциплин" value={stats.data.disciplines_total} />
                <Cell label="Попыток за 24ч" value={stats.data.attempts_last_24h} />
              </div>
            )}
          </Card>
        </div>

        {/* 3. Bottom Row: Recent Error Logs */}
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-[var(--color-accent)]" />
              Последние ошибки (Лог-файл)
            </span>
            <Badge tone="neutral">logs/app.log</Badge>
          </h2>
          {health.isLoading && <Skeleton className="h-48 w-full" />}
          {health.data && (
            <div className="border rounded-lg overflow-hidden bg-slate-950 dark:bg-slate-900/50">
              <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-900 text-slate-400 text-xs font-mono">
                <span>TERMINAL VIEW - ERRORS & CRITICALS</span>
                <span>Newest first</span>
              </div>
              <div className="p-4 font-mono text-xs text-slate-300 space-y-3 overflow-y-auto max-h-[300px]">
                {!health.data.recent_errors || health.data.recent_errors.length === 0 ? (
                  <div className="text-slate-500 text-center py-8">
                    Ошибок в логе за последнее время не обнаружено. Система работает штатно!
                  </div>
                ) : (
                  health.data.recent_errors.map((err, idx) => (
                    <div key={idx} className="flex flex-col space-y-1 pb-3 border-b border-slate-800 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">{err.timestamp || "—"}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          err.level === "CRITICAL" ? "bg-red-900 text-red-200" : "bg-orange-950 text-orange-400"
                        }`}>
                          {err.level}
                        </span>
                      </div>
                      <div className="text-slate-200 whitespace-pre-wrap select-text selection:bg-slate-700">
                        {err.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </Card>
      </section>
    </AppShell>
  );
}

function Cell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border">
      <div className="text-xs text-[var(--color-text-muted)] font-medium truncate">{label}</div>
      <div className="font-semibold text-lg mt-0.5">{value}</div>
    </div>
  );
}
