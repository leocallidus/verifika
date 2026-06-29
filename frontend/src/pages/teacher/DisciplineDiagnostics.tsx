import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, BookOpen, CheckCircle2, Clock3, Database, Settings } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { AppShell } from "../../components/AppShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import type { DiagnosticProblem, DiagnosticSeverity, DiagnosticTopic, DisciplineDiagnostics, TeacherDiagnosticsOut } from "../../types/api";

const severityTone: Record<DiagnosticSeverity, "danger" | "warning" | "info"> = {
  error: "danger",
  warning: "warning",
  info: "info",
};

const statusLabel: Record<DiagnosticTopic["status"], string> = {
  available: "доступен",
  scheduled: "запланирован",
  closed: "закрыт",
  blocked: "проблема",
  disabled: "выключен",
  not_configured: "не настроен",
};

const statusTone: Record<DiagnosticTopic["status"], "success" | "warning" | "danger" | "neutral" | "info"> = {
  available: "success",
  scheduled: "info",
  closed: "warning",
  blocked: "danger",
  disabled: "neutral",
  not_configured: "warning",
};

function fmt(dt: string | null): string {
  return dt ? new Date(dt).toLocaleString("ru-RU") : "—";
}

function problemCounts(discipline: DisciplineDiagnostics) {
  const all = [...discipline.problems, ...discipline.topics.flatMap((topic) => topic.problems)];
  return {
    all,
    errors: all.filter((p) => p.severity === "error").length,
    warnings: all.filter((p) => p.severity === "warning").length,
  };
}

