import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Copy, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";

interface PasswordRevealModalProps {
  open: boolean;
  onClose: () => void;
  /** The one-time password shown to the teacher. */
  password: string;
  /** Identifier of who this password belongs to (e.g. student email or login). */
  recipient: string;
  /** Optional hint text for the teacher above the password. */
  hint?: string;
}

/**
 * Одноразовый показ пароля. После закрытия окна пароль больше нигде не доступен.
 * Это compliance-требование: пароль пользователя не должен сохраняться
 * в обычном списке или логах.
 */
export function PasswordRevealModal({
  open,
  onClose,
  password,
  recipient,
  hint = "Запишите пароль и передайте студенту лично. После закрытия этого окна восстановить пароль будет невозможно — только сброс.",
}: PasswordRevealModalProps) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Пароль создан" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          <ShieldCheck className="w-4 h-4 inline-block text-[var(--color-success)] mr-1" />
          Учётная запись создана. Одноразовый пароль для <span className="font-semibold">{recipient}</span>:
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>

        <div className="flex items-stretch gap-2">
          <div
            className={cn(
              "flex-1 font-mono text-center px-3 py-3 rounded-md border",
              "border-[var(--color-border)] bg-[var(--color-bg-muted)]",
              shown ? "text-base" : "text-sm tracking-widest",
            )}
            aria-live="polite"
          >
            {shown ? password : "•".repeat(password.length)}
          </div>
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="btn btn-secondary btn-sm h-auto"
            aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
          >
            {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={copy}
            className="btn btn-secondary btn-sm h-auto"
            aria-label="Скопировать"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        {copied && <p className="text-xs text-[var(--color-success)]">Скопировано в буфер обмена</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="primary" onClick={onClose}>
            Я записал пароль
          </Button>
        </div>
      </div>
    </Modal>
  );
}
