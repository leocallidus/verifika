import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input } from "./ui/Field";
import { cn } from "../lib/cn";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Активирует двухшаговое подтверждение: пользователь должен ввести точную строку. По умолчанию выключено — это устаревший режим. */
  typeToConfirm?: string;
  /** Style for the confirm button. Danger (red) for destructive actions. */
  tone?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Подтверждение опасного действия.
 *  · Подсвечивает последствия.
 *  · Если typeToConfirm задан — пользователь должен ввести строку для активации кнопки.
 */
export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  typeToConfirm,
  tone = "danger",
  loading,
  onConfirm,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const canConfirm = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.trim().toLowerCase();

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        {description && (
          <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
        )}
        {typeToConfirm && (
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              Введите <span className="font-mono font-semibold text-[var(--color-text-primary)]">{typeToConfirm}</span> для подтверждения
            </p>
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={typeToConfirm}
              invalid={typed.length > 0 && !canConfirm}
            />
            {typed.length > 0 && !canConfirm && (
              <p className="text-[11px] text-[var(--color-danger)] mt-1">
                Не совпадает — введите точно «{typeToConfirm}».
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            disabled={!canConfirm}
            className={cn(tone === "danger" && "btn-danger")}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
