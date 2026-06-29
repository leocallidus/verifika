import { useRef, useState } from "react";
import { Archive, Download, FileSpreadsheet, FileUp, Upload } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/Feedback";
import { Field, Select } from "../../components/ui/Field";
import { useToasts } from "../../components/ui/Toast";
import { adminApi } from "../../api/admin";
import { downloadBlob } from "../../api/downloads";
import { errorMessage } from "../../api/client";
import type { AdminStructureImportResult } from "../../types/api";

const TEMPLATE_CSV = [
  "row_type,external_id,name,description,admission_year,last_name,first_name,middle_name,email,login,group_name,initial_password,discipline_name,teacher_login,topic_name,sort_order,question_external_id,question_text,qtype,difficulty,short_pattern,numeric_tolerance,correct_bool,explanation,option_number,option_text,is_correct,match_left,match_right,correct_position",
  "group,,ИВТ-26,,2026,,,,,,,,,,,,,,,,,,,,,,,,",
  "student,,,,,Иванов,Иван,,ivanov@example.test,ivanov,ИВТ-26,Passw0rd!Test,,,,,,,,,,,,,,,,,,",
  "discipline,,Математика,Базовый курс,,,,,,,,,,sidorov,,,,,,,,,,,,,,,,",
  "topic,,Введение,Основные понятия,,,,,,,,,Математика,,Введение,10,,,,,,,,,,,,,,",
  "question,q1,,,,,,,,,,,,,,Введение,,q1,Что такое 2+2?,single,1,,,,,,,,,,",
  "option,,,,,,,,,,,,,,,,q1,,single,1,,,,,1,4,1,,,",
].join("\r\n");

export default function AdminStructureImportExport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const pushToast = useToasts((s) => s.push);
  const [format, setFormat] = useState<"csv" | "xlsx">("xlsx");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<AdminStructureImportResult | null>(null);

  async function onFile(file: File) {
    setImporting(true);
    setResult(null);
    try {
      const response = await adminApi.importStructure(file);
      setResult(response.data);
      const created = sumValues(response.data.created);
      const updated = sumValues(response.data.updated);
      pushToast({
        tone: response.data.errors.length ? "warning" : "success",
        title: "Импорт завершен",
        body: `Создано: ${created}, обновлено: ${updated}, ошибок: ${response.data.errors.length}`,
      });
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось импортировать", body: errorMessage(e) });
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function exportStructure(nextFormat = format) {
    try {
      const path = adminApi.exportStructure({ format: nextFormat, include_archived: includeArchived });
      await downloadBlob(path, `learning-structure.${nextFormat}`);
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось экспортировать", body: errorMessage(e) });
    }
  }

  function downloadTemplate() {
    const blob = new Blob(["\uFEFF" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "learning-structure-template.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Импорт и экспорт структуры
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Группы, студенты, дисциплины, темы, вопросы и варианты ответов.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" iconLeft={<Download className="h-4 w-4" />} onClick={downloadTemplate}>
              Шаблон CSV
            </Button>
            <Button variant="primary" iconLeft={<Upload className="h-4 w-4" />} onClick={() => inputRef.current?.click()} loading={importing}>
              Импорт
            </Button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-[var(--color-accent)]" />
                Последний импорт
              </h2>
              <Badge tone="info">CSV/XLSX</Badge>
            </div>
            {!result && (
              <EmptyState
                icon={<FileUp />}
                title="Файл еще не импортирован"
                description="Загрузите CSV или XLSX с учебной структурой. Строки с ошибками будут пропущены и показаны отдельно."
              />
            )}
            {result && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Создано" value={sumValues(result.created)} tone="success" />
                  <Metric label="Обновлено" value={sumValues(result.updated)} tone="info" />
                  <Metric label="Ошибок" value={result.errors.length} tone={result.errors.length ? "danger" : "neutral"} />
                </div>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                      <tr>
                        <th className="py-2 pr-4">Сущность</th>
                        <th className="py-2 pr-4 text-right">Создано</th>
                        <th className="py-2 pr-4 text-right">Обновлено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(result.created).map((key) => (
                        <tr key={key} className="border-b border-[var(--color-border)]/60">
                          <td className="py-2 pr-4">{labelFor(key)}</td>
                          <td className="py-2 pr-4 text-right">{result.created[key as keyof typeof result.created]}</td>
                          <td className="py-2 pr-4 text-right">{result.updated[key as keyof typeof result.updated]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.errors.length > 0 && (
                  <div>
                    <div className="mb-2 text-sm font-medium">Ошибки строк</div>
                    <div className="max-h-[260px] overflow-auto rounded-lg border border-[var(--color-border)]">
                      {result.errors.map((error, index) => (
                        <div key={`${error.row}-${index}`} className="border-b border-[var(--color-border)] px-3 py-2 text-sm last:border-b-0">
                          <span className="font-medium">Строка {error.row}</span>{" "}
                          <span className="text-[var(--color-text-muted)]">({error.type})</span>: {error.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 font-semibold flex items-center gap-2">
              <Download className="h-4 w-4 text-[var(--color-accent)]" />
              Экспорт
            </h2>
            <div className="space-y-4">
              <Field label="Формат">
                <Select value={format} onChange={(event) => setFormat(event.target.value as "csv" | "xlsx")}>
                  <option value="xlsx">XLSX с листами</option>
                  <option value="csv">CSV единым файлом</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(event) => setIncludeArchived(event.target.checked)}
                />
                <Archive className="h-4 w-4 text-[var(--color-text-muted)]" />
                Включить архивные записи
              </label>
              <Button className="w-full" variant="primary" iconLeft={<Download className="h-4 w-4" />} onClick={() => exportStructure()}>
                Скачать структуру
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}

function sumValues(values: Record<string, number>) {
  return Object.values(values).reduce((acc, value) => acc + value, 0);
}

function labelFor(key: string) {
  const labels: Record<string, string> = {
    groups: "Группы",
    students: "Студенты",
    disciplines: "Дисциплины",
    topics: "Темы",
    questions: "Вопросы",
    options: "Варианты",
  };
  return labels[key] ?? key;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "success" | "info" | "danger" | "neutral" }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 flex items-center justify-between">
        <div className="text-2xl font-semibold">{value}</div>
        <Badge tone={tone}>{value}</Badge>
      </div>
    </div>
  );
}
