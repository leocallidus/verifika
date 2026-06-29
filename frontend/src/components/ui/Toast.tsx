import { create } from "zustand";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Undo2, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type ToastKind = "success" | "error" | "info" | "warning";

export interface ToastAction {
  /** Short label, e.g. «Отменить» */
  label: string;
  /** Invoked when the user clicks the action button. */
  onClick: () => void | Promise<void>;
  /** Optional title for accessibility. */
  title?: string;
  icon?: ReactNode;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: ReactNode;
  ttl?: number;
  action?: ToastAction | null;
}

interface ToastInput {
  title?: ReactNode;
  body?: ReactNode;
  tone?: ToastKind;
  message?: ReactNode;
  ttl?: number;
  action?: ToastAction | null;
}

interface ToastStore {
  items: ToastItem[];
  /**
   * Push a toast. Accepts a structured {tone|title|body} payload (admin pages)
   * OR a positional (k, m, ttl?, action?) signature.
   */
  push: (
    a: ToastKind | ToastInput,
    b?: ReactNode,
    c?: number,
    d?: ToastAction | null,
  ) => void;
  remove: (id: number) => void;
}

let counter = 0;

export const useToasts = create<ToastStore>((set) => ({
  items: [],
  push(a, b, c, d) {
    const id = ++counter;
    let kind: ToastKind = "info";
    let message: ReactNode = null;
    let ttl = 4000;
    let action: ToastAction | null = null;
    if (typeof a === "string") {
      kind = a;
      message = b ?? null;
      ttl = c ?? 4000;
      action = d ?? null;
    } else {
      kind = a.tone ?? "info";
      const title = a.title;
      const body = a.body ?? a.message;
      if (title && body) {
        message = (
          <span>
            <b>{title}</b> — {body}
          </span>
        );
      } else {
        message = (title ?? body ?? null) as ReactNode;
      }
      ttl = a.ttl ?? 4000;
      action = a.action ?? null;
    }
    set((s) => ({ items: [...s.items, { id, kind, message, ttl, action }] }));
  },
  remove(id) {
    set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
  },
}));

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
  warning: <AlertCircle className="w-4 h-4" />,
};

const COLOR: Record<ToastKind, string> = {
  success: "border-[var(--color-success)]/30 bg-[var(--color-success-bg)] text-[var(--color-success)]",
  error: "border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
  info: "border-[var(--color-info)]/30 bg-[var(--color-info-bg)] text-[var(--color-info)]",
  warning: "border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
};

const ACCENT: Record<ToastKind, string> = {
  success: "text-[var(--color-success)] hover:bg-[var(--color-success)]/10",
  error: "text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10",
  info: "text-[var(--color-info)] hover:bg-[var(--color-info)]/10",
  warning: "text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10",
};

export function ToastHost() {
  const items = useToasts((s) => s.items);
  const remove = useToasts((s) => s.remove);

  useEffect(() => {
    const timers = items
      .filter((t) => Boolean(t.ttl) && !t.action)
      .map((t) => window.setTimeout(() => remove(t.id), t.ttl!));
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [items, remove]);

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 sm:bottom-4 z-50 flex flex-col items-center gap-2 p-3 sm:p-0"
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onRemove={() => remove(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, onRemove }: { item: ToastItem; onRemove: () => void }) {
  const consumedRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);

  const total = item.ttl ?? 5000;

  const dismiss = () => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    onRemove();
  };

  const runAction = async () => {
    if (!item.action) return;
    try {
      await item.action.onClick();
    } catch (e) {
      console.error("Toast action execution failed:", e);
    } finally {
      dismiss();
    }
  };

  // Drive a small countdown indicator updated every 100ms.
  useEffect(() => {
    if (!item.action) return;
    const startedAt = Date.now() - elapsed;
    const tick = window.setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 100);
    const finish = window.setTimeout(dismiss, total);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(finish);
    };
  }, [item.action, total]);

  const remaining = item.action ? Math.max(0, total - elapsed) : 0;
  const progress = item.action ? Math.min(1, elapsed / total) : 0;

  if (!item.action) {
    return (
      <div
        role="alert"
        className={cn(
          "pointer-events-auto flex items-start gap-2 min-w-[240px] max-w-[420px] px-4 py-3 rounded-lg border text-sm shadow-sm backdrop-blur",
          COLOR[item.kind],
        )}
      >
        <span className="mt-0.5 shrink-0">{ICONS[item.kind]}</span>
        <div className="flex-1 min-w-0 break-words">{item.message}</div>
        <button
          type="button"
          className="opacity-70 hover:opacity-100"
          aria-label="Закрыть"
          onClick={dismiss}
        >
          <XCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto relative overflow-hidden flex items-start gap-2 min-w-[280px] max-w-[480px] px-4 py-3 rounded-lg border text-sm shadow-sm backdrop-blur",
        COLOR[item.kind],
      )}
      data-testid="toast-with-undo"
    >
      <span className="mt-0.5 shrink-0">{ICONS[item.kind]}</span>
      <div className="flex-1 min-w-0 break-words pr-1">{item.message}</div>
      <button
        type="button"
        onClick={runAction}
        title={item.action.title ?? item.action.label}
        data-testid="toast-undo"
        data-remaining={remaining}
        className={cn(
          "inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-md text-xs font-medium border border-current/30 transition",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-current/40",
          ACCENT[item.kind],
        )}
      >
        {item.action.icon ?? <Undo2 className="w-3.5 h-3.5" />}
        {item.action.label}{" "}
        <span className="tabular-nums opacity-70" data-testid="toast-remaining">
          {Math.ceil(remaining / 1000)}
        </span>
      </button>
      <button
        type="button"
        className="opacity-70 hover:opacity-100"
        aria-label="Закрыть"
        onClick={dismiss}
      >
        <XCircle className="w-3.5 h-3.5" />
      </button>
      <span
        aria-hidden
        data-testid="toast-progress"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-current/40 origin-left"
        style={{ transform: `scaleX(${1 - progress})`, transition: "transform 100ms linear" }}
      />
    </div>
  );
}

export function Toast({ kind = "error", children }: { kind?: ToastKind; children: ReactNode }) {
  return (
    <div role="alert" className={cn("px-3 py-2 rounded-lg border text-sm flex items-start gap-2", COLOR[kind])}>
      <span className="mt-0.5 shrink-0">{ICONS[kind]}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
