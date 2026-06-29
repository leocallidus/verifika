import type { TestStartOption } from "../types/api";
import { cn } from "../lib/cn";
import { ProtectedImage } from "./ProtectedImage";
import { X, Upload, Trash2, Paperclip, Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { api, errorMessage } from "../api/client";
import { useToasts } from "./ui/Toast";


function QuestionImageBlock({ imageUrl }: { imageUrl?: string | null }) {
  return (
    <ProtectedImage
      src={imageUrl}
      alt=""
      className="mb-4 max-h-[300px] sm:max-h-[420px] w-full object-contain rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)]"
    />
  );
}

export function MultiCard({
  questionId,
  text,
  options,
  selected,
  onSelect,
  disabled,
  imageUrl,
}: {
  questionId: number;
  text: string;
  options: TestStartOption[];
  selected: number[];
  onSelect: (ids: number[]) => void;
  disabled?: boolean;
  imageUrl?: string | null;
}) {
  function toggle(id: number) {
    if (disabled) return;
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onSelect(next);
  }
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{text}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">Выберите один или несколько вариантов.</p>
      <QuestionImageBlock imageUrl={imageUrl} />
      <div className="space-y-2">
        {options.map((o) => {
          const checked = selected.includes(o.option_id);
          return (
            <label
              key={o.option_id}
              className={cn(
                "flex items-start gap-3 p-4 sm:p-3 rounded-md border cursor-pointer min-h-14 sm:min-h-0",
                checked
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] hover:bg-[var(--color-bg-muted)]",
                disabled && "opacity-70 cursor-not-allowed",
              )}
            >
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 sm:h-auto sm:w-auto accent-[var(--color-accent)]"
                checked={checked}
                onChange={() => toggle(o.option_id)}
                disabled={disabled}
              />
              <span className="text-sm leading-6 sm:leading-5 text-[var(--color-text-primary)]">{o.option_text}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function ShortAnswerCard({
  questionId: _questionId,
  text,
  pattern,
  value,
  onChange,
  disabled,
  imageUrl,
}: {
  questionId: number;
  text: string;
  pattern: string | null;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  imageUrl?: string | null;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{text}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        Введите ответ. {pattern ? <span>Ожидается: <code className="font-mono text-[var(--color-text-primary)]">{pattern}</code></span> : <span>Точное совпадение.</span>}
      </p>
      <QuestionImageBlock imageUrl={imageUrl} />
      <input
        className="input h-12 sm:h-9 text-base sm:text-sm"
        placeholder="Ваш ответ"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

export function NumericCard({
  questionId: _questionId,
  text,
  tolerance,
  value,
  onChange,
  disabled,
  imageUrl,
}: {
  questionId: number;
  text: string;
  tolerance: number | null;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  imageUrl?: string | null;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{text}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        Введите число.{tolerance !== null && tolerance > 0 ? <span> Допуск: ± {tolerance}</span> : null}
      </p>
      <QuestionImageBlock imageUrl={imageUrl} />
      <input
        type="number"
        step="any"
        inputMode="decimal"
        className="input h-12 sm:h-9 text-base sm:text-sm"
        placeholder="Числовой ответ"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        disabled={disabled}
      />
    </div>
  );
}

export function MatchCard({
  questionId: _questionId,
  text,
  pairs,
  value,
  onChange,
  disabled,
  imageUrl,
}: {
  questionId: number;
  text: string;
  pairs: Array<{ left: string; right: string }>;
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  disabled?: boolean;
  imageUrl?: string | null;
}) {
  const allRights = Array.from(new Set(pairs.map((p) => p.right)));
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{text}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">Сопоставьте левые элементы с правыми.</p>
      <QuestionImageBlock imageUrl={imageUrl} />
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          <tr>
            <th className="py-2 pr-3 font-medium">Левая колонка</th>
            <th className="py-2 font-medium">Правая колонка</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p) => (
            <tr key={p.left} className="border-t border-[var(--color-border)]">
              <td className="py-2.5 pr-3 font-medium text-[var(--color-text-primary)]">{p.left}</td>
              <td className="py-2.5">
                <select
                  className="input h-12 sm:h-9 w-full sm:w-auto pr-8 text-base sm:text-sm"
                  value={value[p.left] ?? ""}
                  onChange={(e) => onChange({ ...value, [p.left]: e.target.value })}
                  disabled={disabled}
                >
                  <option value="">—</option>
                  {allRights.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TextCard({
  questionId: _questionId,
  text,
  value,
  onChange,
  disabled,
  imageUrl,
  mode,
}: {
  questionId: number;
  text: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  imageUrl?: string | null;
  mode?: "string" | "number";
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{text}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        {mode === "number" ? "Введите число." : "Введите слово или короткий ответ."}
      </p>
      <QuestionImageBlock imageUrl={imageUrl} />
      <input
        className="input h-12 sm:h-9 text-base sm:text-sm"
        type={mode === "number" ? "number" : "text"}
        inputMode={mode === "number" ? "decimal" : "text"}
        placeholder={mode === "number" ? "Числовой ответ" : "Ваш ответ"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

export function BoolCard({
  questionId: _questionId,
  text,
  value,
  onChange,
  disabled,
  imageUrl,
}: {
  questionId: number;
  text: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  imageUrl?: string | null;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{text}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">Отметьте, верно утверждение или нет.</p>
      <QuestionImageBlock imageUrl={imageUrl} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={value === true}
          className={cn(
            "inline-flex items-center justify-center gap-2 flex-1 h-14 sm:h-12 rounded-md border text-sm font-medium transition",
            value === true
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-[var(--color-border)] hover:bg-[var(--color-bg-muted)]",
            disabled && "opacity-70 cursor-not-allowed",
          )}
          disabled={disabled}
          onClick={() => onChange(true)}
        >
          Верно
        </button>
        <button
          type="button"
          aria-pressed={value === false}
          className={cn(
            "inline-flex items-center justify-center gap-2 flex-1 h-14 sm:h-12 rounded-md border text-sm font-medium transition",
            value === false
              ? "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "border-[var(--color-border)] hover:bg-[var(--color-bg-muted)]",
            disabled && "opacity-70 cursor-not-allowed",
          )}
          disabled={disabled}
          onClick={() => onChange(false)}
        >
          Неверно
        </button>
      </div>
    </div>
  );
}

export function OrderCard({
  questionId: _questionId,
  text,
  options,
  order,
  onChange,
  disabled,
  imageUrl,
}: {
  questionId: number;
  text: string;
  options: Array<{ option_id: number; text: string; correct_position: number | null }>;
  order: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  imageUrl?: string | null;
}) {
  const byId = new Map(options.map((o) => [o.option_id, o]));
  const placed = order.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const remaining = options.filter((o) => !order.includes(o.option_id));

  function placeFromRemaining(id: number, atIndex?: number) {
    const next = [...order];
    if (atIndex == null) next.push(id);
    else next.splice(atIndex, 0, id);
    onChange(next);
  }
  function reorderInPlaced(from: number, to: number) {
    if (from === to) return;
    const next = [...order];
    const [taken] = next.splice(from, 1);
    next.splice(to, 0, taken);
    onChange(next);
  }
  function removeFromOrder(atIndex: number) {
    const next = [...order];
    next.splice(atIndex, 1);
    onChange(next);
  }

  function handleKey(e: React.KeyboardEvent, idx: number) {
    if (disabled) return;
    if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      reorderInPlaced(idx, idx - 1);
    } else if (e.key === "ArrowDown" && idx < placed.length - 1) {
      e.preventDefault();
      reorderInPlaced(idx, idx + 1);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeFromOrder(idx);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{text}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        Расположите варианты в правильном порядке (сверху вниз). Tab → стрелки ↑↓ — переставить, Delete — убрать обратно в список.
      </p>
      <QuestionImageBlock imageUrl={imageUrl} />
      <div className="space-y-2">
        {placed.map((o, idx) => (
          <div
            key={o.option_id}
            tabIndex={0}
            onKeyDown={(e) => handleKey(e, idx)}
            className="flex items-center gap-2 rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-3 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
            aria-label={`Позиция ${idx + 1}: ${o.text}`}
          >
            <span className="w-7 h-7 grid place-items-center rounded-md bg-[var(--color-accent)] text-white text-sm font-semibold">{idx + 1}</span>
            <span className="flex-1 text-sm">{o.text}</span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => reorderInPlaced(idx, idx - 1)} aria-label="Выше">↑</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => reorderInPlaced(idx, idx + 1)} aria-label="Ниже">↓</button>
            <button type="button" className="btn btn-ghost btn-sm text-[var(--color-danger)]" disabled={disabled} onClick={() => removeFromOrder(idx)} aria-label="Убрать из порядка"><X className="w-3.5 h-3.5 mr-1" />Убрать</button>
          </div>
        ))}
      </div>
      {placed.length > 0 && (
        <div className="my-3 border-t border-dashed border-[var(--color-border)]" />
      )}
      <div className="space-y-2">
        {remaining.length === 0 ? (
          <div className="text-xs text-[var(--color-text-muted)]">Все варианты расставлены.</div>
        ) : (
          remaining.map((o) => (
            <button
              type="button"
              key={o.option_id}
              disabled={disabled}
              onClick={() => placeFromRemaining(o.option_id)}
            className="w-full flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-4 sm:p-3 min-h-14 sm:min-h-0 text-left text-sm hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/5 transition disabled:opacity-50"
              aria-label={`Добавить ${o.text} к порядку`}
            >
              <span className="w-7 h-7 grid place-items-center rounded-md border border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">+</span>
              <span className="flex-1">{o.text}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function ClozeCard({
  questionId: _questionId,
  text,
  blanks,
  values,
  onChange,
  disabled,
  imageUrl,
}: {
  questionId: number;
  text: string;
  blanks: Array<{
    index: number;
    kind: "select" | "input";
    options: string[] | null;
  }>;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  disabled?: boolean;
  imageUrl?: string | null;
}) {
  // Render text with placeholders replaced by inputs/selects.
  const parts: Array<{ kind: "text"; text: string } | { kind: "blank"; blank: NonNullable<typeof blanks[number]> }> = [];
  const re = /\{\{blank:(\d+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }
    const idx = Number(match[1]);
    const blank = blanks.find((b) => b.index === idx);
    if (blank) {
      parts.push({ kind: "blank", blank });
    } else {
      parts.push({ kind: "text", text: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">{text.replace(/\{\{blank:\d+\}\}/g, "") || "Заполните пропуски"}</h2>
      <QuestionImageBlock imageUrl={imageUrl} />
      <div className="leading-relaxed">
        {parts.map((p, i) => {
          if (p.kind === "text") {
            return <span key={i}>{p.text}</span>;
          }
          const idxKey = String(p.blank.index);
          const val = values[idxKey] ?? "";
          if (p.blank.kind === "select") {
            const opts = p.blank.options ?? [];
            return (
              <select
                key={i}
                aria-label={`Пропуск ${p.blank.index}`}
                className="input inline-block h-12 sm:h-9 w-full sm:w-auto my-1 sm:mx-1 text-base sm:text-sm"
                value={val}
                onChange={(e) => onChange({ ...values, [idxKey]: e.target.value })}
                disabled={disabled}
              >
                <option value="">—</option>
                {opts.map((o, ix) => (
                  <option key={ix} value={o}>{o}</option>
                ))}
              </select>
            );
          }
          return (
            <input
              key={i}
              aria-label={`Пропуск ${p.blank.index}`}
              className="input inline-block h-12 sm:h-9 w-full sm:w-auto my-1 sm:mx-1 text-base sm:text-sm"
              value={val}
              onChange={(e) => onChange({ ...values, [idxKey]: e.target.value })}
              disabled={disabled}
            />
          );
        })}
      </div>
    </div>
  );
}


interface UploadedFileInfo {
  upload_id: number;
  original_name: string;
  size_bytes: number;
  uploaded_at: string;
}

interface FileUploadCardProps {
  questionId: number;
  sessionId: number;
  text: string;
  allowedTypes: string[] | null;
  maxSizeBytes: number;
  maxCount: number;
  uploads: UploadedFileInfo[];
  onUploadsChange: (uploads: UploadedFileInfo[]) => void;
  disabled?: boolean;
  imageUrl?: string | null;
}

export function FileUploadCard({
  questionId,
  sessionId,
  text,
  allowedTypes,
  maxSizeBytes,
  maxCount,
  uploads,
  onUploadsChange,
  disabled,
  imageUrl,
}: FileUploadCardProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pushToast = useToasts((s) => s.push);
  const accept = allowedTypes && allowedTypes.length > 0 ? allowedTypes.join(",") : undefined;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    try {
      const currentUploads = [...uploads];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > maxSizeBytes) {
          throw new Error(`Файл слишком большой. Максимальный размер: ${formatBytes(maxSizeBytes)}`);
        }
        
        const formData = new FormData();
        formData.append("file", file);

        const resp = await api.post<UploadedFileInfo>(
          `/api/student/sessions/${sessionId}/questions/${questionId}/files`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          }
        );
        currentUploads.push(resp.data);
      }
      onUploadsChange(currentUploads);
    } catch (err: unknown) {
      const message = errorMessage(err);
      setError(message);
      pushToast("error", message);
    } finally {
      setUploading(false);
      if (e.target) {
        e.target.value = "";
      }
    }
  };

  const handleDelete = async (uploadId: number) => {
    if (disabled) return;
    setError(null);
    try {
      await api.delete(
        `/api/student/sessions/${sessionId}/questions/${questionId}/files/${uploadId}`
      );
      onUploadsChange(uploads.filter((u) => u.upload_id !== uploadId));
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  };

  const reachedMax = uploads.length >= maxCount;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">{text}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        Загрузите файл с ответом. Максимальное кол-во: {maxCount}. Макс. размер: {formatBytes(maxSizeBytes)}.
        {allowedTypes && allowedTypes.length > 0 && (
          <span className="block mt-1">Разрешённые форматы: {allowedTypes.join(", ")}</span>
        )}
      </p>
      <QuestionImageBlock imageUrl={imageUrl} />

      <div className="space-y-3">
        {uploads.map((u) => (
          <div
            key={u.upload_id}
            className="flex items-center justify-between p-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)]"
          >
            <div className="flex items-center gap-2 overflow-hidden mr-2">
              <Paperclip className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
              <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                {u.original_name}
              </span>
              <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                ({formatBytes(u.size_bytes)})
              </span>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => handleDelete(u.upload_id)}
                className="text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 p-1.5 rounded-md transition"
                title="Удалить"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {!reachedMax && !disabled && (
          <label
            className={cn(
              "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-md cursor-pointer transition",
              uploading
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5 cursor-not-allowed"
                : "border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5"
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 text-[var(--color-accent)] animate-spin mb-2" />
                <span className="text-sm font-medium text-[var(--color-text-primary)]">Загрузка файла...</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-[var(--color-text-muted)] mb-2" />
                <span className="text-sm font-medium text-[var(--color-text-primary)]">Выбрать файл для загрузки</span>
                <span className="text-xs text-[var(--color-text-muted)] mt-1">Нажмите или перетащите файл сюда</span>
              </>
            )}
            <input
              type="file"
              className="hidden"
              onChange={handleFileChange}
              disabled={disabled || uploading}
              multiple={maxCount > 1}
              accept={accept}
            />
          </label>
        )}

        {reachedMax && !disabled && (
          <div className="p-3 rounded-md bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 text-center text-sm text-[var(--color-success)]">
            Достигнуто максимальное число файлов. Для замены удалите существующие.
          </div>
        )}

        {disabled && uploads.length === 0 && (
          <div className="p-3 rounded-md bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20 text-center text-sm text-[var(--color-warning)]">
            Файлы не были загружены.
          </div>
        )}

        {error && (
          <div className="p-3 rounded-md bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
