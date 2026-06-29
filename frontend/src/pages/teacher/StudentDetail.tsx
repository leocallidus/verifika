import { Link, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Check,
  X,
  Pencil,
  MessageSquarePlus,
  MessageSquare,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Minimize2,
  AppWindow,
  Keyboard,
  Aperture,
  Camera,
  CameraOff,
  Activity,
  History,
  KeyRound,
  LogIn,
  Bell,
  Clock3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { useToasts } from "../../components/ui/Toast";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Field, Textarea, Input } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { AppShell } from "../../components/AppShell";
import { ScoreBadge } from "../../components/ScoreBadge";
import { downloadBlob } from "../../api/downloads";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import type { StudentActivityItemOut, StudentDetailOut, TeacherStudentActivityOut } from "../../types/api";

function fmt(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("ru-RU");
}

interface ProctorEvent {
  event_id: number;
  session_id: number;
  event_type: string;
  metadata?: any;
  created_at: string;
}

interface ProctorLog {
  session_id: number;
  proctor_level: number;
  events: ProctorEvent[];
}

function activityIcon(item: StudentActivityItemOut) {
  if (item.category === "auth") return <LogIn className="w-4 h-4" />;
  if (item.category === "security") return <KeyRound className="w-4 h-4" />;
  if (item.category === "notification") return <Bell className="w-4 h-4" />;
  return <History className="w-4 h-4" />;
}

function activityTone(item: StudentActivityItemOut): "neutral" | "accent" | "success" | "warning" | "danger" {
  if (item.type === "auth_login_failed") return "danger";
  if (item.category === "security") return "warning";
  if (item.category === "notification") return item.is_read === false ? "accent" : "neutral";
  if (item.type.includes("finished")) return "success";
  if (item.category === "test") return "accent";
  return "neutral";
}

