import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Play, RotateCcw, BookOpen, Search, SlidersHorizontal } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { useToasts } from "../../components/ui/Toast";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/Feedback";
import { AppShell } from "../../components/AppShell";
import { ProtectedImage } from "../../components/ProtectedImage";
import { useAuth } from "../../store/auth";
import type { StudentDisciplinesOut, StudentTopicsOut } from "../../types/api";

export default function StudentHome() {
  const { user } = useAuth();
  const pushToast = useToasts((s) => s.push);
  const [openDisciplineId, setOpenDisciplineId] = useState<number | null>(() => {
    const raw = new URLSearchParams(window.location.search).get("discipline");
    return raw ? Number(raw) : null;
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "available" | "completed">("all");
  const [sort, setSort] = useState<"name" | "progress" | "deadline">("name");

  const disc = useQuery<StudentDisciplinesOut>({
    queryKey: ["student", "disciplines"],
    queryFn: () => api.get("/api/student/disciplines").then((r) => r.data),
  });

  const start = useMutation({
    mutationFn: (disciplineId: number) =>
      api.post(`/api/student/tests/${disciplineId}/start`).then((r) => r.data) as Promise<{
        session_id: number;
      }>,
    onSuccess: (d) => {
      pushToast("success", "Тест начат");
      window.location.href = `/student/test/${d.session_id}`;
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const topics = useQuery<StudentTopicsOut>({
    queryKey: ["student", "discipline-topics", openDisciplineId],
    queryFn: () => api.get(`/api/student/disciplines/${openDisciplineId}/topics`).then((r) => r.data),
    enabled: openDisciplineId != null,
  });

  const startTopic = useMutation({
    mutationFn: (topicId: number) =>
      api.post(`/api/student/topics/${topicId}/tests/start`).then((r) => r.data) as Promise<{ session_id: number }>,
    onSuccess: (d) => {
      pushToast("success", "Тест начат");
      window.location.href = `/student/test/${d.session_id}`;
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const visibleDisciplines = useMemo(() => {
    const items = disc.data?.disciplines ?? [];
    const needle = search.trim().toLowerCase();
    return items
      .filter((d) => {
        if (needle && !`${d.discipline_name} ${d.description ?? ""}`.toLowerCase().includes(needle)) return false;
        if (filter === "active") return d.has_active_session;
        if (filter === "available") {
          return d.test_mode === "topic"
            ? (d.available_topic_tests_count ?? 0) > 0
            : (d.general_test_available ?? ((d.attempts_left ?? 1) > 0));
        }
        if (filter === "completed") {
          return d.test_mode === "topic" && (d.topics_count ?? 0) > 0 && (d.completed_topic_tests_count ?? 0) >= (d.topics_count ?? 0);
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === "progress") {
          const ap = (a.completed_topic_tests_count ?? 0) / Math.max(1, a.topics_count ?? 0);
          const bp = (b.completed_topic_tests_count ?? 0) / Math.max(1, b.topics_count ?? 0);
          return bp - ap;
        }
        if (sort === "deadline") {
          const at = a.available_until ? new Date(a.available_until).getTime() : Number.MAX_SAFE_INTEGER;
          const bt = b.available_until ? new Date(b.available_until).getTime() : Number.MAX_SAFE_INTEGER;
          return at - bt;
        }
        return a.discipline_name.localeCompare(b.discipline_name, "ru");
      });
  }, [disc.data?.disciplines, filter, search, sort]);

  function toggleDiscipline(id: number) {
    const next = openDisciplineId === id ? null : id;
    setOpenDisciplineId(next);
    const url = new URL(window.location.href);
    if (next == null) url.searchParams.delete("discipline");
    else url.searchParams.set("discipline", String(next));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  return (
    <AppShell
      rightSlot={
        <div className="hidden md:flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <span>Привет,</span> <span className="font-medium text-[var(--color-text-primary)]">{user?.full_name}</span>
        </div>
      }
    >
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Доступные дисциплины</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Выберите дисциплину и начните тест.</p>
        </header>
        <Card className="mb-5">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по дисциплинам"
                className="input pl-9 w-full"
              />
            </label>
            <label className="relative">
              <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <select className="input pl-9 w-full" value={filter} onChange={(e) => setFilter(e.target.value as never)}>
                <option value="all">Все</option>
                <option value="active">С активной сессией</option>
                <option value="available">С доступными тестами</option>
                <option value="completed">Завершённые</option>
              </select>
            </label>
            <select className="input w-full" value={sort} onChange={(e) => setSort(e.target.value as never)}>
              <option value="name">По названию</option>
              <option value="progress">По прогрессу</option>
              <option value="deadline">По дедлайну</option>
            </select>
          </div>
        </Card>

        {disc.isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="h-32">
                <div className="h-3 w-24 rounded animate-pulse bg-[var(--color-bg-muted)]" />
                <div className="mt-3 h-2 w-40 rounded animate-pulse bg-[var(--color-bg-muted)]" />
              </Card>
            ))}
          </div>
        )}

        {disc.isError && (
          <EmptyState
            icon={<BookOpen />}
            title="Не удалось загрузить дисциплины"
            description="Попробуйте обновить страницу."
          />
        )}

        {disc.data && disc.data.disciplines.length === 0 && (
          <EmptyState
            icon={<BookOpen />}
            title="Дисциплин пока нет"
            description="Преподаватель ещё не назначил вам тесты."
          />
        )}

        {disc.data && disc.data.disciplines.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleDisciplines.map((d) => {
              const completed = d.completed_topic_tests_count ?? 0;
              const totalTopics = d.topics_count ?? 0;
              const availableTopicTests = d.available_topic_tests_count ?? 0;
              const usesTopicMode = (d.test_mode ?? ((d.enabled_topic_tests_count ?? 0) > 0 ? "topic" : "discipline")) === "topic";
              const canStartDisciplineTest = !usesTopicMode && (d.general_test_available ?? ((d.attempts_left ?? 1) > 0));
              const progress = totalTopics > 0 ? Math.round((completed / totalTopics) * 100) : 0;
              const modeLabel = usesTopicMode ? "Тест по теме" : "Тест по дисциплине";
              return (
              <Card key={d.discipline_id} className="flex flex-col gap-4 hover:border-[var(--color-border-strong)] transition">
                <div className="flex items-start gap-3">
                  <div className="grid place-items-center w-12 h-12 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] shrink-0 overflow-hidden">
                    {d.image_url ? (
                      <ProtectedImage src={d.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen className="w-5 h-5" strokeWidth={1.75} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[var(--color-text-primary)] truncate">{d.discipline_name}</h3>
                    {d.description && (
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{d.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                    <Badge tone={usesTopicMode ? "accent" : "neutral"}>{modeLabel}</Badge>
                    <Badge tone="neutral">{d.question_count} вопросов</Badge>
                    <Badge tone="neutral">{d.time_limit_minutes} мин</Badge>
                    <Badge tone="neutral">{d.topics_count ?? 0} тем</Badge>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-1">
                    <span>Прогресс тем</span>
                    <span>{completed}/{totalTopics}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--color-bg-muted)] overflow-hidden">
                    <div className="h-full bg-[var(--color-accent)]" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-text-muted)]">Средний балл: {d.average_score_percent?.toFixed(1) ?? "—"}%</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {(usesTopicMode || totalTopics > 0) && (
                    <Button
                      variant={usesTopicMode ? "secondary" : "ghost"}
                      onClick={() => toggleDiscipline(d.discipline_id)}
                    >
                      Темы ({totalTopics})
                    </Button>
                  )}
                  {usesTopicMode && (
                    <span className="text-xs text-[var(--color-text-muted)] mr-auto">
                      доступно тестов: {availableTopicTests}
                    </span>
                  )}
                  {d.has_active_session && d.active_session_id ? (
                    <Link to={`/student/test/${d.active_session_id}`}>
                      <Button iconLeft={<RotateCcw className="w-4 h-4" />} variant="secondary">
                        Продолжить
                      </Button>
                    </Link>
                  ) : usesTopicMode ? null : (
                    <Button
                      iconLeft={<Play className="w-4 h-4" />}
                      disabled={!canStartDisciplineTest}
                      loading={start.isPending && start.variables === d.discipline_id}
                      onClick={() => start.mutate(d.discipline_id)}
                    >
                      Начать тест по дисциплине
                    </Button>
                  )}
                </div>
                {openDisciplineId === d.discipline_id && (
                  <div className="border-t border-[var(--color-border)] pt-3 space-y-2">
                    {topics.isLoading && <div className="text-xs text-[var(--color-text-muted)]">Загрузка тем...</div>}
                    {topics.data?.topics.length === 0 && <div className="text-xs text-[var(--color-text-muted)]">Тем пока нет.</div>}
                    {topics.data?.topics.map((topic) => (
                      <div key={topic.topic_id} className="rounded-md border border-[var(--color-border)] p-2">
                        <div className="flex items-start gap-2">
                          <div className="w-10 h-10 rounded bg-[var(--color-bg-muted)] overflow-hidden grid place-items-center shrink-0">
                            {topic.image_url ? (
                              <ProtectedImage src={topic.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <BookOpen className="w-4 h-4 text-[var(--color-text-muted)]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{topic.name}</div>
                            {topic.description && <div className="text-xs text-[var(--color-text-muted)] line-clamp-2">{topic.description}</div>}
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge tone="neutral">{topic.question_count} вопросов</Badge>
                              <Badge tone="neutral">{topic.time_limit_minutes} мин</Badge>
                              <Badge tone={topic.available ? "success" : "neutral"}>{topic.available ? `${topic.attempts_left} попыт.` : topic.unavailable_reason ?? "недоступно"}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Link to={`/student/topics/${topic.topic_id}`} className="mr-2">
                            <Button size="sm" variant="ghost">Подробнее</Button>
                          </Link>
                          {topic.has_active_session && topic.active_session_id ? (
                            <Link to={`/student/test/${topic.active_session_id}`}>
                              <Button size="sm" variant="secondary" iconLeft={<RotateCcw className="w-4 h-4" />}>Продолжить</Button>
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              iconLeft={<Play className="w-4 h-4" />}
                              disabled={!topic.available}
                              loading={startTopic.isPending && startTopic.variables === topic.topic_id}
                              onClick={() => startTopic.mutate(topic.topic_id)}
                            >
                              Начать тест по теме
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );})}
          </div>
        )}
      </section>
    </AppShell>
  );
}
