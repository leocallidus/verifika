import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileText, MessageSquareWarning, MessageSquare, RotateCcw, ShieldCheck, XCircle, Sparkles } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { downloadBlob } from "../../api/downloads";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Field, Textarea } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { ProtectedImage } from "../../components/ProtectedImage";
import { ScoreBadge } from "../../components/ScoreBadge";
import { useToasts } from "../../components/ui/Toast";
import { pluralizeRu } from "../../lib/plural-ru";
import type { StudentSessionDetailOut, TopicGradeResponse, StudentTopicDetailOut } from "../../types/api";
import { GradeCard } from "../../components/student/GradeCard";
import { AttemptsSummaryTable } from "../../components/student/AttemptsSummaryTable";
import { TestStartConfirmModal } from "../../components/student/TestStartConfirmModal";
import { RecommendationsCard } from "../../components/student/RecommendationsCard";
import { formatGrade } from "../../utils/grade";

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleString("ru-RU") : "—";
}
function dur(seconds: number | null) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}м ${s.toString().padStart(2, "0")}с`;
}

function renderValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Верно" : "Неверно";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function renderAnswer(render: Record<string, unknown> | null, fallback: string | null): string {
  if (!render) return fallback || "—";
  const kind = render.kind;
  if (kind === "multi" || kind === "order") {
    const texts = render.option_texts;
    return Array.isArray(texts) && texts.length > 0 ? texts.map(String).join(kind === "order" ? " → " : ", ") : fallback || "—";
  }
  if (kind === "match") {
    const pairs = render.pairs;
    return Array.isArray(pairs) && pairs.length > 0
      ? pairs.map((p) => {
        if (p && typeof p === "object") {
          const row = p as { left?: unknown; right?: unknown };
          return `${renderValue(row.left)} → ${renderValue(row.right)}`;
        }
        return renderValue(p);
      }).join("; ")
      : fallback || "—";
  }
  if (kind === "cloze") {
    const blanks = render.blanks;
    if (Array.isArray(blanks) && blanks.length > 0) {
      return blanks.map((b) => {
        const row = b as { index?: unknown; value?: unknown };
        const value = Array.isArray(row.value) ? row.value.map(String).join(", ") : renderValue(row.value);
        return `${renderValue(row.index)}: ${value}`;
      }).join("; ");
    }
    const values = render.values;
    if (values && typeof values === "object") {
      return Object.entries(values as Record<string, unknown>).map(([key, value]) => `${key}: ${renderValue(value)}`).join("; ");
    }
    return fallback || "—";
  }
  if (kind === "text") {
    const values = render.values;
    return Array.isArray(values) && values.length > 0 ? values.map(String).join(", ") : fallback || "—";
  }
  return renderValue(render.value ?? fallback);
}

export default function StudentSessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const sid = Number(sessionId);
  const navigate = useNavigate();
  const pushToast = useToasts((s) => s.push);
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "true";
  
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintBody, setComplaintBody] = useState("");

  const q = useQuery<StudentSessionDetailOut>({
    queryKey: ["student", "session-detail", sid, isPreview],
    queryFn: () => {
      if (isPreview && sid === -1) {
        const stored = sessionStorage.getItem("preview-results");
        if (stored) {
          try {
            return JSON.parse(stored) as StudentSessionDetailOut;
          } catch (e) {
            console.error("Failed to parse preview-results", e);
          }
        }
        throw new Error("Результаты предпросмотра не найдены");
      }
      return api.get(`/api/student/sessions/${sid}/detail`).then((r) => r.data);
    },
    enabled: isPreview ? true : Number.isFinite(sid),
  });

  const topicId = q.data?.topic_id;

  const gradeQ = useQuery<TopicGradeResponse>({
    queryKey: ["student", "topic-grade", topicId],
    queryFn: () => api.get(`/api/student/topics/${topicId}/grade`).then((r) => r.data),
    enabled: !!topicId && !isPreview,
  });

  const topicQ = useQuery<StudentTopicDetailOut>({
    queryKey: ["student", "topic", topicId],
    queryFn: () => api.get(`/api/student/topics/${topicId}`).then((r) => r.data),
    enabled: !!topicId && confirmOpen && !isPreview,
  });

  const fileStatusQ = useQuery({
    queryKey: ["student", "session-files", sid],
    queryFn: () => api.get<any>(`/api/student/sessions/${sid}/file-upload-status`).then((r) => r.data),
    enabled: Number.isFinite(sid) && sid > 0 && !isPreview,
  });


  async function pdf() {
    if (isPreview) return;
    try {
      await downloadBlob(`/api/student/reports/sessions/${sid}.pdf`, `session-${sid}.pdf`);
      pushToast("success", "PDF загружен");
    } catch (e) {
      pushToast("error", errorMessage(e));
    }
  }

  const restart = useMutation({
    mutationFn: async () => {
      const d = q.data;
      if (!d) throw new Error("data not loaded");
      const url = d.topic_id
        ? `/api/student/topics/${d.topic_id}/tests/start`
        : `/api/student/tests/${d.discipline_id}/start`;
      return api.post(url).then((r) => r.data) as Promise<{ session_id: number }>;
    },
    onSuccess: (d) => {
      pushToast("success", "Новая попытка запущена");
      navigate(`/student/test/${d.session_id}`);
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const complaint = useMutation({
    mutationFn: async () => {
      if (isPreview) return;
      return api.post("/api/student/complaints", {
        session_id: sid,
        body: complaintBody.trim(),
      });
    },
    onSuccess: () => {
      setComplaintBody("");
      setComplaintOpen(false);
      pushToast("success", "Сообщение отправлено преподавателю");
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const correct = q.data?.answers.filter((a) => a.is_correct === true).length ?? 0;
  const wrong = q.data?.answers.filter((a) => a.is_correct === false).length ?? 0;
  const skipped = q.data?.answers.filter((a) => !a.student_answer).length ?? 0;
  
  const hasAttemptsLeft = gradeQ.data ? (gradeQ.data.attempts_remaining === null || gradeQ.data.attempts_remaining > 0) : true;
  
  const canRestart =
    !isPreview &&
    q.data?.status === "completed" &&
    q.data?.topic_id !== null &&
    q.data?.topic_id !== undefined &&
    hasAttemptsLeft;

  const handleDiscussErrors = () => {
    if (!q.data || isPreview) return;
    const wrongAnswers = q.data.answers.filter((a) => a.is_correct === false);
    if (wrongAnswers.length === 0) {
      pushToast("success", "У вас нет неверных ответов в этой сессии!");
      return;
    }
    
    let prefill = `Привет! Помоги мне разобрать мои ошибки в тесте по дисциплине "${q.data.discipline_name}" (тема: "${q.data.topic_name ?? "Общий тест"}").\n\nВот вопросы, на которые я ответил неверно:\n\n`;
    
    wrongAnswers.forEach((a, index) => {
      prefill += `Вопрос ${index + 1}: ${a.question_text}\nМой ответ: ${a.student_answer || "[пропущено]"}\n\n`;
    });
    
    prefill += "Пожалуйста, объясни правильные ответы на эти вопросы и разбери со мной теорию.";
    
    navigate("/ai", {
      state: {
        prefill,
        autoCreate: true,
      },
    });
  };

  return (
    <AppShell>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Link to={isPreview ? "/teacher/diagnostics" : "/student/results"} className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
          <ArrowLeft className="w-4 h-4" /> {isPreview ? "Вернуться в диагностику" : "К истории"}
        </Link>
        {q.isLoading && <Skeleton className="h-72 rounded-lg" />}
        {q.isError && <EmptyState icon={<FileText />} title="Не удалось загрузить результат" description={errorMessage(q.error)} />}
        {q.data && (
          <>
            <Card>
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="text-sm text-[var(--color-text-muted)]">{q.data.topic_name ?? "Общий тест"} {isPreview && <Badge tone="info">Режим предпросмотра</Badge>}</div>
                  <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">{q.data.discipline_name}</h1>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone={q.data.status === "completed" ? "success" : q.data.status === "pending_file_grading" ? "warning" : "warning"}>
                      {q.data.status === "completed" ? "завершён" : q.data.status === "pending_file_grading" ? "ожидает проверки файлов" : "в процессе"}
                    </Badge>
                    {q.data.attempt_number != null && !isPreview && <Badge tone="neutral">попытка: {q.data.attempt_number}</Badge>}
                    <Badge tone="neutral">начало: {fmt(q.data.started_at)}</Badge>
                    <Badge tone="neutral">длительность: {dur(q.data.duration_seconds)}</Badge>
                    {q.data.is_passed === true && <Badge tone="success">сдано</Badge>}
                    {q.data.is_passed === false && <Badge tone="danger">не сдано</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <ScoreBadge score={q.data.score} max={q.data.max_score} />
                  {!isPreview && wrong > 0 && (
                    <Button
                      variant="secondary"
                      onClick={handleDiscussErrors}
                      iconLeft={<Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />}
                      className="border-indigo-250 dark:border-indigo-900/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 text-indigo-650 dark:text-indigo-400 font-semibold"
                    >
                      Разобрать ошибки с ИИ
                    </Button>
                  )}
                  {canRestart && (
                    <Button
                      variant="secondary"
                      iconLeft={<RotateCcw className="w-4 h-4" />}
                      loading={restart.isPending}
                      onClick={() => setConfirmOpen(true)}
                    >
                      Пройти ещё раз
                    </Button>
                  )}
                  {!isPreview && (
                    <Button
                      variant="secondary"
                      iconLeft={<MessageSquareWarning className="w-4 h-4" />}
                      onClick={() => setComplaintOpen(true)}
                    >
                      Сообщить о проблеме
                    </Button>
                  )}
                  {!isPreview && (
                    <Button variant="secondary" iconLeft={<Download className="w-4 h-4" />} onClick={pdf}>PDF</Button>
                  )}
                </div>
              </div>
            </Card>

            {q.data.comment && (
              <Card className="border-l-4 border-l-teal-500 bg-teal-50/50 dark:bg-teal-950/20 py-4 px-5">
                <div className="flex gap-2.5 items-start">
                  <MessageSquare className="w-5 h-5 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-teal-900 dark:text-teal-300">Комментарий преподавателя к попытке</h3>
                    <p className="mt-1 text-sm text-[var(--color-text)] whitespace-pre-wrap">{q.data.comment}</p>
                  </div>
                </div>
              </Card>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <Card><div className="text-sm text-[var(--color-text-muted)]">Верно</div><div className="mt-1 text-2xl font-semibold">{q.data.show_correctness ? pluralizeRu(correct, "вопрос", "вопроса", "вопросов") : "—"}</div></Card>
              <Card><div className="text-sm text-[var(--color-text-muted)]">Неверно</div><div className="mt-1 text-2xl font-semibold">{q.data.show_correctness ? pluralizeRu(wrong, "вопрос", "вопроса", "вопросов") : "—"}</div></Card>
              <Card><div className="text-sm text-[var(--color-text-muted)]">Пропущено</div><div className="mt-1 text-2xl font-semibold">{pluralizeRu(skipped, "вопрос", "вопроса", "вопросов")}</div></Card>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <div className="text-sm text-[var(--color-text-muted)]">Результат</div>
                <div className="mt-1 text-2xl font-semibold">{q.data.percent != null ? formatGrade(q.data.percent, q.data.grade_scale).full : "—"}</div>
              </Card>
              <Card>
                <div className="text-sm text-[var(--color-text-muted)]">Проходной балл</div>
                <div className="mt-1 text-2xl font-semibold">{q.data.passing_score_percent != null ? formatGrade(q.data.passing_score_percent, q.data.grade_scale).full : "—"}</div>
              </Card>
              <Card>
                <div className="text-sm text-[var(--color-text-muted)]">Показ ответов</div>
                <div className="mt-1 text-sm font-semibold flex items-center gap-2">
                  {q.data.show_correctness ? <ShieldCheck className="w-4 h-4 text-[var(--color-success)]" /> : <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />}
                  {q.data.show_correctness ? "Разрешён" : "Скрыт преподавателем"}
                </div>
              </Card>
            </div>

            {gradeQ.data && (
              <div className="grid gap-6 md:grid-cols-2">
                <GradeCard grade={gradeQ.data} />
                <AttemptsSummaryTable
                  sessions={gradeQ.data.sessions}
                  currentSessionId={sid}
                  passingScorePercent={gradeQ.data.passing_score_percent}
                  gradeScale={gradeQ.data.grade_scale}
                />
              </div>
            )}

            {q.data.status === "completed" && (
              <RecommendationsCard
                sessionId={sid}
                showCorrectness={q.data.show_correctness}
                isPreview={isPreview}
              />
            )}

            {fileStatusQ.data && fileStatusQ.data.file_questions.length > 0 && (
              <Card className="border-l-4 border-l-[var(--color-accent)]">
                <h3 className="font-semibold text-lg mb-2">Файлы на проверке</h3>
                <p className="text-sm text-[var(--color-text-muted)] mb-4">
                  {fileStatusQ.data.all_graded
                    ? "Все файлы проверены преподавателем."
                    : "Преподаватель проверяет загруженные файлы. Баллы изменятся после оценки."}
                </p>
                <div className="space-y-4">
                  {fileStatusQ.data.file_questions.map((fq: any) => (
                    <div key={fq.question_id} className="p-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)]">
                      <div className="font-medium text-sm mb-2">{fq.question_text}</div>
                      <div className="space-y-2">
                        {fq.uploads.map((up: any) => (
                          <div key={up.upload_id} className="flex items-center gap-2 text-xs text-[var(--color-text-primary)]">
                            <span className="font-mono bg-[var(--color-bg-elevated)] px-2 py-1 rounded border border-[var(--color-border)]">
                              {up.original_name}
                            </span>
                            <span className="text-[var(--color-text-muted)]">
                              ({(up.size_bytes / 1024 / 1024).toFixed(2)} МБ)
                            </span>
                          </div>
                        ))}
                      </div>
                      {fq.grade ? (
                        <div className="mt-3 text-xs bg-[var(--color-success)]/10 p-2.5 rounded border border-[var(--color-success)]/20 text-[var(--color-success)]">
                          <strong>Оценка:</strong> {fq.grade.points_earned} из {fq.grade.max_points} баллов
                          {fq.grade.comment && <div className="mt-1 text-[var(--color-text-primary)]"><strong>Комментарий:</strong> {fq.grade.comment}</div>}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs bg-[var(--color-warning)]/10 p-2.5 rounded border border-[var(--color-warning)]/20 text-[var(--color-warning)]">
                          Ожидает оценки (макс. {fq.max_points} баллов)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div className="space-y-4">
              {q.data.answers.map((a, idx) => (
                <Card key={a.question_id}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{idx + 1}. {a.question_text}</h2>
                    {a.is_correct === true && <Badge tone="success" className="gap-1"><CheckCircle2 className="w-3 h-3" /> верно</Badge>}
                    {a.is_correct === false && <Badge tone="danger" className="gap-1"><XCircle className="w-3 h-3" /> неверно</Badge>}
                  </div>
                  {a.question_image_url && <ProtectedImage src={a.question_image_url} alt="" className="mt-3 max-h-60 rounded-md object-contain" />}
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-[var(--color-bg-muted)] p-3">
                      <div className="text-xs uppercase text-[var(--color-text-muted)]">Ваш ответ</div>
                      <div className="mt-1 text-sm whitespace-pre-wrap">{renderAnswer(a.student_answer_render, a.student_answer)}</div>
                    </div>
                    <div className="rounded-lg bg-[var(--color-bg-muted)] p-3">
                      <div className="text-xs uppercase text-[var(--color-text-muted)]">Правильный ответ</div>
                      <div className="mt-1 text-sm whitespace-pre-wrap">{q.data.show_correctness ? renderAnswer(a.correct_answer_render, a.correct_answer) : "Скрыт преподавателем"}</div>
                    </div>
                  </div>
                  {a.explanation && <p className="mt-3 text-sm text-[var(--color-text-muted)]">{a.explanation}</p>}
                  {a.comment && <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3 text-sm">Комментарий: {a.comment}</div>}
                </Card>
              ))}
            </div>
            {confirmOpen && topicQ.data && (
              <TestStartConfirmModal
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={() => {
                  setConfirmOpen(false);
                  restart.mutate();
                }}
                topic={topicQ.data}
                disciplineTitle={topicQ.data.discipline_name}
                currentAttempt={topicQ.data.history.length + 1}
                loading={restart.isPending}
              />
            )}
            <Modal
              open={complaintOpen}
              onClose={() => setComplaintOpen(false)}
              title="Сообщить о проблеме"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setComplaintOpen(false)}>
                    Отмена
                  </Button>
                  <Button
                    loading={complaint.isPending}
                    disabled={complaintBody.trim().length < 5}
                    onClick={() => complaint.mutate()}
                  >
                    Отправить
                  </Button>
                </>
              }
            >
              <Field label="Сообщение" required>
                <Textarea
                  value={complaintBody}
                  onChange={(e) => setComplaintBody(e.target.value)}
                  maxLength={2000}
                  rows={5}
                />
              </Field>
            </Modal>
          </>
        )}
      </section>
    </AppShell>
  );
}
