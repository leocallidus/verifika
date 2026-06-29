import { Link } from "react-router-dom";
import { Trophy, Clock, Calendar, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import type { SessionSummary } from "../../types/api";
import { formatGrade } from "../../utils/grade";

function fmtDate(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} сек`;
  return `${m} мин ${s} сек`;
}

interface AttemptsSummaryTableProps {
  sessions: SessionSummary[];
  currentSessionId?: number;
  passingScorePercent?: number | null;
  gradeScale?: string;
}

export function AttemptsSummaryTable({
  sessions,
  currentSessionId,
  passingScorePercent,
  gradeScale,
}: AttemptsSummaryTableProps) {
  // Sort sessions by attempt_number ascending
  const sortedSessions = [...sessions].sort((a, b) => a.attempt_number - b.attempt_number);

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <h3 className="font-semibold text-[var(--color-text-primary)]">История попыток</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-xs text-[var(--color-text-muted)] font-medium uppercase">
              <th className="py-3 px-4 w-20 text-center">Попытка</th>
              <th className="py-3 px-4">Дата прохождения</th>
              <th className="py-3 px-4 w-36">Время</th>
              <th className="py-3 px-4 w-32">Баллы</th>
              <th className="py-3 px-4 w-44">Оценка</th>
              <th className="py-3 px-4 w-28 text-center">Статус</th>
              <th className="py-3 px-4 w-24 text-center">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {sortedSessions.map((s) => {
              const isCurrent = s.id === currentSessionId;
              const hasScore = s.score != null && s.max_score != null;
              const isPassed =
                passingScorePercent != null && s.percent != null
                   ? s.percent >= passingScorePercent
                   : null;

              return (
                <tr
                  key={s.id}
                  className={[
                    "transition",
                    isCurrent
                      ? "bg-[var(--color-accent)]/5 font-semibold border-l-4 border-l-[var(--color-accent)]"
                      : "hover:bg-[var(--color-bg-muted)]/30",
                  ].join(" ")}
                >
                  <td className="py-3.5 px-4 text-center">
                    <span className="flex items-center justify-center gap-1">
                      {s.attempt_number}
                      {s.is_best && (
                        <Trophy className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                      )}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[var(--color-text-primary)]">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                      {fmtDate(s.started_at)}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[var(--color-text-muted)]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      {fmtDuration(s.duration_seconds)}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 tabular-nums">
                    {hasScore ? `${s.score} / ${s.max_score}` : "—"}
                  </td>
                  <td className="py-3.5 px-4 tabular-nums text-[var(--color-text-primary)] font-medium">
                    {s.percent != null ? formatGrade(s.percent, gradeScale).full : "—"}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {s.status === "finished" || s.status === "completed" ? (
                      isPassed === null ? (
                        <span className="text-xs text-[var(--color-text-muted)]">Завершено</span>
                      ) : isPassed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-success)] bg-green-500/10 px-2.5 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Сдано
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-danger)] bg-red-500/10 px-2.5 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3" /> Не сдано
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center text-xs font-semibold text-yellow-600 bg-yellow-500/10 px-2.5 py-0.5 rounded-full">
                        В процессе
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {s.status === "finished" || s.status === "completed" ? (
                      <Link
                        to={`/student/results/${s.id}`}
                        className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] font-semibold transition"
                      >
                        Открыть <ArrowRight className="w-3 h-3" />
                      </Link>
                    ) : (
                      <Link
                        to={`/student/test/${s.id}`}
                        className="inline-flex items-center gap-1 text-xs text-yellow-600 hover:text-yellow-700 font-semibold transition"
                      >
                        Продолжить <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
