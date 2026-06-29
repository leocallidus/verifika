import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

interface RangeFilterProps {
  label: string;
  /** Минимум (может быть undefined если не задан). */
  min?: number;
  /** Максимум. */
  max?: number;
  /** Шаг (по умолчанию 1). */
  step?: number;
  /** Применённое значение — пусто если фильтр выключен. */
  value?: { min?: number; max?: number };
  onChange: (v: { min?: number; max?: number }) => void;
  /** Подпись мин/макс (например "часов"). */
  unit?: string;
}

/**
 * Простой двух-endpoint range filter (от ... до ...). Двусторонний включающий.
 * Выключен когда оба поля пустые.
 */
export function RangeFilter({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  unit,
}: RangeFilterProps) {
  const [lo, setLo] = useState(value?.min?.toString() ?? "");
  const [hi, setHi] = useState(value?.max?.toString() ?? "");

  useEffect(() => {
    setLo(value?.min?.toString() ?? "");
    setHi(value?.max?.toString() ?? "");
  }, [value?.min, value?.max]);

  function emit(nLo: string, nHi: string) {
    const parsedLo = nLo.trim() === "" ? undefined : Number(nLo);
    const parsedHi = nHi.trim() === "" ? undefined : Number(nHi);
    if ((parsedLo !== undefined && Number.isNaN(parsedLo)) || (parsedHi !== undefined && Number.isNaN(parsedHi))) {
      return;
    }
    onChange({ min: parsedLo, max: parsedHi });
  }

  const active = (value?.min !== undefined || value?.max !== undefined);

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs",
      active
        ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-text-primary)]"
        : "border-[var(--color-border)] bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]",
    )}>
      <span className="font-medium">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={lo}
        onChange={(e) => { setLo(e.target.value); emit(e.target.value, hi); }}
        placeholder={min?.toString() ?? "от"}
        min={min}
        max={max}
        step={step}
        className="w-14 h-7 px-1.5 py-0.5 rounded bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)] tabular-nums"
        aria-label={`${label} — минимум`}
      />
      <span aria-hidden>—</span>
      <input
        type="number"
        inputMode="numeric"
        value={hi}
        onChange={(e) => { setHi(e.target.value); emit(lo, e.target.value); }}
        placeholder={max?.toString() ?? "до"}
        min={min}
        max={max}
        step={step}
        className="w-14 h-7 px-1.5 py-0.5 rounded bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)] tabular-nums"
        aria-label={`${label} — максимум`}
      />
      {unit && <span className="text-[var(--color-text-muted)]">{unit}</span>}
    </div>
  );
}
