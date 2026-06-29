import { Award, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import type { TopicGradeResponse } from "../../types/api";
import { formatGrade } from "../../utils/grade";

function getMethodLabel(method: string) {
  switch (method) {
    case "best":
      return "Лучшая попытка";
    case "last":
      return "Последняя попытка";
    case "average":
      return "Средняя оценка";
    case "first":
      return "Первая попытка";
    default:
      return method;
  }
}

export function GradeCard({ grade }: { grade: TopicGradeResponse }) {
  const percent = grade.final_grade_percent;
  const score = grade.final_grade_score;
  const maxScore = grade.max_score;
  const method = grade.grading_method;
  const isPassed = grade.is_passed;
  const passingScore = grade.passing_score_percent;
  const attemptsRemaining = grade.attempts_remaining;

  const showStatus = passingScore != null && percent != null;
  const formattedGrade = formatGrade(percent, grade.grade_scale);

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
        <h3 className="font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <Award className="w-5 h-5 text-[var(--color-accent)]" />
          Итоговая оценка за тест
        </h3>
        <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-muted)] px-2 py-1 rounded">
          Метод: {getMethodLabel(method)}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center justify-center w-24 h-24 rounded-full border-4 border-[var(--color-accent)] bg-[var(--color-accent)]/5 text-center px-1">
            <span className="text-xl font-extrabold text-[var(--color-text-primary)] tabular-nums">
              {formattedGrade.value}
            </span>
            {score != null && maxScore != null && (
              <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums font-semibold mt-0.5">
                {score} / {maxScore} б.
              </span>
            )}
          </div>

          <div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">
              {percent != null ? `Оценка за тест: ${formattedGrade.full}` : "Оценка отсутствует"}
            </div>
            {passingScore != null && (
              <div className="text-xs text-[var(--color-text-muted)] mt-1">
                Проходной балл: {formatGrade(passingScore, grade.grade_scale).value}
              </div>
            )}
          </div>
        </div>

        {showStatus && (
          <div className="shrink-0">
            {isPassed ? (
              <div className="inline-flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 text-[var(--color-success)] px-4 py-2 font-semibold text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                Тест сдан
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[var(--color-danger)] px-4 py-2 font-semibold text-sm">
                <XCircle className="w-5 h-5 shrink-0" />
                Тест не сдан
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
        <RefreshCw className="w-3.5 h-3.5" />
        <span>
          Использовано попыток: {grade.attempts_used}
          {grade.max_attempts > 0 ? ` из ${grade.max_attempts}` : ""}
        </span>
        {attemptsRemaining !== null && (
          <span className="ml-auto font-medium text-[var(--color-text-primary)]">
            Осталось попыток: {attemptsRemaining}
          </span>
        )}
      </div>
    </div>
  );
}
