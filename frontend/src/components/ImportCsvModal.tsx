import { useEffect, useState } from "react";
import { FileUp, Download, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { useToasts } from "./ui/Toast";
import { csvTemplateBlob, validateFile, type CsvParseResult, type CsvRowResult } from "../api/csv";
import { api, errorMessage } from "../api/client";

interface ImportCsvModalProps {
  open: boolean;
  onClose: () => void;
  /** URL для отправки подготовленных строк (или undefined => только превью). */
  onImport?: (parsed: CsvParseResult) => Promise<{ created: number; skipped: number; errors: { row: number; message: string }[] }>;
  /** Заголовок окна. */
  title?: string;
}

/**
 * Окно импорта CSV/XLSX: drag-and-drop файла, превью с per-row валидацией.
 * Парсер рендерит зелёные/красные строки и счётчик valid/invalid.
 */
export function ImportCsvModal({
  open,
  onClose,
  onImport,
  title = "Импорт CSV/XLSX",
}: ImportCsvModalProps) {
  const pushToast = useToasts((s) => s.push);
  const [parse, setParse] = useState<CsvParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setParse(null);
      setFileName(null);
      setResultMsg(null);
      setSubmitting(false);
    }
  }, [open]);

  async function readFile(file: File) {
    setFileName(file.name);
    setResultMsg(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/api/v2/teacher/reference/students/import-preview", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setParse(res.data);
    } catch (e: any) {
      pushToast("error", errorMessage(e));
      setFileName(null);
    } finally {
      setSubmitting(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) readFile(f);
  }

  async function doImport() {
    if (!parse || !onImport) return;
    setSubmitting(true);
    try {
      const res = await onImport(parse);
      const errorCount = res.errors.length;
      setResultMsg(
        `Импортировано: ${res.created}; пропущено: ${res.skipped}; ошибок: ${errorCount}.`,
      );
      if (res.created > 0) pushToast("success", `Импортировано: ${res.created}`);
      if (errorCount > 0) pushToast("warning", `Ошибок: ${errorCount}`);
      setParse(null);
      setFileName(null);
    } catch (e) {
      pushToast("error", String((e as Error).message ?? e));
    } finally {
      setSubmitting(false);
    }
  }

  function downloadTemplate() {
    const blob = csvTemplateBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students-template.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        {!parse && (
          <>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="block w-full border-2 border-dashed border-[var(--color-border)] rounded-lg p-8 text-center cursor-pointer hover:bg-[var(--color-bg-muted)]/40 transition"
            >
              <FileUp className="w-8 h-8 mx-auto text-[var(--color-text-muted)] mb-2" aria-hidden />
              <p className="text-sm font-medium">Перетащите файл CSV или XLSX сюда</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">или нажмите для выбора</p>
              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFile(f);
                }}
              />
            </label>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">Шаблон: <code className="text-xs">last_name,first_name,email,login,group_name,initial_password</code></span>
              <Button variant="ghost" size="sm" iconLeft={<Download className="w-3.5 h-3.5" />} onClick={downloadTemplate}>
                Скачать шаблон
              </Button>
            </div>
          </>
        )}

        {parse && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                Файл: <span className="font-medium">{fileName}</span> · строк:{" "}
                <span className="font-medium">{parse.total_rows}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-[var(--color-success)]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> валидно {parse.valid_rows}
                </span>
                <span className="inline-flex items-center gap-1 text-[var(--color-danger)]">
                  <XCircle className="w-3.5 h-3.5" /> ошибок {parse.invalid_rows}
                </span>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto border border-[var(--color-border)] rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-bg-muted)] sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left w-10">#</th>
                    <th className="px-2 py-1 text-left">Фамилия</th>
                    <th className="px-2 py-1 text-left">Имя</th>
                    <th className="px-2 py-1 text-left">Email</th>
                    <th className="px-2 py-1 text-left">Login</th>
                    <th className="px-2 py-1 text-left">Группа</th>
                    <th className="px-2 py-1 text-left">Пароль</th>
                    <th className="px-2 py-1 text-left">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {parse.rows.map((r) => (
                    <Row key={r.row_number} row={r} />
                  ))}
                </tbody>
              </table>
            </div>

            {resultMsg && (
              <p className="text-sm text-[var(--color-text-secondary)]">{resultMsg}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => { setParse(null); setFileName(null); }}>
                Другой файл
              </Button>
              {onImport ? (
                <Button
                  variant="primary"
                  onClick={doImport}
                  disabled={parse.valid_rows === 0}
                  loading={submitting}
                >
                  Импортировать {parse.valid_rows} {plural(parse.valid_rows, ["строку", "строки", "строк"])}
                </Button>
              ) : (
                <Button variant="primary" onClick={onClose} disabled={parse.valid_rows === 0}>
                  Готово
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function Row({ row }: { row: CsvRowResult }) {
  const ok = row.parsed !== undefined;
  return (
    <tr
      className={
        ok
          ? "border-b border-[var(--color-border)] last:border-b-0"
          : "border-b border-[var(--color-border)] last:border-b-0 bg-[var(--color-danger-bg)]/30"
      }
    >
      <td className="px-2 py-1 font-mono">{row.row_number}</td>
      <td className="px-2 py-1">{row.raw.last_name ?? ""}</td>
      <td className="px-2 py-1">{row.raw.first_name ?? ""}</td>
      <td className="px-2 py-1">{row.raw.email ?? ""}</td>
      <td className="px-2 py-1">{row.raw.login || "—"}</td>
      <td className="px-2 py-1">{row.raw.group_name ?? ""}</td>
      <td className="px-2 py-1">{row.raw.initial_password ? `${row.raw.initial_password.length} симв.` : "—"}</td>
      <td className="px-2 py-1">
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
        ) : (
          <span className="inline-flex items-center gap-1 text-[var(--color-danger)]">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{row.errors.map((e) => `${e.field}: ${e.reason}`).join("; ")}</span>
          </span>
        )}
      </td>
    </tr>
  );
}
