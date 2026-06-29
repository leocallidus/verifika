import { ChevronRight, GraduationCap } from "lucide-react";
import { ProgressBar } from "./ProgressBar";

function formatPoints(pts?: number): string {
  const points = pts ?? 1;
  if (points === 1) return "1 балл";
  if (points > 1 && points < 5) return `${points} балла`;
  return `${points} баллов`;
}

/** tz-student-role-improvement.md §5.1 — информационная шапка тестирования. */
export function TestHeader({
  disciplineTitle,
  topicTitle,
  currentAttempt,
  maxAttempts,
  currentIndex,
  total,
  answered,
  points,
  showPoints = true,
}: {
  disciplineTitle: string;
  topicTitle: string;
  currentAttempt?: number | null;
  maxAttempts?: number | null;
  currentIndex: number;
  total: number;
  answered: number;
  points?: number;
  showPoints?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 mb-4">
      <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-primary)] flex-wrap">
        <GraduationCap className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
        <span>{disciplineTitle}</span>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
        <span className="text-[var(--color-text-muted)]">{topicTitle}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)] tabular-nums">
        {currentAttempt != null && (
          <span>
            Попытка {currentAttempt}
            {maxAttempts && maxAttempts > 0 ? ` из ${maxAttempts}` : ""}
          </span>
        )}
        <span>
          Вопрос {Math.min(currentIndex + 1, total)} из {total}
          {showPoints && points !== undefined ? ` (${formatPoints(points)})` : ""}
        </span>
        <span>Отвечено: {answered} / {total}</span>
      </div>
      <ProgressBar answered={answered} total={total} showLabel={false} className="mt-2" />
    </div>
  );
}

