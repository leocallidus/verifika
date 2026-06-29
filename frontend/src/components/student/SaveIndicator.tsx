import { AlertCircle, Check, Loader2 } from "lucide-react";

export type SaveState = "idle" | "saving" | "saved" | "pending" | "error";

/** tz-student-role-improvement.md §10.3 — индикатор автосохранения. */
export function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Сохранение…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-success)]">
        <Check className="w-3.5 h-3.5" /> Сохранено
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-warning)]">
        <AlertCircle className="w-3.5 h-3.5" /> Будет сохранено
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-danger)]">
      <AlertCircle className="w-3.5 h-3.5" /> Ошибка сохранения
    </span>
  );
}
