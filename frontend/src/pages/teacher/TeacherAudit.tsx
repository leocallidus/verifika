import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Clock3, History, ListTodo, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import type { TeacherAuditOut } from "../../types/api";

function fmt(dt: string) {
  return new Date(dt).toLocaleString("ru-RU");
}

const ACTION_LABELS: Record<string, string> = {
  teacher_password_changed: "Смена пароля",
  question_created: "Создание вопроса",
  question_updated: "Изменение вопроса",
  question_duplicated: "Копирование вопроса",
  question_archived: "Архивирование вопроса",
  question_restored: "Восстановление вопроса",
  questions_imported: "Импорт вопросов",
  bulk_archive: "Массовое архивирование",
  bulk_restore: "Массовое восстановление",
  bulk_topic_change: "Массовая смена темы",
  test_config_created: "Создание настроек теста",
  test_config_updated: "Изменение настроек теста",
  topic_created: "Создание темы",
  topic_updated: "Изменение темы",
  topic_archived: "Архивирование темы",
  topic_restored: "Восстановление темы",
  topic_changed: "Смена темы",
  topic_test_created: "Создание теста по теме",
  topic_test_updated: "Изменение теста по теме",
  topic_tests_schedule_bulk_updated: "Массовое расписание тем",
  policy_created: "Создание политики",
  policy_updated: "Изменение политики",
  student_topic_attempt_started: "Старт тематической попытки",
  student_attempt_started: "Старт попытки",
  student_attempt_finished: "Завершение попытки",
  comment_added: "Добавление комментария",
  grading_override: "Изменение оценки",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function fmtJson(obj: Record<string, unknown> | null): string {
  if (!obj) return "—";
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    lines.push(`${k}: ${String(s).slice(0, 60)}`);
  }
  return lines.join(" · ") || "—";
}

export default function TeacherAudit() {
  const q = useQuery<TeacherAuditOut>({
    queryKey: ["teacher", "audit"],
    queryFn: () => api.get("/api/teacher/audit?limit=200").then((r) => r.data),
  });
  return (
    <AppShell>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Журнал действий</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            История ваших изменений: вопросы, расписание, оценки.
          </p>
        </header>
        {q.isLoading && <Skeleton className="h-72 rounded-lg" />}
        {q.isError && (
          <EmptyState
            icon={<ShieldCheck />}
            title="Не удалось загрузить журнал"
            description={errorMessage(q.error)}
          />
        )}
        {q.data && q.data.items.length === 0 && (
          <EmptyState icon={<ListTodo />} title="Пока пусто" description="Действий ещё не было." />
        )}
        {q.data && q.data.items.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <ul>
              {q.data.items.map((it) => (
                <li
                  key={it.audit_id}
                  className="p-4 border-b border-[var(--color-border)] last:border-b-0 flex items-start gap-3"
                >
                  <div className="grid place-items-center w-9 h-9 rounded-md bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]">
                    <History className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone="neutral">{actionLabel(it.action)}</Badge>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {it.target_type} #{it.target_id ?? "—"}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)] inline-flex items-center gap-1 ml-auto">
                        <Clock3 className="w-3 h-3" />
                        {fmt(it.created_at)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2">
                      {fmtJson(it.before)} → {fmtJson(it.after)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <div className="text-sm text-[var(--color-text-muted)]">
          <Link to="/teacher/profile" className="hover:underline">
            Назад к профилю
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