function StudentActivityPanel({ studentId }: { studentId: number }) {
  const q = useQuery<TeacherStudentActivityOut>({
    queryKey: ["teacher", "students", studentId, "activity"],
    queryFn: () => api.get(`/api/teacher/students/${studentId}/activity?limit=12`).then((r) => r.data),
    enabled: Number.isFinite(studentId),
  });

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl">Активность</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Входы, тесты, пароль и уведомления.</p>
        </div>
        {q.data && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="neutral">аудит: {q.data.audit_count}</Badge>
            <Badge tone="neutral">уведомления: {q.data.notification_count}</Badge>
          </div>
        )}
      </div>
      {q.isLoading && <Skeleton className="h-32 rounded-lg" />}
      {q.isError && (
        <EmptyState icon={<History />} title="Активность недоступна" description={errorMessage(q.error)} />
      )}
      {q.data && q.data.items.length === 0 && (
        <EmptyState icon={<History />} title="Событий пока нет" />
      )}
      {q.data && q.data.items.length > 0 && (
        <div className="divide-y divide-[var(--color-border)]">
          {q.data.items.map((item) => (
            <div key={item.id} className="py-3 flex items-start gap-3">
              <div className="grid place-items-center w-9 h-9 rounded-md bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] shrink-0">
                {activityIcon(item)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={activityTone(item)}>{item.title}</Badge>
                  <span className="text-xs text-[var(--color-text-muted)] inline-flex items-center gap-1 ml-auto">
                    <Clock3 className="w-3 h-3" />
                    {fmt(item.created_at)}
                  </span>
                </div>
                {item.body && <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{item.body}</p>}
                <div className="mt-1 text-xs text-[var(--color-text-muted)] flex flex-wrap gap-2">
                  <span>{item.source}</span>
                  {item.session_id && <span>сессия #{item.session_id}</span>}
                  {item.ip_addr && <span>IP {item.ip_addr}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ProctorLogSection({ sessionId }: { sessionId: number }) {
  const [open, setOpen] = useState(false);
  
  const { data, isLoading, isError } = useQuery<ProctorLog>({
    queryKey: ["proctor-log", sessionId],
    queryFn: () => api.get(`/api/v2/teacher/sessions/${sessionId}/proctor-log`).then((r) => r.data),
    enabled: open,
  });

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="mt-2 text-xs"
        onClick={() => setOpen(true)}
      >
        Показать журнал прокторинга
      </Button>
    );
  }

  const events = data?.events ?? [];
  const level = data?.proctor_level ?? 0;

  // Filter webcam snapshots to display in a carousel
  const snapshots = events.filter(e => e.event_type === "webcam_snapshot");

  // Violation count (tab switches, exits, screenshot tool detected, etc.)
  const violationCount = events.filter(e => 
    ["tab_blur", "exit_fullscreen", "key_violation", "app_minimized", "screenshot_tool_detected"].includes(e.event_type)
  ).length;

  return (
    <div className="mt-4 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-elevated)] space-y-4 text-left">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <span>Журнал прокторинга (Уровень: {level})</span>
          {violationCount > 5 ? (
            <Badge tone="danger">Высокий риск списывания ({violationCount} наруш.)</Badge>
          ) : violationCount > 0 ? (
            <Badge tone="warning">Средний риск ({violationCount} наруш.)</Badge>
          ) : (
            <Badge tone="success">Нарушений нет</Badge>
          )}
        </h4>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Скрыть</Button>
      </div>

      {isLoading && <div className="text-xs text-[var(--color-text-muted)] animate-pulse">Загрузка протокола прокторинга...</div>}
      {isError && <div className="text-xs text-[var(--color-danger)]">Не удалось загрузить лог прокторинга.</div>}

      {data && (
        <>
          {/* Webcam Snapshots Gallery / Carousel */}
          {snapshots.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Снимки веб-камеры:</span>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {snapshots.map((snap) => {
                  const url = snap.metadata?.photo_url;
                  return (
                    <div key={snap.event_id} className="flex-shrink-0 w-36 border border-[var(--color-border)] rounded-md overflow-hidden bg-black flex flex-col">
                      {url ? (
                        <img 
                          src={url} 
                          alt="Webcam Snapshot" 
                          className="w-full h-24 object-cover cursor-pointer hover:opacity-80 transition"
                          onClick={() => window.open(url, "_blank")}
                        />
                      ) : (
                        <div className="w-full h-24 bg-zinc-800 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
                          Нет фото
                        </div>
                      )}
                      <span className="text-[10px] text-[var(--color-text-muted)] p-1 text-center truncate">
                        {new Date(snap.created_at).toLocaleTimeString("ru-RU")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Timeline of events */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Таймлайн событий:</span>
            {events.length === 0 ? (
              <div className="text-xs italic text-[var(--color-text-muted)]">Журнал пуст (нет зарегистрированных событий).</div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {events.map((e) => {
                  const timeStr = new Date(e.created_at).toLocaleTimeString("ru-RU");

                  let label = e.event_type;
                  let colorClass = "text-[var(--color-text-primary)]";
                  let Icon: LucideIcon = Activity;
                  let pulse = false;

                  if (e.event_type === "tab_blur") {
                    label = "Уход с вкладки (Потеря фокуса)";
                    colorClass = "text-yellow-600 dark:text-yellow-400 font-medium";
                    Icon = AlertTriangle;
                  } else if (e.event_type === "tab_focus") {
                    label = `Вернулся на вкладку (Отсутствовал: ${e.metadata?.seconds_away ?? "?"} сек)`;
                    colorClass = "text-emerald-600 dark:text-emerald-400";
                    Icon = CheckCircle2;
                  } else if (e.event_type === "exit_fullscreen") {
                    label = "Выход из полноэкранного режима!";
                    colorClass = "text-red-600 dark:text-red-400 font-bold";
                    Icon = Minimize2;
                  } else if (e.event_type === "app_minimized") {
                    label = "Приложение свернуто или потеряло системный фокус!";
                    colorClass = "text-red-600 dark:text-red-400 font-bold";
                    Icon = AppWindow;
                  } else if (e.event_type === "key_violation") {
                    label = `Попытка нажатия запрещенных клавиш: ${e.metadata?.key ?? "?"}`;
                    colorClass = "text-red-600 dark:text-red-400 font-bold";
                    Icon = Keyboard;
                  } else if (e.event_type === "screenshot_tool_detected") {
                    label = "Обнаружена запущенная утилита скриншотов!";
                    colorClass = "text-red-600 dark:text-red-400 font-bold";
                    Icon = Aperture;
                    pulse = true;
                  } else if (e.event_type === "no_webcam_device") {
                    label = "Камера недоступна (нет устройства или доступ отклонён)";
                    colorClass = "text-yellow-600 dark:text-yellow-400 font-medium";
                    Icon = CameraOff;
                  } else if (e.event_type === "webcam_snapshot") {
                    label = "Снимок веб-камеры";
                    colorClass = "text-[var(--color-text-muted)]";
                    Icon = Camera;
                  }

                  return (
                    <div key={e.event_id} className="flex items-start gap-2 text-xs py-1 border-b border-[var(--color-border)]/30 last:border-b-0">
                      <span className="text-[var(--color-text-muted)] tabular-nums shrink-0">{timeStr}</span>
                      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${colorClass} ${pulse ? "animate-pulse" : ""}`} />
                      <span className={colorClass}>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}


export default function StudentDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const sid = Number(studentId);
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [activeDiscipline, setActiveDiscipline] = useState<number | null>(null);
  
  // Filtering state
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [completionStatus, setCompletionStatus] = useState<string>("all");

  const [overrideFor, setOverrideFor] = useState<number | null>(null);
  const [overrideScore, setOverrideScore] = useState<number>(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [commentFor, setCommentFor] = useState<{ sessionId: number; questionId: number; questionText: string } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [attemptCommentFor, setAttemptCommentFor] = useState<number | null>(null);
  const [attemptCommentText, setAttemptCommentText] = useState("");

  const q = useQuery<StudentDetailOut>({
    queryKey: ["teacher", "students", sid],
    queryFn: () => api.get(`/api/teacher/students/${sid}`).then((r) => r.data),
    enabled: Number.isFinite(sid),
  });

  const overrideMut = useMutation({
    mutationFn: (vars: { sessionId: number; score: number; reason: string }) =>
      api
        .post(`/api/v2/teacher/grading/sessions/${vars.sessionId}/override_score`, {
          score: vars.score,
          reason: vars.reason,
        })
        .then((r) => r.data),
    onSuccess: async () => {
      pushToast("success", "Оценка переопределена");
      setOverrideFor(null);
      await qc.invalidateQueries({ queryKey: ["teacher", "students", sid] });
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const commentMut = useMutation({
    mutationFn: (vars: { sessionId: number; questionId: number; body: string }) =>
      api
        .post(`/api/v2/teacher/grading/sessions/${vars.sessionId}/comments`, {
          question_id: vars.questionId,
          body: vars.body,
        })
        .then((r) => r.data),
    onSuccess: async () => {
      pushToast("success", "Комментарий сохранён");
      setCommentFor(null);
      setCommentText("");
      await qc.invalidateQueries({ queryKey: ["teacher", "students", sid] });
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const attemptCommentMut = useMutation({
    mutationFn: (vars: { sessionId: number; body: string }) =>
      api
        .post(`/api/v2/teacher/grading/sessions/${vars.sessionId}/comment`, {
          body: vars.body,
        })
        .then((r) => r.data),
    onSuccess: async () => {
      pushToast("success", "Комментарий к попытке сохранён");
      setAttemptCommentFor(null);
      setAttemptCommentText("");
      await qc.invalidateQueries({ queryKey: ["teacher", "students", sid] });
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const disciplines = q.data?.disciplines ?? [];
  const currentId = activeDiscipline ?? disciplines[0]?.discipline_id ?? null;
  const current = disciplines.find((d) => d.discipline_id === currentId);

  // Reset filters when changing active discipline
  useEffect(() => {
    setSelectedTopic("all");
    setCompletionStatus("all");
  }, [currentId]);

  // Unique topics list for the filter
  const uniqueTopics = Array.from(
    new Set(current?.sessions.map((s) => s.topic_name).filter(Boolean) as string[])
  );

  // Filtered sessions
  const filteredSessions = current?.sessions.filter((s) => {
    if (selectedTopic !== "all" && s.topic_name !== selectedTopic) {
      return false;
    }
    if (completionStatus === "completed" && !s.completed_at) {
      return false;
    }
    if (completionStatus === "in_progress" && s.completed_at) {
      return false;
    }
    return true;
  }) ?? [];

  // Strong and Weak Topics logic
  const getTopicStats = () => {
    if (!current) return { strong: [], weak: [] };
    const topicScores: Record<string, { totalPct: number; count: number }> = {};

    current.sessions.forEach((s) => {
      if (s.completed_at && s.topic_name) {
        const pct = (s.score / s.max_score) * 100;
        if (!topicScores[s.topic_name]) {
          topicScores[s.topic_name] = { totalPct: 0, count: 0 };
        }
        topicScores[s.topic_name].totalPct += pct;
        topicScores[s.topic_name].count += 1;
      }
    });

    const stats = Object.entries(topicScores).map(([name, data]) => ({
      name,
      avg: data.totalPct / data.count,
    }));

    const strong = [...stats].sort((a, b) => b.avg - a.avg).slice(0, 3);
    const weak = [...stats].sort((a, b) => a.avg - b.avg).slice(0, 3);

    return { strong, weak };
  };

  const { strong, weak } = getTopicStats();

  return (
    <AppShell
      rightSlot={
        <div className="hidden md:flex items-center gap-2">
          {q.data && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Download className="w-4 h-4" />}
              onClick={() => downloadBlob(`/api/v2/teacher/reports/students/${sid}.pdf`, `student-${sid}.pdf`)}
            >
              Экспорт PDF (Все)
            </Button>
          )}
          <Link to="/teacher/groups" className="hidden md:inline-flex btn btn-ghost btn-sm">
            К группам
          </Link>
        </div>
      }
    >
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <Link
          to="/teacher/groups"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] inline-flex items-center gap-1.5 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> К группам
        </Link>
        {q.data && (
          <>
            <header className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{q.data.full_name}</h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Группа: {q.data.group_name ?? "—"} · {q.data.email}
              </p>
            </header>

            <div className="mb-6">
              <StudentActivityPanel studentId={sid} />
            </div>

            {disciplines.length === 0 ? (
              <Card className="text-center py-12 text-[var(--color-text-muted)]">
                По вашим дисциплинам нет попыток.
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-[280px_1fr]">
                {/* Sidebar */}
                <aside className="md:sticky md:top-20 self-start space-y-4">
                  <Card className="p-3 space-y-1">
                    <div className="text-xs uppercase font-semibold tracking-wider text-[var(--color-text-muted)] mb-2 px-2">
                      Дисциплины
                    </div>
                    {disciplines.map((d) => {
                      const active = currentId === d.discipline_id;
                      return (
                        <button
                          key={d.discipline_id}
                          type="button"
                          onClick={() => setActiveDiscipline(d.discipline_id)}
                          className={
                            "w-full text-left px-3 py-2.5 rounded-md text-sm transition border " +
                            (active
                              ? "bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30 text-[var(--color-text-primary)]"
                              : "border-transparent hover:bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]")
                          }
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate mr-1">{d.discipline_name}</span>
                            <ChevronRight className="w-3.5 h-3.5 opacity-50 shrink-0" />
                          </div>
                          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">попыток: {d.sessions.length}</div>
                        </button>
                      );
                    })}
                  </Card>
                </aside>

                {/* Main content */}
                <div className="space-y-6">
                  {current && (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h2 className="font-semibold text-xl">{current.discipline_name}</h2>
                      </div>

                      {/* Strong/Weak Topics Widget */}
                      {(strong.length > 0 || weak.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Card className="border-emerald-200/50 dark:border-emerald-900/30 bg-emerald-50/10 dark:bg-emerald-950/5">
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold mb-3">
                              <TrendingUp className="w-4 h-4" />
                              <span>Сильные темы (топ-3)</span>
                            </div>
                            {strong.length === 0 ? (
                              <p className="text-xs text-[var(--color-text-muted)]">Нет данных</p>
                            ) : (
                              <ul className="space-y-2">
                                {strong.map((t, i) => (
                                  <li key={i} className="flex justify-between items-center text-sm gap-4">
                                    <span className="truncate text-[var(--color-text-secondary)]">{t.name}</span>
                                    <Badge tone="success">{t.avg.toFixed(0)}%</Badge>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </Card>

                          <Card className="border-rose-200/50 dark:border-rose-900/30 bg-rose-50/10 dark:bg-rose-950/5">
                            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold mb-3">
                              <TrendingDown className="w-4 h-4" />
                              <span>Слабые темы (топ-3)</span>
                            </div>
                            {weak.length === 0 ? (
                              <p className="text-xs text-[var(--color-text-muted)]">Нет данных</p>
                            ) : (
                              <ul className="space-y-2">
                                {weak.map((t, i) => (
                                  <li key={i} className="flex justify-between items-center text-sm gap-4">
                                    <span className="truncate text-[var(--color-text-secondary)]">{t.name}</span>
                                    <Badge tone="danger">{t.avg.toFixed(0)}%</Badge>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </Card>
                        </div>
                      )}

                      {/* Filters */}
                      <Card className="p-4">
                        <div className="flex flex-col sm:flex-row items-end gap-4">
                          <div className="w-full sm:w-1/2">
                            <label className="label flex items-center gap-1.5">
                              <Filter className="w-3.5 h-3.5" /> Тема
                            </label>
                            <div className="relative">
                              <select
                                value={selectedTopic}
                                onChange={(e) => setSelectedTopic(e.target.value)}
                                className="input pr-8 appearance-none bg-no-repeat bg-[right_0.5rem_center]"
                                style={{
                                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                                  backgroundSize: "1.25rem",
                                }}
                              >
                                <option value="all">Все темы</option>
                                {uniqueTopics.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="w-full sm:w-1/2">
                            <label className="label">Статус попытки</label>
                            <div className="relative">
                              <select
                                value={completionStatus}
                                onChange={(e) => setCompletionStatus(e.target.value)}
                                className="input pr-8 appearance-none bg-no-repeat bg-[right_0.5rem_center]"
                                style={{
                                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                                  backgroundSize: "1.25rem",
                                }}
                              >
                                <option value="all">Все статусы</option>
                                <option value="completed">Завершенные</option>
                                <option value="in_progress">В процессе</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </Card>

                      {/* Sessions List */}
                      {filteredSessions.length === 0 ? (
                        <Card className="text-center text-[var(--color-text-muted)] text-sm py-8">
                          Нет попыток, соответствующих выбранным фильтрам.
                        </Card>
                      ) : (
                        filteredSessions.map((s) => (
                          <Card key={s.session_id} className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] pb-3">
                              <div>
                                <div className="font-semibold text-base flex flex-wrap items-center gap-2">
                                  <span>Сессия #{s.session_id}</span>
                                  {s.topic_name && <Badge tone="accent">{s.topic_name}</Badge>}
                                </div>
                                <div className="text-xs text-[var(--color-text-muted)] mt-1">
                                  Начало: {fmt(s.started_at)}
                                  {s.completed_at && ` · Завершено: ${fmt(s.completed_at)}`}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <ScoreBadge score={s.score} max={s.max_score} />
                                {s.score_overridden && <Badge tone="warning">override</Badge>}
                                <div className="flex gap-1.5 ml-2">
                                  {s.completed_at && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        iconLeft={<Pencil className="w-3.5 h-3.5" />}
                                        onClick={() => {
                                          setOverrideFor(s.session_id);
                                          setOverrideScore(s.score);
                                          setOverrideReason(s.override_reason ?? "");
                                        }}
                                      >
                                        Переопределить
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        iconLeft={<MessageSquare className="w-3.5 h-3.5" />}
                                        onClick={() => {
                                          setAttemptCommentFor(s.session_id);
                                          setAttemptCommentText(s.comment ?? "");
                                        }}
                                      >
                                        {s.comment ? "Изменить коммент" : "Прокомментировать"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        iconLeft={<Download className="w-3.5 h-3.5" />}
                                        onClick={() =>
                                          downloadBlob(
                                            `/api/v2/teacher/reports/sessions/${s.session_id}.pdf`,
                                            `session-${s.session_id}.pdf`
                                          )
                                        }
                                        title="Скачать PDF отчет по попытке"
                                      >
                                        PDF
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            {s.score_overridden && s.override_reason && (
                              <div className="text-xs italic text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md">
                                Причина: «{s.override_reason}»
                              </div>
                            )}
                            {s.comment && (
                              <div className="text-xs text-teal-800 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 px-3 py-2 rounded-md flex items-start gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <div>
                                  <span className="font-semibold">Комментарий к попытке:</span> «{s.comment}»
                                </div>
                              </div>
                            )}

                            {s.answers.length === 0 ? (
                              <div className="text-xs text-[var(--color-text-muted)] italic">Студент не ответил ни на один вопрос.</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)] bg-[var(--color-bg-muted)]/30">
                                    <tr>
                                      <th className="py-2 px-3 font-medium">Вопрос</th>
                                      <th className="py-2 px-3 font-medium">Ответ</th>
                                      <th className="py-2 px-3 font-medium">Верно?</th>
                                      <th className="py-2 px-3 font-medium">Комментарий</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--color-border)]/50">
                                    {s.answers.map((a, i) => (
                                      <tr key={i}>
                                        <td className="py-2.5 px-3 text-[var(--color-text-primary)] max-w-xs truncate" title={a.question_text}>
                                          {a.question_text}
                                        </td>
                                        <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{a.chosen_option_text}</td>
                                        <td className="py-2.5 px-3">
                                          {a.is_answer_correct ? (
                                            <Badge tone="success" className="gap-1">
                                              <Check className="w-3 h-3" strokeWidth={2.5} /> верно
                                            </Badge>
                                          ) : (
                                            <Badge tone="danger" className="gap-1">
                                              <X className="w-3 h-3" strokeWidth={2.5} /> неверно
                                            </Badge>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-3">
                                          {a.comment ? (
                                            <button
                                              type="button"
                                              className="inline-flex max-w-xs items-center gap-1 rounded bg-yellow-100 px-2 py-1 text-left text-xs italic hover:bg-yellow-200 dark:bg-yellow-950/40 dark:hover:bg-yellow-900/50"
                                              onClick={() => {
                                                setCommentFor({ sessionId: s.session_id, questionId: a.question_id, questionText: a.question_text });
                                                setCommentText(a.comment ?? "");
                                              }}
                                            >
                                              <MessageSquare className="w-3 h-3 text-yellow-600 dark:text-yellow-400 shrink-0" />
                                              <span className="truncate">{a.comment}</span>
                                            </button>
                                          ) : (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              iconLeft={<MessageSquarePlus className="w-3.5 h-3.5" />}
                                              onClick={() => {
                                                setCommentFor({ sessionId: s.session_id, questionId: a.question_id, questionText: a.question_text });
                                                setCommentText("");
                                              }}
                                            >
                                              +
                                            </Button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <ProctorLogSection sessionId={s.session_id} />
                          </Card>
                        ))
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <Modal
        open={overrideFor !== null}
        onClose={() => setOverrideFor(null)}
        title="Переопределить оценку"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOverrideFor(null)}>
              Отмена
            </Button>
            <Button
              loading={overrideMut.isPending}
              onClick={() =>
                overrideFor !== null &&
                overrideMut.mutate({ sessionId: overrideFor, score: overrideScore, reason: overrideReason })
              }
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Новый балл">
            <Input
              type="number"
              min={0}
              value={overrideScore}
              onChange={(e) => setOverrideScore(Number(e.target.value))}
            />
          </Field>
          <Field label="Причина" hint="Будет видна и студенту, и в логах">
            <Textarea
              rows={3}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Например: бонус за часть ответа"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={attemptCommentFor !== null}
        onClose={() => setAttemptCommentFor(null)}
        title="Комментарий к попытке"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAttemptCommentFor(null)}>
              Отмена
            </Button>
            <Button
              loading={attemptCommentMut.isPending}
              onClick={() =>
                attemptCommentFor !== null &&
                attemptCommentMut.mutate({ sessionId: attemptCommentFor, body: attemptCommentText })
              }
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Комментарий к попытке" hint="Студент получит уведомление и увидит этот комментарий в деталях попытки">
            <Textarea
              rows={4}
              value={attemptCommentText}
              onChange={(e) => setAttemptCommentText(e.target.value)}
              placeholder="Например: Хорошая работа над тестом! Обратите внимание на..."
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={commentFor !== null}
        onClose={() => setCommentFor(null)}
        title="Комментарий преподавателя"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCommentFor(null)}>
              Отмена
            </Button>
            <Button
              loading={commentMut.isPending}
              disabled={commentText.trim().length === 0}
              onClick={() =>
                commentFor &&
                commentMut.mutate({
                  sessionId: commentFor.sessionId,
                  questionId: commentFor.questionId,
                  body: commentText,
                })
              }
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="text-xs text-[var(--color-text-muted)] mb-2">{commentFor?.questionText}</div>
        <Textarea
          rows={4}
          placeholder="Хороший ответ, но формулировка неточная…"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
        />
      </Modal>
    </AppShell>
  );
}
