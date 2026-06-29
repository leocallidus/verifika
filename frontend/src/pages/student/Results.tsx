import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, History, Download, FileText, Search, SlidersHorizontal } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { useToasts } from "../../components/ui/Toast";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/Feedback";
import { Skeleton } from "../../components/ui/Feedback";
import { ScoreBadge } from "../../components/ScoreBadge";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../store/auth";
import { downloadBlob } from "../../api/downloads";
import type { SessionHistoryOut } from "../../types/api";

function fmt(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("ru-RU");
}
function duration(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}м ${s.toString().padStart(2, "0")}с`;
}

export default function Results() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [pdfSid, setPdfSid] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "in_progress">("all");
  const [sort, setSort] = useState<"recent" | "score" | "duration">("recent");

  const q = useQuery<SessionHistoryOut>({
    queryKey: ["student", "sessions"],
    queryFn: () => api.get("/api/student/sessions").then((r) => r.data),
  });

  const visibleSessions = useMemo(() => {
    const items = q.data?.sessions ?? [];
    const needle = search.trim().toLowerCase();
    return items
      .filter((s) => {
        if (needle && !`${s.discipline_name} ${s.topic_name ?? ""}`.toLowerCase().includes(needle)) return false;
        if (filter === "completed") return s.status === "completed";
        if (filter === "in_progress") return s.status === "in_progress";
        return true;
      })
      .sort((a, b) => {
        if (sort === "score") {
          const ap = a.max_score > 0 ? a.score / a.max_score : -1;
          const bp = b.max_score > 0 ? b.score / b.max_score : -1;
          return bp - ap;
        }
        if (sort === "duration") {
          const ad = a.completed_at ? new Date(a.completed_at).getTime() - new Date(a.started_at).getTime() : Number.MAX_SAFE_INTEGER;
          const bd = b.completed_at ? new Date(b.completed_at).getTime() - new Date(b.started_at).getTime() : Number.MAX_SAFE_INTEGER;
          return bd - ad;
        }
        return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
      });
  }, [q.data?.sessions, filter, sort, search]);

  async function onDownloadPdf(sessionId: number) {
    setPdfSid(sessionId);
    try {
      await downloadBlob(
        `/api/student/reports/sessions/${sessionId}.pdf`,
        `student-session-${sessionId}.pdf`,
      );
      pushToast("success", "PDF загружен");
    } catch (e) {
      pushToast("error", errorMessage(e));
    } finally {
      setPdfSid(null);
    }
  }

  return (
    <AppShell rightSlot={
      <div className="hidden md:flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <span>Привет,</span> <span className="font-medium text-[var(--color-text-primary)]">{user?.full_name}</span>
      </div>
    }>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">История попыток</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Все ваши завершённые и текущие сессии тестов.</p>
          </div>
          <Button variant="secondary" iconLeft={<Download className="w-4 h-4" />} onClick={() => q.data?.sessions[0] && onDownloadPdf(q.data.sessions[0].session_id)}>
            Отчёт PDF
          </Button>
        </header>

        {q.data && q.data.sessions.length > 0 && (
          <Card className="mb-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
              <label className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по дисциплине или теме"
                  className="input pl-9 w-full"
                />
              </label>
              <label className="relative">
                <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                <select className="input pl-9 w-full" value={filter} onChange={(e) => setFilter(e.target.value as never)}>
                  <option value="all">Все</option>
                  <option value="completed">Завершённые</option>
                  <option value="in_progress">В процессе</option>
                </select>
              </label>
              <select className="input w-full" value={sort} onChange={(e) => setSort(e.target.value as never)}>
                <option value="recent">Сначала новые</option>
                <option value="score">По баллу</option>
                <option value="duration">По длительности</option>
              </select>
            </div>
          </Card>
        )}

        {q.isLoading && (
          <Card className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </Card>
        )}
        {q.isError && (
          <EmptyState
            icon={<FileText />}
            title="Не удалось загрузить историю"
            description="Попробуйте обновить страницу."
          />
        )}
        {q.data && q.data.sessions.length === 0 && (
          <EmptyState
            icon={<History />}
            title="Попыток пока нет"
            description="Как только вы завершите тест, здесь появятся результаты."
          />
        )}
        {q.data && q.data.sessions.length > 0 && visibleSessions.length === 0 && (
          <EmptyState
            icon={<Search />}
            title="Ничего не найдено"
            description="Измените фильтры или строку поиска."
          />
        )}
        {q.data && visibleSessions.length > 0 && (
          <>
          <Card className="overflow-x-auto p-0 hidden md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)] bg-[var(--color-bg-muted)]">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Дисциплина</th>
                  <th className="py-2.5 px-4 font-medium">Начало</th>
                  <th className="py-2.5 px-4 font-medium">Конец</th>
                  <th className="py-2.5 px-4 font-medium">Длительность</th>
                  <th className="py-2.5 px-4 font-medium">Балл</th>
                  <th className="py-2.5 px-4 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map((s) => (
                  <tr key={s.session_id} className="border-t border-[var(--color-border)]">
                    <td className="py-2.5 px-4 font-medium text-[var(--color-text-primary)]">
                      <div>{s.discipline_name}</div>
                      {s.topic_name && <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{s.topic_name}</div>}
                    </td>
                    <td className="py-2.5 px-4 text-[var(--color-text-muted)] tabular-nums">{fmt(s.started_at)}</td>
                    <td className="py-2.5 px-4 text-[var(--color-text-muted)] tabular-nums">{fmt(s.completed_at)}</td>
                    <td className="py-2.5 px-4 text-[var(--color-text-muted)] tabular-nums">{duration(s.started_at, s.completed_at)}</td>
                    <td className="py-2.5 px-4"><ScoreBadge score={s.score} max={s.max_score} /></td>
                    <td className="py-2.5 px-4">
                      <Link to={`/student/results/${s.session_id}`} className="mr-2">
                        <Button size="sm" variant="ghost">Подробнее</Button>
                      </Link>
                      {s.status === "completed"
                        ? <Badge tone="success" className="gap-1"><CheckCircle2 className="w-3 h-3" /> завершён</Badge>
                        : <Badge tone="warning">в процессе</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-3 md:hidden">
            {visibleSessions.map((s) => (
              <Card key={s.session_id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{s.discipline_name}</div>
                    {s.topic_name && <div className="text-xs text-[var(--color-text-muted)]">{s.topic_name}</div>}
                    <div className="mt-1 text-xs text-[var(--color-text-muted)]">{fmt(s.started_at)}</div>
                    <div className="mt-2 text-xs text-[var(--color-text-muted)]">{duration(s.started_at, s.completed_at)}</div>
                  </div>
                  <ScoreBadge score={s.score} max={s.max_score} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Badge tone={s.status === "completed" ? "success" : "warning"}>{s.status === "completed" ? "завершён" : "в процессе"}</Badge>
                  <Link to={`/student/results/${s.session_id}`}><Button size="sm" variant="secondary">Подробнее</Button></Link>
                </div>
              </Card>
            ))}
          </div>
          </>
        )}
      </section>
    </AppShell>
  );
}

