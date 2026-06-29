import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeCls = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
};

export function Modal({ open, onClose, title, children, footer, size = "md", className }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
      } else if (e.key === "Tab" && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
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
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    
    setTimeout(() => {
      if (ref.current) {
        const firstInput = ref.current.querySelector<HTMLElement>("input, select, textarea, button");
        if (firstInput) {
          firstInput.focus();
        } else {
          ref.current.focus();
        }
      }
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      lastFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 animate-[fade-in_150ms]"
        onClick={onClose}
      />
      <div
        ref={ref}
        tabIndex={-1}
        className={cn(
          "relative w-full sm:w-auto sm:min-w-[24rem] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] rounded-t-xl sm:rounded-xl border border-[var(--color-border)] shadow-lg max-h-[92dvh] flex flex-col animate-[modal-in_180ms]",
          sizeCls[size],
          className,
        )}
      >
        <header className="flex items-center justify-between gap-2 px-5 py-4 border-b border-[var(--color-border)]">
          <h2 id="modal-title" className="text-base font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="btn btn-ghost h-8 w-8 p-0" aria-label="Закрыть">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-muted)]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
