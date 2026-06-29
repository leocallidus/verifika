import { Link, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Lightbulb,
  Loader2,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { api, errorMessage } from "../../api/client";
import { askStudentTopicPreparation, getAiStatus } from "../../api/ai";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { ProtectedImage } from "../../components/ProtectedImage";
import { ScoreBadge } from "../../components/ScoreBadge";
import { QuestionTypeBadge } from "../../components/QuestionTypeBadge";
import { useToasts } from "../../components/ui/Toast";
import type { StudentTopicDetailOut } from "../../types/api";
import { TestStartConfirmModal } from "../../components/student/TestStartConfirmModal";
import { pluralizeRu } from "../../lib/plural-ru";
import { formatGrade } from "../../utils/grade";

function fmt(dt: string | null | undefined) {
  return dt ? new Date(dt).toLocaleString("ru-RU") : "—";
}

function fmtWindow(from?: string | null, until?: string | null) {
  if (!from && !until) return "без окна доступности";
  if (from && until) return `${fmt(from)} — ${fmt(until)}`;
  if (from) return `с ${fmt(from)}`;
  return `до ${fmt(until)}`;
}

function fmtMinutes(minutes?: number | null) {
  if (!minutes || minutes <= 0) return "без ограничения";
  return `${minutes} мин`;
}

function fmtDuration(seconds?: number | null) {
  if (seconds == null || seconds <= 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} сек`;
  return rest > 0 ? `${minutes} мин ${rest} сек` : `${minutes} мин`;
}

function gradingLabel(method?: string) {
  switch (method) {
    case "best":
      return "лучшая попытка";
    case "last":
      return "последняя попытка";
    case "average":
      return "средний результат";
    case "first":
      return "первая попытка";
    default:
      return method || "лучшая попытка";
  }
}

function RuleRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0 flex items-start gap-2">
      <span className="mt-0.5 text-[var(--color-text-muted)] shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
        <div className="font-medium text-[var(--color-text-primary)] break-words">{value}</div>
      </div>
    </div>
  );
}

const PREPARATION_PROMPTS = [
  "Объясни тему простыми словами и выдели главное",
  "Составь короткий план повторения перед тестом",
  "Покажи типичные ошибки и как их избежать",
];

export default function StudentTopicDetail() {
  const { topicId } = useParams<{ topicId: string }>();
  const id = Number(topicId);
  const navigate = useNavigate();
  const pushToast = useToasts((s) => s.push);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  const q = useQuery<StudentTopicDetailOut>({
    queryKey: ["student", "topic", id],
    queryFn: () => api.get(`/api/student/topics/${id}`).then((r) => r.data),
    enabled: Number.isFinite(id),
  });

  const aiStatus = useQuery({
    queryKey: ["ai-status", "student-topic", id],
    queryFn: () => getAiStatus(),
    enabled: Number.isFinite(id),
    staleTime: 60000,
    retry: false,
  });

  const start = useMutation({
    mutationFn: () => api.post(`/api/student/topics/${id}/tests/start`).then((r) => r.data as { session_id: number }),
    onSuccess: (d) => {
      pushToast("success", "Тест начат");
      navigate(`/student/test/${d.session_id}`);
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const askAi = useMutation({
    mutationFn: (prompt: string) => askStudentTopicPreparation(id, prompt),
    onSuccess: (data) => {
      setAiAnswer(data.answer);
      pushToast("success", "Пояснение подготовлено");
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const completedAttempts = q.data?.history.filter((item) => item.status === "completed").length ?? 0;
  const currentAttempt = completedAttempts + 1;
  const gradeScale = q.data?.grade_scale ?? "5_point";
  const aiDisabledReason = !aiStatus.data?.enabled
    ? "ИИ-помощник сейчас недоступен"
    : q.data?.has_active_session
      ? "ИИ-помощник доступен только до старта теста по теме"
      : null;

  function sendAiPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || aiDisabledReason) return;
    setAiPrompt(trimmed);
    askAi.mutate(trimmed);
  }

  return (
    <AppShell>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Link to="/student" className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
          <ArrowLeft className="w-4 h-4" /> К дисциплинам
        </Link>

        {q.isLoading && <Skeleton className="h-80 rounded-lg" />}
        {q.isError && <EmptyState icon={<BookOpen />} title="Не удалось загрузить тему" description={errorMessage(q.error)} />}

        {q.data && (
          <>
            <Card className="overflow-hidden p-0">
              {q.data.image_url && <ProtectedImage src={q.data.image_url} alt="" className="w-full h-56 object-cover" />}
              <div className="p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--color-text-muted)]">{q.data.discipline_name}</div>
                    <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">{q.data.name}</h1>

                    <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 p-4 text-center">
                        <div className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Попыток</div>
                        <div className="mt-2 text-xl font-bold text-[var(--color-text-primary)] tabular-nums">
                          {completedAttempts}
                          {q.data.attempts_allowed > 0 ? ` / ${q.data.attempts_allowed}` : ""}
                        </div>
                      </div>

                      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 p-4 text-center">
                        <div className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Вопросов</div>
                        <div className="mt-2 text-xl font-bold text-[var(--color-text-primary)] tabular-nums">{q.data.question_count}</div>
                        <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">в банке: {q.data.actual_questions_count}</div>
                      </div>

                      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 p-4 text-center">
                        <div className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Лучший результат</div>
                        <div className="mt-2 text-sm font-bold text-[var(--color-text-primary)] tabular-nums flex items-center justify-center min-h-[1.75rem]">
                          {q.data.best_percent != null ? formatGrade(q.data.best_percent, gradeScale).full : "—"}
                        </div>
                      </div>

                      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 p-4 text-center">
                        <div className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Статус</div>
                        <div className="mt-2 text-lg font-bold">
                          {q.data.is_passed === true ? (
                            <span className="text-[var(--color-success)] inline-flex items-center gap-1.5">
                              <CheckCircle2 className="w-5 h-5 shrink-0" /> Сдано
                            </span>
                          ) : q.data.is_passed === false ? (
                            <span className="text-[var(--color-danger)] inline-flex items-center gap-1.5">
                              <XCircle className="w-5 h-5 shrink-0" /> Не сдано
                            </span>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {q.data.description && (
                      <p className="mt-4 text-sm text-[var(--color-text-muted)] max-w-3xl whitespace-pre-wrap">{q.data.description}</p>
                    )}
                    {!q.data.available && !q.data.has_active_session && (
                      <div className="mt-4 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] p-3 text-sm text-[var(--color-warning)] flex items-start gap-2" role="alert">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                          <div className="font-medium">{q.data.unavailable_reason ?? "Тест сейчас недоступен"}</div>
                          {q.data.next_attempt_available_at && (
                            <div className="mt-1 text-xs">Следующая попытка: {fmt(q.data.next_attempt_available_at)}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0 md:mt-2">
                    {q.data.has_active_session && q.data.active_session_id ? (
                      <Link to={`/student/test/${q.data.active_session_id}`}>
                        <Button iconLeft={<RotateCcw className="w-4 h-4" />}>Продолжить</Button>
                      </Link>
                    ) : (
                      <Button
                        iconLeft={<Play className="w-4 h-4" />}
                        disabled={!q.data.available}
                        loading={start.isPending}
                        title={!q.data.available ? q.data.unavailable_reason ?? "Недоступно" : undefined}
                        onClick={() => setConfirmOpen(true)}
                      >
                        Начать тест по теме
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge tone="neutral">{pluralizeRu(q.data.question_count, "вопрос", "вопроса", "вопросов")}</Badge>
                  <Badge tone="neutral">{fmtMinutes(q.data.time_limit_minutes)}</Badge>
                  <Badge tone={q.data.available ? "success" : "warning"}>
                    {q.data.available ? `${q.data.attempts_left} попыт.` : q.data.unavailable_reason}
                  </Badge>
                  <Badge tone="neutral">{fmtWindow(q.data.available_from, q.data.available_until)}</Badge>
                </div>
              </div>
            </Card>

            <div className={`grid gap-4 ${q.data.allow_study !== false ? "lg:grid-cols-[1fr_320px]" : "grid-cols-1 max-w-3xl mx-auto w-full"}`}>
              {q.data.allow_study !== false && (
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-5 h-5 text-[var(--color-accent)]" />
                    <h2 className="text-lg font-semibold">Подготовка</h2>
                  </div>
                  {q.data.study_questions.length === 0 && <EmptyState icon={<BookOpen />} title="Вопросов пока нет" />}
                  <div className="space-y-3">
                    {q.data.study_questions.map((question, idx) => (
                      <div key={question.question_id} className="rounded-lg border border-[var(--color-border)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-medium">{idx + 1}. {question.question_text}</div>
                          <QuestionTypeBadge t={question.qtype} />
                        </div>
                        {question.image_url && <ProtectedImage src={question.image_url} alt="" className="mt-3 max-h-56 rounded-md object-contain" />}
                        {question.options.length > 0 && (
                          <ul className="mt-3 space-y-1 text-sm text-[var(--color-text-muted)]">
                            {question.options.map((o) => <li key={o.option_id}>{o.option_number}. {o.option_text}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <div className="space-y-4">
                <Card>
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 w-5 h-5 text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold">AI-помощник</h2>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        Объясняет тему и помогает повторить материал до старта теста.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {PREPARATION_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        disabled={!!aiDisabledReason || askAi.isPending}
                        onClick={() => sendAiPrompt(prompt)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 px-2.5 py-1.5 text-left text-xs font-medium text-[var(--color-text-primary)] transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <Lightbulb className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                        <span>{prompt}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                    <textarea
                      rows={3}
                      value={aiPrompt}
                      maxLength={2000}
                      disabled={!!aiDisabledReason || askAi.isPending}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Например: объясни основные понятия и дай пример"
                      className="w-full resize-none bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] disabled:cursor-not-allowed"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[var(--color-text-muted)]">{aiPrompt.length} / 2000</span>
                      <Button
                        size="sm"
                        disabled={!aiPrompt.trim() || !!aiDisabledReason}
                        loading={askAi.isPending}
                        iconLeft={<Send className="w-4 h-4" />}
                        onClick={() => sendAiPrompt(aiPrompt)}
                      >
                        Спросить
                      </Button>
                    </div>
                  </div>

                  {aiDisabledReason && (
                    <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 p-3 text-sm text-[var(--color-text-muted)]">
                      {aiStatus.isLoading ? "Проверяем доступность ИИ..." : aiDisabledReason}
                    </div>
                  )}

                  {askAi.isPending && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Готовим объяснение
                    </div>
                  )}

                  {aiAnswer && (
                    <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 text-sm text-neutral-800 dark:border-indigo-900/60 dark:bg-indigo-950/20 dark:text-neutral-100">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
                          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        }}
                      >
                        {aiAnswer}
                      </ReactMarkdown>
                    </div>
                  )}
                </Card>

                <Card>
                  <h2 className="text-lg font-semibold mb-3">Правила и дедлайн</h2>
                  <div className="divide-y divide-[var(--color-border)] text-sm">
                    <RuleRow icon={<BookOpen className="w-4 h-4" />} label="Вопросы" value={`${q.data.question_count} из ${q.data.actual_questions_count} в банке`} />
                    <RuleRow icon={<Clock3 className="w-4 h-4" />} label="Время" value={fmtMinutes(q.data.time_limit_minutes)} />
                    <RuleRow
                      icon={<RotateCcw className="w-4 h-4" />}
                      label="Попытки"
                      value={q.data.attempts_allowed > 0 ? `${q.data.attempts_left} осталось из ${q.data.attempts_allowed}` : "без ограничения"}
                    />
                    <RuleRow icon={<CalendarDays className="w-4 h-4" />} label="Окно" value={fmtWindow(q.data.available_from, q.data.available_until)} />
                    <RuleRow
                      icon={<ShieldCheck className="w-4 h-4" />}
                      label="Проходной балл"
                      value={q.data.passing_score_percent != null ? formatGrade(q.data.passing_score_percent, gradeScale).full : "не задан"}
                    />
                    <RuleRow icon={<Trophy className="w-4 h-4" />} label="Итог" value={gradingLabel(q.data.grading_method)} />
                    <RuleRow icon={<Clock3 className="w-4 h-4" />} label="Пауза между попытками" value={q.data.attempt_delay_minutes ? `${q.data.attempt_delay_minutes} мин` : "нет"} />
                    <RuleRow
                      icon={q.data.show_correct_after_finish ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      label="Правильные ответы"
                      value={q.data.show_correct_after_finish ? "после завершения" : "скрыты"}
                    />
                  </div>
                </Card>

                <Card>
                  <h2 className="text-lg font-semibold mb-3">История темы</h2>
                  {q.data.history.length === 0 && <EmptyState icon={<BookOpen />} title="Попыток нет" className="py-8" />}
                  <div className="space-y-3">
                    {q.data.history.map((s) => (
                      <Link key={s.session_id} to={s.status === "completed" ? `/student/results/${s.session_id}` : `/student/test/${s.session_id}`} className="block rounded-lg border border-[var(--color-border)] p-3 hover:border-[var(--color-border-strong)]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium flex items-center gap-1.5">
                              Попытка {s.attempt_number ?? "—"}
                              {s.is_best && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
                            </div>
                            <div className="mt-1 text-xs text-[var(--color-text-muted)]">{fmt(s.started_at)}</div>
                            <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">длительность: {fmtDuration(s.duration_seconds)}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            {s.status === "completed" ? (
                              <>
                                <ScoreBadge score={s.score} max={s.max_score} />
                                {s.percent != null && (
                                  <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{formatGrade(s.percent, gradeScale).full}</div>
                                )}
                              </>
                            ) : (
                              <Badge tone="warning">в процессе</Badge>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            {confirmOpen && q.data && (
              <TestStartConfirmModal
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={() => {
                  setConfirmOpen(false);
                  start.mutate();
                }}
                topic={q.data}
                disciplineTitle={q.data.discipline_name}
                currentAttempt={currentAttempt}
                loading={start.isPending}
              />
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
