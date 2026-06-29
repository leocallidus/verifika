/**
 * Lightweight CSV parser for student imports.
 * Format expected:
 *   last_name,first_name,email,login,group_name,initial_password
 *
 * Constraints:
 *   - Each row up to ~5 KB
 *   - Up to 1000 rows per file
 *   - UTF-8 with optional BOM (we strip BOM)
 */

export interface StudentCsvRow {
  row_number: number;       // 1-based, header is row 0
  last_name: string;
  first_name: string;
  email: string;
  login?: string | null;
  group_name: string;
  initial_password?: string | null;
}

export type CsvCellError =
  | { field: "last_name"; reason: string }
  | { field: "first_name"; reason: string }
  | { field: "email"; reason: string }
  | { field: "login"; reason: string }
  | { field: "group_name"; reason: string }
  | { field: "initial_password"; reason: string };

export interface CsvRowResult {
  row_number: number;
  raw: Record<string, string>;
  parsed?: StudentCsvRow;
  errors: CsvCellError[];
}

export interface CsvParseResult {
  headers: string[];
  rows: CsvRowResult[];
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;
const REQUIRED_FIELDS = ["last_name", "first_name", "email", "group_name"] as const;
const OPTIONAL_FIELDS = ["login", "initial_password"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const LOGIN_RE = /^[a-z0-9._-]{3,64}$/i;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"' && cur === "") {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): CsvParseResult {
  // strip UTF-8 BOM
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], total_rows: 0, valid_rows: 0, invalid_rows: 0 };
  }
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows: CsvRowResult[] = [];
  let valid = 0;
  let invalid = 0;
  const total = MIN(lines.length - 1, MAX_ROWS);

  for (let i = 1; i <= total; i++) {
    const cells = parseCsvLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => (raw[h] = cells[idx] ?? ""));

    const errors: CsvCellError[] = [];
    const last = (raw.last_name ?? "").trim();
    const first = (raw.first_name ?? "").trim();
    const email = (raw.email ?? "").trim();
    const login = (raw.login ?? "").trim() || null;
    const group_name = (raw.group_name ?? "").trim();
    const pw = (raw.initial_password ?? "").trim() || null;

    if (last.length < 1 || last.length > 100) errors.push({ field: "last_name", reason: "1..100 симв." });
    if (first.length < 1 || first.length > 100) errors.push({ field: "first_name", reason: "1..100 симв." });
    if (!EMAIL_RE.test(email)) errors.push({ field: "email", reason: "некорректный email" });
    const email_norm = email.toLowerCase();
    if (login && !LOGIN_RE.test(login)) errors.push({ field: "login", reason: "только латиница/цифры/._-" });
    if (group_name.length < 1 || group_name.length > 50) errors.push({ field: "group_name", reason: "1..50" });
    if (pw && (pw.length < 8 || pw.length > 128))
      errors.push({ field: "initial_password", reason: "8..128 симв." });

    if (errors.length === 0) {
      valid++;
      rows.push({
        row_number: i,
        raw,
        parsed: {
          row_number: i,
          last_name: last,
          first_name: first,
          email: email_norm,
          login: (login ?? "").toLowerCase() || null,
          group_name,
          initial_password: pw,
        },
        errors: [],
      });
    } else {
      invalid++;
      rows.push({ row_number: i, raw, errors });
    }
  }
  return {
    headers,
    rows,
    total_rows: total,
    valid_rows: valid,
    invalid_rows: invalid,
  };
}

function MIN(a: number, b: number): number {
  return a < b ? a : b;
}

export const CSV_TEMPLATE_HEADER =
  [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].join(",");

export const CSV_TEMPLATE_EXAMPLE =
  "Иванов,Иван,ivanov@univ.ru,ivanov,ИВТ-21,Passw0rd!Test\r\n" +
  "Петрова,Мария,petrova@univ.ru,petrova,ПИ-22,";

export function csvTemplateBlob(): Blob {
  const text =
    CSV_TEMPLATE_HEADER +
    "\r\n" +
    CSV_TEMPLATE_EXAMPLE +
    "\r\n";
  return new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `Файл больше 5 MB (получено: ${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  }
  if (!/csv|text\/csv|comma/.test(file.type) && !/\.csv$/i.test(file.name)) {
    return "Не похоже на CSV-файл";
  }
  return null;
}
