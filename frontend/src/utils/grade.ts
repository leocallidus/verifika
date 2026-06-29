/**
 * Преобразование процента верных ответов в оценку по выбранной шкале.
 */
export interface FormattedGrade {
  value: string;
  label?: string;
  full: string;
}

const FIVE_POINT_LABELS: Record<number, string> = {
  5: "отлично",
  4: "хорошо",
  3: "удовлетворительно",
  2: "неудовлетворительно",
  1: "кол",
};

// Нижние границы процента для каждого балла шкалы — используются и для
// перевода процента в балл, и обратно (граница = минимальный % для этого балла).
const FIVE_POINT_THRESHOLDS: Array<[number, number]> = [
  [90, 5],
  [70, 4],
  [50, 3],
  [20, 2],
  [0, 1],
];

const TEN_POINT_THRESHOLDS: Array<[number, number]> = [
  [95, 10],
  [85, 9],
  [75, 8],
  [65, 7],
  [55, 6],
  [45, 5],
  [35, 4],
  [25, 3],
  [15, 2],
  [0, 1],
];

/** Переводит процент в балл выбранной шкалы (для 5_point/10_point) или округляет (для percent). */
export function percentToScaleValue(percent: number, scale: string | null | undefined): number {
  const pct = Math.round(percent);
  if (scale === "5_point" || !scale) {
    return FIVE_POINT_THRESHOLDS.find(([min]) => pct >= min)?.[1] ?? 1;
  }
  if (scale === "10_point") {
    return TEN_POINT_THRESHOLDS.find(([min]) => pct >= min)?.[1] ?? 1;
  }
  return pct;
}

/** Обратное преобразование: балл шкалы → минимальный процент, дающий этот балл. */
export function scaleValueToPercent(value: number, scale: string | null | undefined): number {
  if (scale === "5_point" || !scale) {
    return FIVE_POINT_THRESHOLDS.find(([, v]) => v === value)?.[0] ?? 0;
  }
  if (scale === "10_point") {
    return TEN_POINT_THRESHOLDS.find(([, v]) => v === value)?.[0] ?? 0;
  }
  return value;
}

export function formatGrade(
  percent: number | null | undefined,
  scale: string | null | undefined
): FormattedGrade {
  if (percent === null || percent === undefined) {
    return { value: "—", full: "—" };
  }

  if (scale === "5_point" || !scale) {
    const value = percentToScaleValue(percent, scale);
    const label = FIVE_POINT_LABELS[value];
    return {
      value: String(value),
      label,
      full: `${value} (${label})`,
    };
  }

  if (scale === "10_point") {
    const value = percentToScaleValue(percent, scale);
    return {
      value: String(value),
      full: `${value} из 10`,
    };
  }

  // По умолчанию — проценты
  const pct = Math.round(percent);
  return {
    value: `${pct}%`,
    full: `${pct}%`,
  };
}
