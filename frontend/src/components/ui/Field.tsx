import { forwardRef, useId, useRef, useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { cn } from "../../lib/cn";

export interface FieldProps {
  label: string;
  hint?: string;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="label flex items-center gap-1">
        {label}
        {required && <span aria-hidden className="text-[var(--color-danger)]">*</span>}
      </label>
      <FieldContext.Provider value={{ id, hintId, errId }}>
        {children}
      </FieldContext.Provider>
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--color-text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs text-[var(--color-danger)]">
          {toText(error)}
        </p>
      )}
    </div>
  );
}

import { createContext, useContext } from "react";

const FieldContext = createContext<{ id: string; hintId?: string; errId?: string }>({
  id: "field",
});

export const useFieldCtx = () => useContext(FieldContext);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  const { id, hintId, errId } = useFieldCtx();
  return (
    <input
      ref={ref}
      id={id}
      aria-describedby={errId ?? hintId}
      aria-invalid={invalid || Boolean(errId)}
      className={cn("input", invalid && "input-invalid", className)}
      {...rest}
    />
  );
});

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  invalid?: boolean;
}

/**
 * Поле пароля с кнопкой «глаз»:
 *  — нажал (pointerdown / touchstart / mousedown) — видим содержимое,
 *  — отпустил — снова звёздочки.
 * Работает мышью, тачем и пером. На клавиатуре (Tab/Space/Enter) — без действий,
 * чтобы случайно не раскрыть пароль.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ invalid, className, disabled, ...rest }, ref) {
    const { id, hintId, errId } = useFieldCtx();
    const [revealed, setRevealed] = useState(false);
    const pressedRef = useRef(false);

    const show = () => {
      if (disabled) return;
      pressedRef.current = true;
      setRevealed(true);
    };
    const hide = () => {
      pressedRef.current = false;
      setRevealed(false);
    };

    return (
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={revealed ? "text" : "password"}
          aria-describedby={errId ?? hintId}
          aria-invalid={invalid || Boolean(errId)}
          disabled={disabled}
          className={cn("input", "pr-10", invalid && "input-invalid", className)}
          {...rest}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          aria-label={revealed ? "Скрыть пароль" : "Показать пароль"}
          title={revealed ? "Скрыть пароль" : "Показать пароль"}
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            show();
          }}
          onPointerUp={hide}
          onPointerLeave={hide}
          onPointerCancel={hide}
          onMouseDown={(e) => {
            e.preventDefault();
            show();
          }}
          onMouseUp={hide}
          onMouseLeave={hide}
          onTouchStart={(e) => {
            e.preventDefault();
            show();
          }}
          onTouchEnd={hide}
          onTouchCancel={hide}
          onBlur={() => {
            if (pressedRef.current) hide();
          }}
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center",
            "h-7 w-7 rounded-md text-[var(--color-text-muted)]",
            "hover:bg-[var(--color-bg-muted)] active:bg-[var(--color-bg-muted)]",
            "transition-colors select-none",
            revealed && "text-[var(--color-accent)]",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <Eye
            className={cn("w-4 h-4 transition-transform", revealed ? "scale-110" : "scale-100")}
            strokeWidth={1.75}
          />
        </button>
      </div>
    );
  },
);

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  const { id, hintId, errId } = useFieldCtx();
  return (
    <textarea
      ref={ref}
      id={id}
      aria-describedby={errId ?? hintId}
      aria-invalid={invalid || Boolean(errId)}
      className={cn("input min-h-[5rem] py-2 leading-relaxed", invalid && "input-invalid", className)}
      {...rest}
    />
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  const { id } = useFieldCtx();
  return (
    <select
      ref={ref}
      id={id}
      className={cn("input pr-8 appearance-none bg-[length:1rem] bg-[right_0.625rem_center] bg-no-repeat", invalid && "input-invalid", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2371717a'><path d='M5.5 7.5l4.5 4.5 4.5-4.5z'/></svg>\")" }}
      {...rest}
    >
      {children}
    </select>
  );
});
