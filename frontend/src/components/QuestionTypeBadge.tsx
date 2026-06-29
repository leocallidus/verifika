import type { QuestionType } from "../types/api";
import { cn } from "../lib/cn";

/**
 * Русские лейблы типов вопросов. Текст вместо иконки (по требованию дизайн-комитета).
 */
export const QUESTION_TYPE_LABELS: Record<QuestionType, { short: string; full: string; tone: string }> = {
  single: { short: "Один", full: "Один правильный", tone: "bg-[var(--color-accent)]/10 text-[var(--color-accent)]" },
  multi: { short: "Несколько", full: "Несколько правильных", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  short: { short: "Текст", full: "Короткий ответ", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  numeric: { short: "Число", full: "Числовой ответ ± допуск", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  match: { short: "Пары", full: "Сопоставление пар", tone: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300" },
  text: { short: "Ответ", full: "Слово / число", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  order: { short: "Порядок", full: "Расставить по порядку", tone: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  bool: { short: "Верно/неверно", full: "Верно / Неверно", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  cloze: { short: "Пропуск", full: "Пропущенное слово", tone: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  file_upload: { short: "Файл", full: "Загрузка файла", tone: "bg-teal-500/10 text-teal-700 dark:text-teal-300" },
};

/**
 * Pill/badge с полным или коротким русским названием типа.
 * Поддерживает `variant = 'short' | 'full'` (full по умолчанию).
 */
export function QuestionTypeBadge({
  t,
  variant = "short",
  className,
}: {
  t: QuestionType | string;
  variant?: "short" | "full";
  className?: string;
}) {
  const meta = QUESTION_TYPE_LABELS[t as QuestionType] ?? {
    short: t,
    full: t,
    tone: "bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap",
        meta.tone,
        className,
      )}
      title={meta.full}
    >
      {variant === "full" ? meta.full : meta.short}
    </span>
  );
}
