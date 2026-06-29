import type { TestStartOption } from "../types/api";
import { cn } from "../lib/cn";
import { ProtectedImage } from "./ProtectedImage";

function formatPoints(pts?: number): string {
  const points = pts ?? 1;
  if (points === 1) return "1 балл";
  if (points > 1 && points < 5) return `${points} балла`;
  return `${points} баллов`;
}

export function QuestionCard({
  question,
  selectedOptionId,
  onSelect,
  disabled,
}: {
  question: {
    question_id: number;
    question_text: string;
    image_url?: string | null;
    options: TestStartOption[];
    points?: number;
  };
  selectedOptionId: number | null;
  onSelect: (optionId: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <div className="flex justify-between items-start gap-4 mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{question.question_text}</h2>
        {question.points !== undefined && (
          <span className="text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-bg-muted)] border border-[var(--color-border)] px-2 py-1 rounded shrink-0 tabular-nums">
            {formatPoints(question.points)}
          </span>
        )}
      </div>
      <ProtectedImage
        src={question.image_url}
        alt=""
        className="mb-4 max-h-[300px] sm:max-h-[420px] w-full object-contain rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)]"
      />
      <div className="space-y-2">
        {question.options.map((o) => {
          const checked = selectedOptionId === o.option_id;
          return (
            <label
              key={o.option_id}
              className={cn(
                "flex items-start gap-3 p-4 sm:p-3 rounded-md border cursor-pointer transition min-h-14 sm:min-h-0",
                checked
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] hover:bg-[var(--color-bg-muted)]",
                disabled && "opacity-70 cursor-not-allowed",
              )}
            >
              <input
                type="radio"
                name={`q-${question.question_id}`}
                className="mt-1 h-5 w-5 sm:h-auto sm:w-auto accent-[var(--color-accent)]"
                checked={checked}
                onChange={() => onSelect(o.option_id)}
                disabled={disabled}
              />
              <span className="text-sm sm:text-sm leading-6 sm:leading-5 text-[var(--color-text-primary)]">{o.option_text}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
