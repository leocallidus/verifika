import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, BookOpen, CheckCircle2, LineChart, Target, Users, FileSpreadsheet } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { downloadBlob } from "../../api/downloads";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as ReLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, errorMessage } from "../../api/client";
import { AppShell } from "../../components/AppShell";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { KpiTile } from "../../components/ui/KpiTile";
import { formatGrade } from "../../utils/grade";
import type { TopicAnalyticsBrief, TopicAnalyticsOut } from "../../types/api";


function pct(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
}

function compactText(value: string, max = 140) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

const bucketColors = ["#dc2626", "#d97706", "#0284c7", "#16a34a"];

export default function TopicAnalyticsPage() {
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [gradeScale, setGradeScale] = useState<"5_point" | "10_point" | "percent">("5_point");


  const topics = useQuery<TopicAnalyticsBrief[]>({
    queryKey: ["v2", "teacher", "analytics", "topics"],
    queryFn: () => api.get("/api/v2/teacher/analytics/topics").then((r) => r.data),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (selectedTopicId == null && topics.data?.length) {
      setSelectedTopicId(topics.data[0].topic_id);
    }
  }, [selectedTopicId, topics.data]);

  const detail = useQuery<TopicAnalyticsOut>({
    queryKey: ["v2", "teacher", "analytics", "topics", selectedTopicId],
    queryFn: () => api.get(`/api/v2/teacher/analytics/topics/${selectedTopicId}`).then((r) => r.data),
    enabled: selectedTopicId != null,
  });

  const selectedTopic = useMemo(
    () => topics.data?.find((topic) => topic.topic_id === selectedTopicId) ?? null,
    [selectedTopicId, topics.data],
  );

  const trendData = useMemo(
    () => detail.data?.trend.map((point) => ({
      ...point,
      label: new Date(point.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      avg_score_percent: point.avg_score_percent ?? 0,
    })) ?? [],
    [detail.data?.trend],
  );

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Аналитика тем</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Средние баллы, сложные вопросы, распределение оценок и динамика по группам.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div className="w-full sm:w-[200px]">
              <label className="label" htmlFor="grade-scale-select">Система оценок</label>
              <select
                id="grade-scale-select"
                className="input"
                value={gradeScale}
                onChange={(e) => setGradeScale(e.target.value as any)}
              >
                <option value="5_point">Пятибалльная (1-5)</option>
                <option value="10_point">Десятибалльная (1-10)</option>
                <option value="percent">Проценты (%)</option>
              </select>
            </div>
            <div className="w-full sm:w-[300px]">
              <label className="label" htmlFor="topic-select">Тема</label>
              <select
                id="topic-select"
                className="input"
                value={selectedTopicId ?? ""}
                onChange={(event) => setSelectedTopicId(Number(event.target.value))}
                disabled={!topics.data?.length}
              >
                {(topics.data ?? []).map((topic) => (
                  <option key={topic.topic_id} value={topic.topic_id}>
                    {topic.discipline_name} · {topic.topic_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {topics.isLoading && (
          <div className="grid gap-3">
            <Card><Skeleton className="h-8 w-72" /><Skeleton className="mt-4 h-24 w-full" /></Card>
            <Card><Skeleton className="h-8 w-52" /><Skeleton className="mt-4 h-24 w-full" /></Card>
          </div>
        )}

        {topics.isError && (
          <EmptyState
            icon={<AlertTriangle />}
            title="Не удалось загрузить список тем"
            description={errorMessage(topics.error)}
          />
        )}

        {topics.data && topics.data.length === 0 && (
          <EmptyState
            icon={<BookOpen />}
            title="Нет настроенных тематических тестов"
            description="Аналитика появится после создания тестов по темам."
          />
        )}

        {selectedTopic && (
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm text-[var(--color-text-muted)]">{selectedTopic.discipline_name}</div>
              <div className="text-lg font-semibold">{selectedTopic.topic_name}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm items-center">
              <Badge tone="neutral">{selectedTopic.attempts_total} попыток</Badge>
              <Badge tone="neutral">{selectedTopic.students_total} студентов</Badge>
              <Badge tone={selectedTopic.avg_score_percent == null ? "neutral" : selectedTopic.avg_score_percent >= 70 ? "success" : "warning"}>
                {gradeScale === "percent" ? "средний " : "средняя оценка "}
                {selectedTopic.avg_score_percent == null ? "—" : formatGrade(selectedTopic.avg_score_percent, gradeScale).value}
              </Badge>
              <Badge tone="info">последняя: {dateLabel(selectedTopic.last_attempt_at)}</Badge>
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
                onClick={() =>
                  downloadBlob(
                    `/api/v2/teacher/analytics/topics/${selectedTopic.topic_id}/export.xlsx`,
                    `analytics-topic-${selectedTopic.topic_id}.xlsx`
                  )
                }
              >
                Экспорт XLSX
              </Button>
            </div>
          </Card>
        )}

        {detail.isLoading && selectedTopicId != null && (
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}><Skeleton className="h-12 w-full" /></Card>
              ))}
            </div>
            <Card><Skeleton className="h-[280px] w-full" /></Card>
          </div>
        )}

        {detail.isError && (
          <EmptyState
            icon={<AlertTriangle />}
            title="Не удалось загрузить аналитику темы"
            description={errorMessage(detail.error)}
          />
        )}

        {detail.data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiTile
                label={gradeScale === "percent" ? "Средний балл" : "Средний балл"}
                value={detail.data.summary.avg_score_percent == null ? "—" : formatGrade(detail.data.summary.avg_score_percent, gradeScale).value}
                hint="по завершённым попыткам"
              />
              <KpiTile
                label="Медиана"
                value={detail.data.summary.median_score_percent == null ? "—" : formatGrade(detail.data.summary.median_score_percent, gradeScale).value}
                hint="устойчивее к выбросам"
              />
              <KpiTile
                label="Проходной порог"
                value={detail.data.summary.passing_score_percent == null ? "—" : formatGrade(detail.data.summary.passing_score_percent, gradeScale).value}
                hint={`сдали: ${pct(detail.data.summary.pass_rate_percent)}`}
              />
              <KpiTile label="Студентов" value={detail.data.summary.students_total} hint={`${detail.data.summary.attempts_total} попыток`} />
              <KpiTile
                label="Диапазон"
                value={
                  detail.data.summary.min_score_percent == null || detail.data.summary.max_score_percent == null
                    ? "—"
                    : `${formatGrade(detail.data.summary.min_score_percent, gradeScale).value}–${formatGrade(detail.data.summary.max_score_percent, gradeScale).value}`
                }
                hint="мин–макс"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <Card>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <LineChart className="w-5 h-5 text-[var(--color-accent)]" />
                    Динамика результатов
                  </h2>
                  <Badge tone="neutral">{trendData.length} дат</Badge>
                </div>
                {trendData.length === 0 ? (
                  <EmptyState icon={<LineChart />} title="Нет завершённых попыток" className="py-10" />
                ) : (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ReLineChart data={trendData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(val) => formatGrade(val, gradeScale).value} />
                        <Tooltip formatter={(value) => [formatGrade(Number(value), gradeScale).value, gradeScale === "percent" ? "Средний %" : "Средний балл"]} />
                        <Line type="monotone" dataKey="avg_score_percent" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} />
                      </ReLineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[var(--color-accent)]" />
                    Распределение оценок
                  </h2>
                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={detail.data.distribution} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => [value, "Попыток"]} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {detail.data.distribution.map((_, index) => (
                          <Cell key={index} fill={bucketColors[index % bucketColors.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <Card>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Target className="w-5 h-5 text-[var(--color-accent)]" />
                    Сложные вопросы
                  </h2>
                  <Badge tone="warning">{detail.data.difficult_questions.length}</Badge>
                </div>
                {detail.data.difficult_questions.length === 0 ? (
                  <EmptyState icon={<CheckCircle2 />} title="Нет данных по вопросам" className="py-10" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                          <th className="py-2 pr-3 font-medium">Вопрос</th>
                          <th className="py-2 px-3 font-medium whitespace-nowrap">Тип</th>
                          <th className="py-2 px-3 font-medium whitespace-nowrap">Верно</th>
                          <th className="py-2 pl-3 font-medium whitespace-nowrap">Ошибок</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.data.difficult_questions.map((question) => (
                          <tr key={question.question_id} className="border-b border-[var(--color-border)] last:border-b-0">
                            <td className="py-3 pr-3 align-top">
                              <div className="font-medium">{compactText(question.question_text)}</div>
                              <div className="text-xs text-[var(--color-text-muted)]">{question.attempts_count} ответов</div>
                            </td>
                            <td className="py-3 px-3 align-top"><Badge tone="neutral">{question.qtype}</Badge></td>
                            <td className="py-3 px-3 align-top tabular-nums">{pct(question.correct_percent)}</td>
                            <td className="py-3 pl-3 align-top tabular-nums">{question.wrong_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5 text-[var(--color-accent)]" />
                    Группы
                  </h2>
                  <Badge tone="neutral">{detail.data.groups.length}</Badge>
                </div>
                {detail.data.groups.length === 0 ? (
                  <EmptyState icon={<Users />} title="Нет групповой динамики" className="py-10" />
                ) : (
                  <div className="space-y-3">
                    {detail.data.groups.map((group) => (
                      <div key={`${group.group_id ?? "none"}-${group.group_name}`} className="rounded-md border border-[var(--color-border)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{group.group_name}</div>
                            <div className="text-xs text-[var(--color-text-muted)]">
                              {group.students_count} студентов · {group.attempts_count} попыток · последняя {dateLabel(group.last_attempt_at)}
                            </div>
                          </div>
                          <Badge tone={group.avg_score_percent == null ? "neutral" : group.avg_score_percent >= 70 ? "success" : "warning"}>
                            {group.avg_score_percent == null ? "—" : formatGrade(group.avg_score_percent, gradeScale).value}
                          </Badge>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-[var(--color-bg-muted)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--color-accent)]"
                            style={{ width: `${Math.max(0, Math.min(100, group.avg_score_percent ?? 0))}%` }}
                          />
                        </div>
                        <div className="mt-1 text-xs text-[var(--color-text-muted)]">Сдали: {pct(group.pass_rate_percent)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
