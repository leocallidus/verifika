export type GradingMethod = "best" | "last" | "average" | "first";

export const GRADING_METHOD_LABELS: Record<string, string> = {
  best: "Лучшая попытка",
  last: "Последняя попытка",
  average: "Средняя оценка",
  first: "Первая попытка",
};

export function gradingMethodLabel(method: string | null | undefined): string {
  if (!method) return GRADING_METHOD_LABELS.best;
  return GRADING_METHOD_LABELS[method] ?? method;
}