function ProblemList({ problems }: { problems: DiagnosticProblem[] }) {
  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
        <CheckCircle2 className="w-4 h-4" />
        Критичных проблем не найдено
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {problems.slice(0, 5).map((problem, index) => (
        <li key={`${problem.code}-${problem.topic_id ?? "d"}-${index}`} className="flex items-start gap-2 text-sm">
          <Badge tone={severityTone[problem.severity]}>{problem.severity === "error" ? "ошибка" : problem.severity === "warning" ? "внимание" : "инфо"}</Badge>
          <span className="text-[var(--color-text-secondary)]">{problem.message}</span>
        </li>
      ))}
      {problems.length > 5 && (
        <li className="text-xs text-[var(--color-text-muted)]">Ещё проблем: {problems.length - 5}</li>
      )}
    </ul>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 p-3">
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function TopicRow({ topic }: { topic: DiagnosticTopic }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium truncate">{topic.name}</div>
            <Badge tone={statusTone[topic.status]}>{statusLabel[topic.status]}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-[var(--color-text-muted)]">
            <Badge tone="neutral">{topic.questions_count} акт. вопросов</Badge>
            <Badge tone="neutral">{topic.test_question_count ?? "—"} в тесте</Badge>
            <Badge tone="neutral">{topic.time_limit_minutes ?? "—"} мин</Badge>
            {topic.archived_questions_count > 0 && <Badge tone="info">{topic.archived_questions_count} в архиве</Badge>}
          </div>
        </div>
        <div className="flex flex-col sm:items-end gap-1.5 whitespace-nowrap text-xs text-[var(--color-text-muted)]">
          <div>
            {fmt(topic.available_from)} — {fmt(topic.available_until)}
          </div>
          <Link
            to={`/student/test/-1?preview=true&topic_id=${topic.topic_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1"
          >
            <Button size="sm" variant="secondary" disabled={topic.questions_count === 0}>
              Предпросмотр
            </Button>
          </Link>
        </div>
      </div>
      {topic.problems.length > 0 && (
        <div className="mt-3">
          <ProblemList problems={topic.problems} />
        </div>
      )}
    </div>
  );
}

function DisciplineCard({ discipline }: { discipline: DisciplineDiagnostics }) {
  const counts = problemCounts(discipline);
  const modeLabel = discipline.test_mode === "topic" ? "Тесты по темам" : "Тест по дисциплине";
  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold truncate">{discipline.name}</h2>
            <Badge tone={discipline.test_mode === "topic" ? "accent" : "neutral"}>{modeLabel}</Badge>
            {counts.errors > 0 ? (
              <Badge tone="danger">{counts.errors} ошибок</Badge>
            ) : counts.warnings > 0 ? (
              <Badge tone="warning">{counts.warnings} предупрежд.</Badge>
            ) : (
              <Badge tone="success">без критичных проблем</Badge>
            )}
          </div>
          {discipline.description && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)] line-clamp-2">{discipline.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/teacher/bank?disc=${discipline.discipline_id}`}>
            <Button size="sm" variant="secondary" iconLeft={<Database className="w-4 h-4" />}>Банк</Button>
          </Link>
          <Link to={`/teacher/policy/${discipline.discipline_id}`}>
            <Button size="sm" variant="secondary" iconLeft={<Settings className="w-4 h-4" />}>Настройки</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Студентов" value={discipline.assigned_students_count} />
        <Metric label="Тем" value={discipline.topics_count} />
        <Metric label="Тестов тем" value={discipline.enabled_topic_tests_count} />
        <Metric label="Вопросов" value={discipline.active_questions_count} />
        <Metric label="Без темы" value={discipline.untopiced_questions_count} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-md border border-[var(--color-border)] p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {counts.errors > 0 ? <AlertTriangle className="w-4 h-4 text-[var(--color-danger)]" /> : <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />}
            Проблемы настройки
          </div>
          <div className="mt-3">
            <ProblemList problems={counts.all} />
          </div>
        </div>
        <div className="rounded-md border border-[var(--color-border)] p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock3 className="w-4 h-4 text-[var(--color-accent)]" />
              Общий тест
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              <Badge tone={discipline.general_test_available ? "success" : "neutral"}>
                {discipline.general_test_available ? "доступен к старту" : "не используется"}
              </Badge>
              <Badge tone="neutral">{discipline.general_question_count} вопросов</Badge>
              <Badge tone="neutral">{discipline.general_time_limit_minutes} мин</Badge>
              <Badge tone="neutral">{discipline.assigned_groups_count} групп</Badge>
              <Badge tone="neutral">{discipline.individually_assigned_students_count} инд. назначений</Badge>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Link
              to={`/student/test/-1?preview=true&discipline_id=${discipline.discipline_id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" variant="secondary" disabled={discipline.active_questions_count === 0}>
                Предпросмотр теста
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Темы и тесты по темам</div>
        {discipline.topics.length === 0 ? (
          <div className="rounded-md border border-[var(--color-border)] p-3 text-sm text-[var(--color-text-muted)]">
            Темы не созданы
          </div>
        ) : (
          <div className="grid gap-2">
            {discipline.topics.map((topic) => <TopicRow key={topic.topic_id} topic={topic} />)}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function DisciplineDiagnosticsPage() {
  const q = useQuery<TeacherDiagnosticsOut>({
    queryKey: ["teacher", "diagnostics", "disciplines"],
    queryFn: () => api.get("/api/teacher/diagnostics/disciplines").then((r) => r.data),
  });

  const totalProblems = q.data?.disciplines.reduce((sum, discipline) => sum + problemCounts(discipline).all.length, 0) ?? 0;

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Диагностика дисциплин</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Темы, тесты, вопросы, назначения студентам и причины недоступности.
            </p>
          </div>
          {q.data && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <Activity className="w-4 h-4" />
              <span>{q.data.disciplines.length} дисциплин · {totalProblems} событий</span>
            </div>
          )}
        </header>

        {q.isLoading && (
          <div className="grid gap-3">
            <Card><Skeleton className="h-8 w-64" /><Skeleton className="h-24 w-full mt-4" /></Card>
            <Card><Skeleton className="h-8 w-52" /><Skeleton className="h-24 w-full mt-4" /></Card>
          </div>
        )}
        {q.isError && <EmptyState icon={<AlertTriangle />} title="Не удалось загрузить диагностику" description={errorMessage(q.error)} />}
        {q.data && q.data.disciplines.length === 0 && (
          <EmptyState icon={<BookOpen />} title="Дисциплин нет" description="Назначенные вам дисциплины появятся здесь." />
        )}
        {q.data && q.data.disciplines.length > 0 && (
          <div className="grid gap-4">
            {q.data.disciplines.map((discipline) => (
              <DisciplineCard key={discipline.discipline_id} discipline={discipline} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
