import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Side from which the panel slides in. Default right. */
  side?: "right" | "left";
  /** Tailwind width utility, e.g. "max-w-md" or "max-w-lg". */
  size?: string;
  /** Optional footer fixed at the bottom. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Правый-sided sheet для редактирования.
 *  · md+: 480 px (или `size`) с бэкдропом и клик-вне закрывает
 *  · mobile: full-screen
 *  · Esc закрывает
 *  · focus-trap внутри drawer
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = "right",
  size = "max-w-md",
  footer,
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab" && panelRef.current) {
        // simple focus trap: cycle within drawer
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    setTimeout(() => panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button"
    )?.focus(), 0);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      lastFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        "fixed inset-0 z-50",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Drawer"}
        className={cn(
          "absolute top-0 bottom-0 bg-[var(--color-bg-elevated)] border-[var(--color-border)] shadow-xl flex flex-col",
          "transition-transform duration-200 ease-out",
          side === "right"
            ? cn("right-0 border-l", open ? "translate-x-0" : "translate-x-full")
            : cn("left-0 border-r", open ? "translate-x-0" : "-translate-x-full"),
          "w-full sm:w-[480px]",
          size,
        )}
      >
        <header className="flex items-start justify-between gap-3 p-5 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-bg-elevated)] z-10">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">{title}</h2>
            {description && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            iconLeft={<X className="w-4 h-4" />}
            aria-label="Закрыть"
          />
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] sticky bottom-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
