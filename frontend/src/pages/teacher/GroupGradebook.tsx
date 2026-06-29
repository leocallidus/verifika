import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileSpreadsheet, FileText, Pencil } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { downloadBlob } from "../../api/downloads";
import { api, errorMessage } from "../../api/client";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Badge } from "../../components/ui/Badge";
import { formatGrade } from "../../utils/grade";



interface StudentGrade {
  student_id: number;
  full_name: string;
  email: string;
}

interface DisciplineInfo {
  discipline_id: number;
  name: string;
}

interface TestSessionInfo {
  student_id: number;
  discipline_id: number;
  topic_id: number | null;
  session_id: number;
  score: number | null;
  max_score: number | null;
  started_at: string;
  completed_at: string | null;
  overridden_score: number | null;
  status: string | null;
  attempt_no: number;
}

interface TopicInfo {
  topic_id: number;
  discipline_id: number;
  name: string;
}

interface GradebookData {
  group_name: string;
  students: StudentGrade[];
  disciplines: DisciplineInfo[];
  topics?: TopicInfo[];
  sessions: TestSessionInfo[];
}


export default function GroupGradebook() {
  const { groupId } = useParams<{ groupId: string }>();
  const gid = Number(groupId);

  const [selectedDisciplineId, setSelectedDisciplineId] = useState<number | "all">("all");
  const [selectedTopicId, setSelectedTopicId] = useState<number | "all">("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [gradeScale, setGradeScale] = useState<"5_point" | "10_point" | "percent">("5_point");

  const [editModal, setEditModal] = useState<{
    studentName: string;
    session: TestSessionInfo;
    disciplineName: string;
    topicName?: string;
  } | null>(null);
  const [overrideScore, setOverrideScore] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [isSavingOverride, setIsSavingOverride] = useState(false);



  const q = useQuery<GradebookData>({
    queryKey: ["teacher", "groups", gid, "gradebook-json"],
    queryFn: () => api.get(`/api/v2/teacher/reports/groups/${gid}/gradebook.xlsx?format=json`).then((r) => r.data),
    enabled: Number.isFinite(gid),
  });

  const getScorePercentage = (s: TestSessionInfo) => {
    const eff = s.overridden_score ?? s.score ?? 0;
    if (!s.max_score) return 0;
    return (eff * 100) / s.max_score;
  };

  const getScoreTone = (pct: number) => {
    if (pct < 50) return "danger";
    if (pct < 75) return "warning";
    return "success";
  };

  const handleDisciplineChange = (val: number | "all") => {
    setSelectedDisciplineId(val);
    setSelectedTopicId("all");
  };

  const handleEditClick = (studentName: string, session: TestSessionInfo) => {
    const disc = q.data?.disciplines.find((d) => d.discipline_id === session.discipline_id);
    const topic = q.data?.topics?.find((t) => t.topic_id === session.topic_id);
    setEditModal({
      studentName,
      session,
      disciplineName: disc?.name || "—",
      topicName: topic?.name,
    });
    setOverrideScore(String(session.overridden_score ?? session.score ?? 0));
    setOverrideReason(session.status === "overridden" ? "Изменено через журнал" : "");
  };

  const handleSaveOverride = async () => {
    if (!editModal) return;
    const scoreVal = parseInt(overrideScore, 10);
    const max = editModal.session.max_score ?? 100;
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > max) {
      alert(`Балл должен быть целым числом от 0 до ${max}`);
      return;
    }
    setIsSavingOverride(true);
    try {
      await api.post(`/api/v2/teacher/grading/sessions/${editModal.session.session_id}/override_score`, {
        score: scoreVal,
        reason: overrideReason.trim() || null,
      });
      await q.refetch();
      setEditModal(null);
    } catch (e: any) {
      alert(errorMessage(e));
    } finally {
      setIsSavingOverride(false);
    }
  };

  const filteredSessions = q.data?.sessions.filter((s) => {
    const completionOrStart = s.completed_at || s.started_at;
    if (!completionOrStart) return true;
    const sessTime = new Date(completionOrStart).getTime();
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      if (sessTime < fromTime) return false;
    }
    if (dateTo) {
      const toTime = new Date(dateTo + "T23:59:59").getTime();
      if (sessTime > toTime) return false;
    }
    if (selectedDisciplineId !== "all" && selectedTopicId !== "all") {
      if (s.topic_id !== selectedTopicId) return false;
    }
    return true;
  }) ?? [];


  return (
    <AppShell
      rightSlot={
        <Link to={`/teacher/reference/groups/${gid}`} className="btn btn-ghost btn-sm">
          К группе
        </Link>
      }
    >
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <Link
          to={`/teacher/reference/groups/${gid}`}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> К группе
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">Журнал группы: {q.data?.group_name || "..."}</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Просмотр успеваемости по дисциплинам и попыткам тестирования.
            </p>
          </div>
          {q.data && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<FileSpreadsheet className="w-4 h-4" />}
                onClick={() =>
                  downloadBlob(
                    `/api/v2/teacher/reports/groups/${gid}/gradebook.xlsx?format=csv`,
                    `gradebook-${q.data?.group_name || gid}.csv`
                  )
                }
              >
                Экспорт CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
                onClick={() =>
                  downloadBlob(
                    `/api/v2/teacher/reports/groups/${gid}/gradebook.xlsx?format=xlsx`,
                    `gradebook-${q.data?.group_name || gid}.xlsx`
                  )
                }
              >
                Экспорт XLSX
              </Button>
              <Button
                variant="primary"
                size="sm"
                iconLeft={<FileText className="w-4 h-4" />}
                onClick={() =>
                  downloadBlob(`/api/v2/teacher/reports/group/${gid}.pdf?scale=${gradeScale}`, `gradebook-${q.data?.group_name || gid}.pdf`)
                }
              >
                Экспорт PDF
              </Button>
            </div>
          )}
        </div>

        <Card className="mb-6">
          <div className={`grid grid-cols-1 gap-4 ${selectedDisciplineId === "all" ? "md:grid-cols-4" : "md:grid-cols-5"}`}>
            <div>
              <label className="label">Дисциплина</label>
              <div className="relative">
                <select
                  value={selectedDisciplineId}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleDisciplineChange(val === "all" ? "all" : Number(val));
                  }}
                  className="input pr-8 appearance-none bg-no-repeat bg-[right_0.5rem_center]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                    backgroundSize: "1.25rem",
                  }}
                >
                  <option value="all">Все дисциплины</option>
                  {q.data?.disciplines.map((d) => (
                    <option key={d.discipline_id} value={d.discipline_id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedDisciplineId !== "all" && (
              <div>
                <label className="label">Тема</label>
                <div className="relative">
                  <select
                    value={selectedTopicId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedTopicId(val === "all" ? "all" : Number(val));
                    }}
                    className="input pr-8 appearance-none bg-no-repeat bg-[right_0.5rem_center]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                      backgroundSize: "1.25rem",
                    }}
                  >
                    <option value="all">Все темы</option>
                    {q.data?.topics
                      ?.filter((t) => t.discipline_id === selectedDisciplineId)
                      .map((t) => (
                        <option key={t.topic_id} value={t.topic_id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="label">Система оценок</label>
              <div className="relative">
                <select
                  value={gradeScale}
                  onChange={(e) => setGradeScale(e.target.value as any)}
                  className="input pr-8 appearance-none bg-no-repeat bg-[right_0.5rem_center]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                    backgroundSize: "1.25rem",
                  }}
                >
                  <option value="5_point">Пятибалльная (1-5)</option>
                  <option value="10_point">Десятибалльная (1-10)</option>
                  <option value="percent">Проценты (%)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Дата с</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Дата по</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input"
              />
            </div>
          </div>
        </Card>

        {q.isLoading && (
          <Card className="space-y-4">
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-20 w-full" />
          </Card>
        )}

        {q.isError && (
          <EmptyState
            title="Ошибка при загрузке журнала"
            description={errorMessage(q.error)}
          />
        )}

        {q.data && (
          <Card className="overflow-x-auto p-0">
            {selectedDisciplineId === "all" ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)] bg-[var(--color-bg-muted)]">
                  <tr>
                    <th className="py-3 px-4 font-medium">ФИО</th>
                    <th className="py-3 px-4 font-medium">Email</th>
                    {q.data.disciplines.map((d) => (
                      <th key={d.discipline_id} className="py-3 px-4 font-medium text-center">
                        {d.name}
                      </th>
                    ))}
                    <th className="py-3 px-4 font-medium text-right">
                      {gradeScale === "percent" ? "Средний %" : "Средний балл"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {q.data.students.map((s) => {
                    let totalPercentage = 0;
                    let count = 0;

                    return (
                      <tr key={s.student_id} className="hover:bg-[var(--color-bg-muted)]/50 transition group">
                        <td className="py-3 px-4 font-medium text-[var(--color-text-primary)]">
                          <Link
                            to={`/teacher/reference/students/${s.student_id}`}
                            className="hover:underline hover:text-[var(--color-accent)]"
                          >
                            {s.full_name}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-[var(--color-text-muted)]">{s.email}</td>
                        {q.data!.disciplines.map((d) => {
                          const sSessions = filteredSessions.filter(
                            (sess) => sess.student_id === s.student_id && sess.discipline_id === d.discipline_id
                          );
                          const completed = sSessions.filter((sess) => sess.completed_at != null);
                          if (completed.length > 0) {
                            const bestSession = completed.reduce((bestSess, currentSess) => {
                              if (!bestSess) return currentSess;
                              return getScorePercentage(currentSess) > getScorePercentage(bestSess) ? currentSess : bestSess;
                            }, null as TestSessionInfo | null);

                            const best = bestSession ? getScorePercentage(bestSession) : 0;
                            totalPercentage += best;
                            count++;
                            return (
                              <td key={d.discipline_id} className="py-3 px-4 text-center">
                                {bestSession ? (
                                  <button
                                    onClick={() => handleEditClick(s.full_name, bestSession)}
                                    className="inline-flex items-center gap-1 hover:text-[var(--color-accent)] focus:outline-none"
                                    title="Изменить оценку"
                                  >
                                    <Badge tone={getScoreTone(best)}>{formatGrade(best, gradeScale).value}</Badge>
                                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                                  </button>
                                ) : (
                                  <Badge tone={getScoreTone(best)}>{formatGrade(best, gradeScale).value}</Badge>
                                )}
                              </td>
                            );
                          }
                          return (
                            <td key={d.discipline_id} className="py-3 px-4 text-center text-[var(--color-text-muted)]">
                              —
                            </td>
                          );
                        })}
                        <td className="py-3 px-4 text-right font-medium">
                          {count > 0 ? (
                            <Badge tone={getScoreTone(totalPercentage / count)}>
                              {formatGrade(totalPercentage / count, gradeScale).value}
                            </Badge>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : selectedTopicId === "all" ? (
              <table className="w-full text-sm border-collapse">
                <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)] bg-[var(--color-bg-muted)]">
                  <tr>
                    <th className="py-3 px-4 font-medium border-b border-[var(--color-border)]">ФИО</th>
                    <th className="py-3 px-4 font-medium border-b border-[var(--color-border)]">Email</th>
                    {(q.data.topics ?? []).filter(t => t.discipline_id === selectedDisciplineId).map((t) => (
                      <th key={t.topic_id} colSpan={3} className="py-2 px-2 font-medium text-center border-l border-b border-[var(--color-border)]">
                        <div className="max-w-[120px] truncate mx-auto" title={t.name}>{t.name}</div>
                      </th>
                    ))}
                    <th className="py-3 px-4 font-medium text-right border-l border-b border-[var(--color-border)]">
                      {gradeScale === "percent" ? "Средний %" : "Средний балл"}
                    </th>
                  </tr>
                  <tr className="bg-[var(--color-bg-muted)]/60 text-[9px] text-[var(--color-text-muted)]">
                    <th className="py-1 px-4"></th>
                    <th className="py-1 px-4"></th>
                    {(q.data.topics ?? []).filter(t => t.discipline_id === selectedDisciplineId).flatMap((t) => [
                      <th key={`${t.topic_id}-1`} className="py-1 px-1 text-center border-l border-[var(--color-border)] font-normal">п1</th>,
                      <th key={`${t.topic_id}-2`} className="py-1 px-1 text-center font-normal">п2</th>,
                      <th key={`${t.topic_id}-3`} className="py-1 px-1 text-center font-normal">п3</th>
                    ])}
                    <th className="py-1 px-4 border-l border-[var(--color-border)]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {q.data.students.map((s) => {
                    const disciplineTopics = (q.data.topics ?? []).filter(t => t.discipline_id === selectedDisciplineId);
                    let totalPercentage = 0;
                    let completedCount = 0;

                    return (
                      <tr key={s.student_id} className="hover:bg-[var(--color-bg-muted)]/50 transition group">
                        <td className="py-3 px-4 font-medium text-[var(--color-text-primary)]">
                          <Link
                            to={`/teacher/reference/students/${s.student_id}`}
                            className="hover:underline hover:text-[var(--color-accent)]"
                          >
                            {s.full_name}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-[var(--color-text-muted)]">{s.email}</td>
                        {disciplineTopics.map((t) => {
                          const sSessions = filteredSessions
                            .filter((sess) => sess.student_id === s.student_id && sess.topic_id === t.topic_id)
                            .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

                          return [0, 1, 2].map((idx) => {
                            const sess = sSessions[idx];
                            const isFirstCol = idx === 0;
                            if (sess) {
                              if (sess.status === "pending_file_grading") {
                                const pct = getScorePercentage(sess);
                                return (
                                  <td key={`${t.topic_id}-${idx}`} className={`py-3 px-1 text-center ${isFirstCol ? "border-l border-[var(--color-border)]" : ""}`}>
                                    <button
                                      onClick={() => handleEditClick(s.full_name, sess)}
                                      className="inline-flex items-center gap-0.5 hover:text-[var(--color-accent)] focus:outline-none"
                                      title="Изменить оценку"
                                    >
                                      <Badge tone="warning">Проверка</Badge>
                                      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition" />
                                    </button>
                                  </td>
                                );
                              }
                              if (sess.completed_at) {
                                const pct = getScorePercentage(sess);
                                totalPercentage += pct;
                                completedCount++;
                                return (
                                  <td key={`${t.topic_id}-${idx}`} className={`py-3 px-1 text-center ${isFirstCol ? "border-l border-[var(--color-border)]" : ""}`}>
                                    <button
                                      onClick={() => handleEditClick(s.full_name, sess)}
                                      className="inline-flex items-center gap-0.5 hover:text-[var(--color-accent)] focus:outline-none"
                                      title="Изменить оценку"
                                    >
                                      <Badge tone={getScoreTone(pct)}>{formatGrade(pct, gradeScale).value}</Badge>
                                      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition" />
                                    </button>
                                  </td>
                                );
                              }
                              return (
                                <td key={`${t.topic_id}-${idx}`} className={`py-3 px-1 text-center ${isFirstCol ? "border-l border-[var(--color-border)]" : ""}`}>
                                  <Badge tone="info">Ход</Badge>
                                </td>
                              );
                            }
                            return (
                              <td key={`${t.topic_id}-${idx}`} className={`py-3 px-1 text-center text-[var(--color-text-muted)] ${isFirstCol ? "border-l border-[var(--color-border)]" : ""}`}>
                                —
                              </td>
                            );
                          });
                        })}
                        <td className="py-3 px-4 text-right font-medium border-l border-[var(--color-border)]">
                          {completedCount > 0 ? (
                            <Badge tone={getScoreTone(totalPercentage / completedCount)}>
                              {formatGrade(totalPercentage / completedCount, gradeScale).value}
                            </Badge>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)] bg-[var(--color-bg-muted)]">
                  <tr>
                    <th className="py-3 px-4 font-medium">ФИО</th>
                    <th className="py-3 px-4 font-medium">Email</th>
                    <th className="py-3 px-4 font-medium text-center">Попытка 1</th>
                    <th className="py-3 px-4 font-medium text-center">Попытка 2</th>
                    <th className="py-3 px-4 font-medium text-center">Попытка 3</th>
                    <th className="py-3 px-4 font-medium text-center">
                      {gradeScale === "percent" ? "Лучший %" : "Лучший балл"}
                    </th>
                    <th className="py-3 px-4 font-medium text-right">
                      {gradeScale === "percent" ? "Средний %" : "Средний балл"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {q.data.students.map((s) => {
                    const sSessions = filteredSessions
                      .filter((sess) => sess.student_id === s.student_id && sess.discipline_id === selectedDisciplineId)
                      .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

                    const completed = sSessions.filter((sess) => sess.completed_at != null);
                    const best = completed.length > 0 ? Math.max(...completed.map(getScorePercentage)) : null;
                    const avg =
                      completed.length > 0
                        ? completed.reduce((sum, sess) => sum + getScorePercentage(sess), 0) / completed.length
                        : null;

                    return (
                      <tr key={s.student_id} className="hover:bg-[var(--color-bg-muted)]/50 transition group">
                        <td className="py-3 px-4 font-medium text-[var(--color-text-primary)]">
                          <Link
                            to={`/teacher/reference/students/${s.student_id}`}
                            className="hover:underline hover:text-[var(--color-accent)]"
                          >
                            {s.full_name}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-[var(--color-text-muted)]">{s.email}</td>
                        {[0, 1, 2].map((idx) => {
                          const sess = sSessions[idx];
                          if (sess) {
                            if (sess.status === "pending_file_grading") {
                              const pct = getScorePercentage(sess);
                              return (
                                <td key={idx} className="py-3 px-4 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <button
                                      onClick={() => handleEditClick(s.full_name, sess)}
                                      className="inline-flex items-center gap-1 hover:text-[var(--color-accent)] focus:outline-none"
                                      title="Изменить оценку"
                                    >
                                      <Badge tone="warning">На проверке</Badge>
                                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                                    </button>
                                    {pct > 0 && (
                                      <span className="text-xs text-[var(--color-text-muted)]">{formatGrade(pct, gradeScale).value} (авто)</span>
                                    )}
                                  </div>
                                </td>
                              );
                            }
                            if (sess.completed_at) {
                              const pct = getScorePercentage(sess);
                              return (
                                <td key={idx} className="py-3 px-4 text-center">
                                  <button
                                    onClick={() => handleEditClick(s.full_name, sess)}
                                    className="inline-flex items-center gap-1 hover:text-[var(--color-accent)] focus:outline-none"
                                    title="Изменить оценку"
                                  >
                                    <Badge tone={getScoreTone(pct)}>{formatGrade(pct, gradeScale).value}</Badge>
                                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                                  </button>
                                </td>
                              );
                            }
                            return (
                              <td key={idx} className="py-3 px-4 text-center">
                                <Badge tone="info">В процессе</Badge>
                              </td>
                            );
                          }
                          return (
                            <td key={idx} className="py-3 px-4 text-center text-[var(--color-text-muted)]">
                              —
                            </td>
                          );
                        })}
                        <td className="py-3 px-4 text-center font-medium">
                          {best != null ? <Badge tone={getScoreTone(best)}>{formatGrade(best, gradeScale).value}</Badge> : <span className="text-[var(--color-text-muted)]">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {avg != null ? <Badge tone={getScoreTone(avg)}>{formatGrade(avg, gradeScale).value}</Badge> : <span className="text-[var(--color-text-muted)]">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        )}
        {editModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <Card className="w-full max-w-md p-6 bg-[var(--color-bg-surface)] border border-[var(--color-border)] shadow-xl animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-lg font-semibold mb-2">Изменение оценки</h3>
              <div className="text-sm text-[var(--color-text-muted)] mb-4 space-y-1">
                <p><strong>Студент:</strong> {editModal.studentName}</p>
                <p><strong>Дисциплина:</strong> {editModal.disciplineName}</p>
                {editModal.topicName && <p><strong>Тема:</strong> {editModal.topicName}</p>}
                <p><strong>Попытка:</strong> #{editModal.session.attempt_no} (Макс. балл: {editModal.session.max_score})</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="label">Новый балл (0 - {editModal.session.max_score})</label>
                  <input
                    type="number"
                    min={0}
                    max={editModal.session.max_score ?? 100}
                    value={overrideScore}
                    onChange={(e) => setOverrideScore(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Причина изменения (опционально)</label>
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="input h-20 resize-none"
                    placeholder="Укажите причину изменения оценки..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button variant="secondary" onClick={() => setEditModal(null)}>Отмена</Button>
                <Button variant="primary" onClick={handleSaveOverride} loading={isSavingOverride}>
                  Сохранить
                </Button>
              </div>
            </Card>
          </div>
        )}
      </section>
    </AppShell>
  );
}
