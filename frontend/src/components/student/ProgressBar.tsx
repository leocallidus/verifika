import { pluralizeRu } from "../../lib/plural-ru";

/** tz-student-role-improvement.md §10.1 — прогресс-бар отвеченных вопросов. */
export function ProgressBar({
  answered,
  total,
  showLabel = true,
  className = "",
}: {
  answered: number;
  total: number;
  showLabel?: boolean;
  className?: string;
}) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div
          className="h-2 flex-1 rounded-full bg-[var(--color-bg-muted)] overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {showLabel && (
          <span className="text-xs tabular-nums text-[var(--color-text-muted)] whitespace-nowrap">
            {pct}%
          </span>
        )}
      </div>
      {showLabel && (
        <div className="mt-1 text-xs text-[var(--color-text-muted)]">
          {pluralizeRu(answered, "вопрос", "вопроса", "вопросов")} из {total} отвечено
        </div>
      )}
    </div>
  );
}
