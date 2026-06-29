import { cn } from "../../lib/cn";

export type QuestionStatus = "current" | "answered" | "visited" | "untouched";

export interface QuestionMapItem {
  id: number;
  answered: boolean;
  visited: boolean;
  flagged?: boolean;
}

/** tz-student-role-improvement.md §6 — карта вопросов с цветовой индикацией. */
export function statusOf(item: QuestionMapItem, isCurrent: boolean): QuestionStatus {
  if (isCurrent) return "current";
  if (item.answered) return "answered";
  if (item.visited) return "visited";
  return "untouched";
}

const STATUS_CLS: Record<QuestionStatus, string> = {
  current: "bg-blue-500 text-white border-blue-500 dark:bg-blue-600 dark:border-blue-600",
  answered: "bg-green-500 text-white border-green-500 dark:bg-green-600 dark:border-green-600",
  visited: "bg-yellow-400 text-black border-yellow-400 dark:bg-yellow-500 dark:border-yellow-500",
  untouched:
    "bg-gray-200 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-700",
};

export function QuestionMap({
  items,
  currentIndex,
  onJump,
  showLegend = true,
  className = "",
  size = "md",
}: {
  items: QuestionMapItem[];
  currentIndex: number;
  onJump: (index: number) => void;
  showLegend?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const answeredCount = items.filter((i) => i.answered).length;
  const gridClass = size === "lg" ? "grid-cols-5 sm:grid-cols-8 gap-2.5" : "grid-cols-5 gap-2";
  const cellClass = size === "sm" ? "h-9 text-xs" : size === "lg" ? "h-12 text-base" : "h-10 text-sm";
  return (
    <div className={className}>
      <div className={cn("grid", gridClass)}>
        {items.map((item, idx) => {
          const status = statusOf(item, idx === currentIndex);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onJump(idx)}
              aria-label={`Вопрос ${idx + 1}`}
              aria-current={idx === currentIndex ? "true" : undefined}
              className={cn(
                "rounded-md border font-medium transition tabular-nums relative",
                cellClass,
                STATUS_CLS[status],
                item.flagged && "ring-2 ring-[var(--color-warning)] ring-offset-1 ring-offset-[var(--color-bg-elevated)]",
              )}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
      {showLegend && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-[var(--color-text-muted)]">
            <LegendDot className="bg-blue-500 dark:bg-blue-600" label="Текущий" />
            <LegendDot className="bg-green-500 dark:bg-green-600" label="Отвечен" />
            <LegendDot className="bg-yellow-400 dark:bg-yellow-500" label="Просмотрен" />
            <LegendDot className="bg-gray-200 dark:bg-gray-700" label="Не открыт" />
          </div>
          <div className="mt-3 text-sm font-medium text-[var(--color-text-primary)]">
            Отвечено: {answeredCount} из {items.length}
          </div>
        </>
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-3 h-3 rounded-sm", className)} />
      {label}
    </span>
  );
}
