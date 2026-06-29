import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Edit3, Trash2 } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Field, Input } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { useToasts } from "../../components/ui/Toast";
import { errorMessage } from "../../api/client";
import { adminApi } from "../../api/admin";
import type { AdminActiveSessionOut, AdminOverrideScoreIn } from "../../types/api";

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ru-RU") : "—";

export default function AdminSessions() {
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [forceTarget, setForceTarget] = useState<AdminActiveSessionOut | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [forceSubmitting, setForceSubmitting] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<AdminActiveSessionOut | null>(null);
  const [overrideScore, setOverrideScore] = useState<number | "">("");
  const [overrideReason, setOverrideReason] = useState("");

  const sessions = useQuery({
    queryKey: ["admin", "sessions", "active"],
    queryFn: () => adminApi.activeSessions().then((r) => r.data),
    refetchInterval: 5_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "sessions"] });
    qc.invalidateQueries({ queryKey: ["admin", "events"] });
  };

  async function submitForce() {
    if (!forceTarget || !forceReason.trim()) return;
    setForceSubmitting(true);
    try {
      await adminApi.forceFinish(forceTarget.session_id, { reason: forceReason });
      pushToast({ tone: "success", title: "Сессия завершена принудительно" });
      setForceTarget(null);
      setForceReason("");
      invalidate();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    } finally {
      setForceSubmitting(false);
    }
  }

  async function submitOverride() {
    if (!overrideTarget || overrideScore === "") return;
    const payload: AdminOverrideScoreIn = {
      score: Number(overrideScore),
      reason: overrideReason || undefined,
    };
    try {
      await adminApi.overrideScore(overrideTarget.session_id, payload);
      pushToast({ tone: "success", title: "Балл переопределён" });
      setOverrideTarget(null);
      setOverrideScore("");
      setOverrideReason("");
      invalidate();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function clearAnswers(s: AdminActiveSessionOut) {
    if (!confirm(`Удалить все ответы сессии #${s.session_id}? Действие пишется в аудит.`)) return;
    try {
      await adminApi.clearAnswers(s.session_id);
      pushToast({ tone: "success", title: "Ответы удалены", body: `сессия #${s.session_id}` });
      invalidate();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-[var(--color-accent)]" />
            Активные сессии
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Force-finish и переопределение балла. Студенты должны знать, что админ имел возможность вмешаться.
          </p>
        </header>

        <Card>
          {sessions.isLoading && <Skeleton className="h-24 w-full" />}
          {sessions.isError && (
            <EmptyState title="Не удалось" description={errorMessage(sessions.error)} />
          )}
          {sessions.data && sessions.data.items.length === 0 && (
            <EmptyState icon={<Activity />} title="Активных сессий нет" />
          )}
          {sessions.data && sessions.data.items.length > 0 && (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <tr>
                    <th className="py-2 pr-4">Студент</th>
                    <th className="py-2 pr-4">Дисциплина</th>
                    <th className="py-2 pr-4">Преподаватель</th>
                    <th className="py-2 pr-4">Старт / last seen</th>
                    <th className="py-2 pr-4">Прогресс</th>
                    <th className="py-2 pr-4">Статус</th>
                    <th className="py-2 pr-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.data.items.map((s) => (
                    <tr key={s.session_id} className="border-b border-[var(--color-border)]/60">
                      <td className="py-2 pr-4">{s.student_name}</td>
                      <td className="py-2 pr-4">{s.discipline_name}</td>
                      <td className="py-2 pr-4">{s.teacher_name}</td>
                      <td className="py-2 pr-4 text-xs">
                        старт: {fmtDateTime(s.started_at)}
                        <br />
                        last: {fmtDateTime(s.last_seen_at)}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {s.questions_answered}/{s.questions_total}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={s.status === "stuck" ? "warning" : s.status === "force_finished" ? "danger" : "success"}>
                          {s.status === "stuck" ? "застрял" : s.status === "force_finished" ? "завершена" : "идёт"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            iconLeft={<AlertTriangle className="w-3.5 h-3.5" />}
                            onClick={() => setForceTarget(s)}
                          >
                            Force-finish
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            iconLeft={<Edit3 className="w-3.5 h-3.5" />}
                            onClick={() => setOverrideTarget(s)}
                          >
                            Override
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            iconLeft={<Trash2 className="w-3.5 h-3.5" />}
                            onClick={() => clearAnswers(s)}
                            title="Удалить ответы и пересчитать"
                          >
                            Сбросить ответы
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {forceTarget && (
          <Modal
            open
            onClose={() => setForceTarget(null)}
            title={`Принудительное завершение сессии #${forceTarget.session_id}`}
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setForceTarget(null)}>Отмена</Button>
                <Button
                  variant="danger"
                  onClick={submitForce}
                  disabled={forceSubmitting || !forceReason.trim()}
                >
                  Завершить принудительно
                </Button>
              </div>
            }
          >
            <p className="text-sm">
              <b>{forceTarget.student_name}</b> проходит <b>{forceTarget.discipline_name}</b>.
              Время сессии будет закрыто сейчас.
            </p>
            <Field label="Причина" required>
              <Input
                value={forceReason}
                onChange={(e) => setForceReason(e.target.value)}
                placeholder="Студент сообщил о сбое сети…"
              />
            </Field>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              Записывается в <code>audit_log</code> с reason и actor_id; событие уходит в админ-канал.
            </p>
          </Modal>
        )}

        {overrideTarget && (
          <Modal
            open
            onClose={() => setOverrideTarget(null)}
            title={`Переопределить балл сессии #${overrideTarget.session_id}`}
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOverrideTarget(null)}>Отмена</Button>
                <Button
                  variant="primary"
                  onClick={submitOverride}
                  disabled={overrideScore === ""}
                >
                  Сохранить
                </Button>
              </div>
            }
          >
            <p className="text-sm">
              <b>{overrideTarget.student_name}</b> — текущий авто-балл:{" "}
              <b>{overrideTarget.questions_answered}/{overrideTarget.questions_total}</b>
            </p>
            <Field label="Новый балл (целое число)" required>
              <Input
                type="number"
                value={overrideScore}
                onChange={(e) => setOverrideScore(e.target.value ? Number(e.target.value) : "")}
              />
            </Field>
            <Field label="Причина">
              <Input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Апелляция студента…"
              />
            </Field>
            <p className="text-xs text-amber-600 mt-2">
              Будет создана запись в <code>test_sessions_grade_override</code> и в аудите. Ивент severity=alert.
            </p>
          </Modal>
        )}
      </section>
    </AppShell>
  );
}
