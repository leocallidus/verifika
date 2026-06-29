import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpen,
  Clock3,
  History,
  LineChart,
  MessageSquare,
  Play,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart as Chart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, errorMessage } from "../../api/client";
import { useAuth } from "../../store/auth";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { KpiTile } from "../../components/ui/KpiTile";
import { TeacherNotificationBell } from "../../components/teacher/TeacherNotificationBell";
import { useTeacherNotificationStream } from "../../api/useTeacherNotificationStream";
import { formatGrade, percentToScaleValue } from "../../utils/grade";
import type {
  DashboardOut,
  TeacherDisciplinesOut,
  TeacherDashboardOut,
} from "../../types/api";

function fmt(dt: string) {
  return new Date(dt).toLocaleString("ru-RU");
}
function fmtRel(dt: string) {
  const ms = new Date(dt).getTime() - Date.now();
  const abs = Math.abs(ms);
  const m = Math.round(abs / 60000);
  const future = ms > 0;
  if (m < 60) return future ? `через ${m} мин` : `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return future ? `через ${h} ч` : `${h} ч назад`;
  const d = Math.round(h / 24);
  return future ? `через ${d} дн` : `${d} дн назад`;
}

export default function Dashboard() {
  const { user } = useAuth();
  useTeacherNotificationStream();
  const [range, setRange] = useState("30d");
  const [gradeScale, setGradeScale] = useState("5_point");
  const teacherDisciplines = useQuery<TeacherDisciplinesOut>({
    queryKey: ["teacher", "disciplines"],
    queryFn: () => api.get("/api/teacher/disciplines").then((r) => r.data),
  });
  const dash = useQuery<TeacherDashboardOut>({
    queryKey: ["teacher", "dashboard", range],
    queryFn: () =>
      api.get(`/api/teacher/dashboard?range=${range}`).then((r) => r.data),
  });
  const analytics = useQuery<DashboardOut>({
    queryKey: ["v2", "dashboard"],
    queryFn: () => api.get("/api/v2/teacher/analytics/dashboard?range=30d").then((r) => r.data),
  });

  const avgGradeLabel = useMemo(() => {
    const pct = dash.data?.stats.avg_overall_percent;
    if (pct == null) return "—";
    return formatGrade(pct, gradeScale).value;
  }, [dash.data?.stats.avg_overall_percent, gradeScale]);

  const chartSeries = useMemo(() => {
    if (!analytics.data?.series) return [];
    if (gradeScale === "percent") return analytics.data.series;
    return analytics.data.series.map((p) => ({
      ...p,
      avg_score: percentToScaleValue(p.avg_score, gradeScale),
    }));
  }, [analytics.data?.series, gradeScale]);

  const chartYDomain = useMemo((): [number, number] => {
    if (gradeScale === "5_point") return [1, 5];
    if (gradeScale === "10_point") return [1, 10];
    return [0, 100];
  }, [gradeScale]);

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Дашборд преподавателя
            </h1>
            {dash.data && (
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Здравствуйте, {dash.data.full_name}. Сегодня и за период «{range}».
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              id="range"
              className="input"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="7d">7 дней</option>
              <option value="30d">30 дней</option>
              <option value="90d">90 дней</option>
              <option value="all">Всё время</option>
            </select>
            <select
              id="grade-scale"
              className="input"
              value={gradeScale}
              onChange={(e) => setGradeScale(e.target.value)}
              title="Шкала оценки"
            >
              <option value="5_point">5-балльная</option>
              <option value="10_point">10-балльная</option>
              <option value="percent">Проценты</option>
            </select>
            <Link to="/teacher/bank" className="btn btn-ghost btn-sm">
              <BookOpen className="w-4 h-4" /> Банк
            </Link>
            <Link
              to={
                teacherDisciplines.data?.disciplines[0]?.discipline_id
                  ? `/teacher/policy/${teacherDisciplines.data.disciplines[0].discipline_id}`
                  : "/teacher"
              }
              className="btn btn-ghost btn-sm"
            >
              Расписание
            </Link>
            <TeacherNotificationBell />
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {dash.isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <Skeleton className="h-9 w-24" />
                </Card>
              ))
            : dash.data && (
                <>
                  <KpiTile
                    label="Дисциплин"
                    value={dash.data.stats.disciplines_count}
                    hint="ваших"
                  />
                  <KpiTile
                    label="Завершённых сессий"
                    value={dash.data.stats.completed_sessions_last_30d}
                    hint={`за ${range}`}
                  />
                  <KpiTile
                    label="Средний балл"
                    value={avgGradeLabel}
                    hint={gradeScale === "5_point" ? "пятибалльная" : gradeScale === "10_point" ? "десятибалльная" : "проценты"}
                  />
                  <KpiTile
                    label="Активных сейчас"
                    value={dash.data.stats.active_sessions_now}
                    hint="сессий студентов"
                  />
                </>
              )}
        </div>

        {dash.isError && (
          <EmptyState
            icon={<LineChart />}
            title="Не удалось загрузить дашборд"
            description={errorMessage(dash.error)}
          />
        )}

        {dash.data && (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-lg font-semibold">Сейчас проходят</h2>
                <Badge tone={dash.data.today.active_sessions.length > 0 ? "success" : "neutral"}>
                  {dash.data.today.active_sessions.length}
                </Badge>
              </div>
              {dash.data.today.active_sessions.length === 0 && (
                <EmptyState
                  icon={<Play />}
                  title="Нет активных попыток"
                  description="Студенты сейчас не проходят тесты."
                  className="py-6"
                />
              )}
              {dash.data.today.active_sessions.length > 0 && (
                <ul className="space-y-3">
                  {dash.data.today.active_sessions.map((s) => (
                    <li
                      key={s.session_id}
                      className="rounded-lg border border-[var(--color-border)] p-3 flex items-start gap-3"
                    >
                      <div className="grid place-items-center w-9 h-9 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] shrink-0">
                        <Play className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {s.student_name}
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)]">
                          {s.discipline_name}
                          {s.topic_name ? ` · ${s.topic_name}` : ""}
                        </div>
                        <div className="mt-1 text-xs text-[var(--color-text-muted)] inline-flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="w-3 h-3" />
                            до закрытия {fmtRel(s.expires_at)}
                          </span>
                          <span>
                            {s.answered_count}/{s.total_count || "?"}
                          </span>
                        </div>
                      </div>
                      <Link to={`/teacher/students/${s.student_id}`}>
                        <Badge tone="accent">
                          Открыть
                          <ArrowUpRight className="w-3 h-3 inline ml-1" />
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-lg font-semibold">Дедлайны (48 ч)</h2>
                <Badge tone={dash.data.today.deadlines.length > 0 ? "warning" : "neutral"}>
                  {dash.data.today.deadlines.length}
                </Badge>
              </div>
              {dash.data.today.deadlines.length === 0 && (
                <EmptyState
                  icon={<History />}
                  title="Близких дедлайнов нет"
                  className="py-6"
                />
              )}
              {dash.data.today.deadlines.length > 0 && (
                <ul className="space-y-3">
                  {dash.data.today.deadlines.map((d) => (
                    <li
                      key={d.topic_id}
                      className="rounded-lg border border-[var(--color-border)] p-3"
                    >
                      <div className="text-sm font-medium">{d.topic_name}</div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        {d.discipline_name} · окно до {fmt(d.available_until)} ({fmtRel(d.available_until)})
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-[var(--color-text-muted)]">
                        <span>Прошло: {d.attempts_overdue_for}</span>
                        <span>Осталось: {d.attempts_left}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {dash.data && dash.data.today.new_comments.length > 0 && (
          <Card>
            <h2 className="text-lg font-semibold mb-3 inline-flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[var(--color-accent)]" />
              Новые комментарии (24 ч)
            </h2>
            <ul className="space-y-3">
              {dash.data.today.new_comments.map((c, idx) => (
                <li
                  key={`${c.session_id}-${c.question_id}-${idx}`}
                  className="rounded-lg border border-[var(--color-border)] p-3"
                >
                  <div className="text-sm">
                    <Link
                      to={`/teacher/students/${c.student_id}`}
                      className="font-medium hover:underline"
                    >
                      {c.student_name}
                    </Link>
                    <span className="text-[var(--color-text-muted)]"> · </span>
                    <span className="text-[var(--color-text-muted)]">
                      вопрос: <span className="line-clamp-1 inline">{c.question_text}</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)] line-clamp-2">
                    «{c.comment}»
                  </p>
                  <div className="mt-1 text-xs text-[var(--color-text-muted)] inline-flex items-center gap-1">
                    <Clock3 className="w-3 h-3" />
                    {fmt(c.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {analytics.data && (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card>
                <h3 className="text-sm font-semibold mb-2">Динамика среднего балла</h3>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <Chart data={chartSeries} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={11} />
                      <YAxis domain={chartYDomain} stroke="var(--color-text-muted)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-bg-elevated)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                        }}
                        formatter={(v: number) =>
                          gradeScale === "percent" ? [`${v}%`, "Средний балл"] : [v, "Средний балл"]
                        }
                      />
                      <Line type="monotone" dataKey="avg_score" stroke="#4F46E5" strokeWidth={2} dot={false} />
                    </Chart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <h3 className="text-sm font-semibold mb-2">Попытки по дням</h3>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={analytics.data.series} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={11} />
                      <YAxis allowDecimals={false} stroke="var(--color-text-muted)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-bg-elevated)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                        }}
                      />
                      <Bar dataKey="attempts_count" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
