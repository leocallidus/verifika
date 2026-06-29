import { Search, XCircle, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

/**
 * Стандартный тулбар над таблицей:
 *  · поиск (autoFocus в момент показа), clear-кнопка
 *  · переключатель "Активные / С архивом"
 *  · actions: основная кнопка + дополнительные
 */
export interface DataToolbarProps {
  title: string;
  /** Label основной кнопки. */
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** Query-driven. */
  query: string;
  onQueryChange: (q: string) => void;
  queryPlaceholder?: string;
  isFetching?: boolean;
  /** "Только активные" toggle — если true, показываем segmented control. */
  archived?: boolean;
  onArchivedChange?: (v: boolean) => void;
  /** Дополнительные кнопки. */
  extra?: ReactNode;
  /** Right-side hint text (e.g. "Найдено: N"). */
  hint?: ReactNode;
  /** Hide / shortcut `/` handler. */
  pageShortcut?: boolean;
}

export function DataToolbar({
  title,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  query,
  onQueryChange,
  queryPlaceholder = "Поиск…",
  isFetching,
  archived,
  onArchivedChange,
  extra,
  hint,
  pageShortcut = true,
}: DataToolbarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!pageShortcut) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pageShortcut]);

  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {hint && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{hint}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {extra}
          <button
            type="button"
            onClick={onPrimary}
            disabled={primaryDisabled}
            className="btn btn-primary btn-sm"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-[520px]">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={queryPlaceholder}
            aria-label={`Поиск — ${title}`}
            className="input pl-8 pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Очистить поиск"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
          {isFetching && (
            <Loader2
              aria-hidden
              className="absolute right-9 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--color-text-muted)]"
            />
          )}
        </div>
        {onArchivedChange !== undefined && (
          <SegmentedControl
            value={archived ? "archived" : "active"}
            onChange={(v) => onArchivedChange(v === "archived")}
            items={[
              { key: "active", label: "Активные" },
              { key: "archived", label: "С архивом" },
            ]}
          />
        )}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { key: T; label: string }[];
}) {
  return (
    <div className="inline-flex p-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)]">
      {items.map((it) => {
        const active = value === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition",
              active
                ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
