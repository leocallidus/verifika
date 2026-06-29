import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, Check, Download, AlertCircle, FileText, MessageSquare, Loader2 } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { downloadBlob } from "../../api/downloads";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Skeleton, EmptyState } from "../../components/ui/Feedback";
import { useToasts } from "../../components/ui/Toast";
import type { SessionFileAnswersOut } from "../../types/api";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function SessionFileReview() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const sid = Number(sessionId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);

  const [grades, setGrades] = useState<Record<number, { points: string; comment: string }>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<number | null>(null);

  const q = useQuery<SessionFileAnswersOut>({
    queryKey: ["teacher", "session-file-answers", sid],
    queryFn: () => api.get<SessionFileAnswersOut>(`/api/teacher/sessions/${sid}/file-answers`).then((r) => r.data),
  });

  useEffect(() => {
    if (q.data) {
      const initial: Record<number, { points: string; comment: string }> = {};
      q.data.file_questions.forEach((fq) => {
        if (fq.grade) {
          initial[fq.question_id] = {
            points: String(fq.grade.points_earned),
            comment: fq.grade.comment ?? "",
          };
        } else {
          initial[fq.question_id] = {
            points: "",
            comment: "",
          };
        }
      });
      setGrades(initial);
    }
  }, [q.data]);

  const saveGrade = useMutation({
    mutationFn: async ({ questionId, points, comment }: { questionId: number; points: number; comment: string }) => {
      const resp = await api.post(`/api/teacher/sessions/${sid}/file-grades/${questionId}`, {
        points_earned: points,
        comment: comment || null,
      });
      return resp.data;
    },
    onSuccess: (data) => {
      pushToast("success", "Оценка сохранена");
      void qc.invalidateQueries({ queryKey: ["teacher", "session-file-answers", sid] });
      void qc.invalidateQueries({ queryKey: ["teacher", "pending-file-reviews"] });
      
      if (data.session_now_completed) {
        pushToast("success", "Все файлы проверены. Сессия успешно завершена!");
        navigate("/teacher/pending-file-reviews");
      }
    },
    onError: (e) => pushToast("error", errorMessage(e)),
    onSettled: () => setSavingQuestionId(null),
  });

  const handleSave = (questionId: number, maxPoints: number) => {
    const data = grades[questionId];
    if (!data) return;
    
    const pts = parseFloat(data.points);
    if (isNaN(pts) || pts < 0) {
      pushToast("error", "Введите корректное число баллов (>= 0)");
      return;
    }
    if (pts > maxPoints) {
      pushToast("error", `Баллы не могут превышать максимум (${maxPoints})`);
      return;
    }

    setSavingQuestionId(questionId);
    saveGrade.mutate({
      questionId,
      points: pts,
      comment: data.comment,
    });
  };

  const handleDownload = async (uploadId: number, filename: string) => {
    try {
      await downloadBlob(`/api/teacher/file-uploads/${uploadId}/download`, filename);
    } catch (err) {
      pushToast("error", "Не удалось скачать файл: " + errorMessage(err));
    }
  };

  return (
    <AppShell>
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Link
          to="/teacher/pending-file-reviews"
          className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="w-4 h-4" /> К списку проверки
        </Link>

        {q.isLoading && <Skeleton className="h-64 rounded-lg" />}

        {q.isError && (
          <EmptyState
            icon={<AlertCircle className="w-8 h-8 text-[var(--color-danger)]" />}
            title="Ошибка"
            description={errorMessage(q.error)}
          />
        )}

        {q.data && (
          <>
            <Card className="bg-[var(--color-bg-elevated)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-[var(--color-text-muted)]">Проверка сессии #{sid}</div>
                  <h1 className="text-xl sm:text-2xl font-semibold mt-1">
                    Студент: {q.data.student.full_name}
                  </h1>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    Группа: {q.data.student.group_name}
                  </p>
                </div>
              </div>
            </Card>

            <div className="space-y-6">
              {q.data.file_questions.map((fq) => {
                const current = grades[fq.question_id] || { points: "", comment: "" };
                const isSaving = savingQuestionId === fq.question_id;

                return (
                  <Card key={fq.question_id} className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--color-border)] pb-3">
                      <h2 className="font-semibold text-base flex-1 min-w-0">
                        {fq.question_text}
                      </h2>
                      <Badge tone="neutral">макс. {fq.max_points} баллов</Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase">
                        Присланные файлы
                      </div>
                      {fq.uploads.length === 0 ? (
                        <div className="text-sm text-[var(--color-text-muted)] italic">
                          Студент не загрузил файлы для этого ответа.
                        </div>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {fq.uploads.map((up) => (
                            <div
                              key={up.upload_id}
                              className="flex items-center justify-between p-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)]"
                            >
                              <div className="flex items-center gap-2 overflow-hidden mr-2">
                                <FileText className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                                    {up.original_name}
                                  </div>
                                  <div className="text-[10px] text-[var(--color-text-muted)]">
                                    {formatBytes(up.size_bytes)}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDownload(up.upload_id, up.original_name)}
                                className="btn btn-ghost btn-sm shrink-0"
                                title="Скачать"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-3 pt-3 border-t border-[var(--color-border)]">
                      <div className="md:col-span-1">
                        <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                          Баллы
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max={fq.max_points}
                            value={current.points}
                            onChange={(e) =>
                              setGrades((prev) => ({
                                ...prev,
                                [fq.question_id]: { ...current, points: e.target.value },
                              }))
                            }
                            placeholder="0.0"
                            className="input h-9 w-24 text-sm font-semibold"
                            disabled={isSaving}
                          />
                          <span className="text-sm text-[var(--color-text-muted)]">/ {fq.max_points}</span>
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                          Комментарий к оценке
                        </label>
                        <input
                          type="text"
                          value={current.comment}
                          onChange={(e) =>
                            setGrades((prev) => ({
                              ...prev,
                              [fq.question_id]: { ...current, comment: e.target.value },
                            }))
                          }
                          placeholder="Добавьте отзыв..."
                          className="input h-9 text-sm"
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="primary"
                        onClick={() => handleSave(fq.question_id, fq.max_points)}
                        loading={isSaving}
                        iconLeft={<Check className="w-4 h-4" />}
                        className="btn-sm"
                      >
                        Сохранить оценку
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
