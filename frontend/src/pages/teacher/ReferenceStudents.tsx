import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, MoreHorizontal, GraduationCap, Upload, Archive } from "lucide-react";
import {
  StudentOut,
  useArchiveStudent,
  useCreateStudent,
  useGroups,
  useStudents,
} from "../../api/teacher-crud";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { DataToolbar } from "../../components/DataToolbar";
import { Drawer } from "../../components/Drawer";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { ConfirmModal } from "../../components/ConfirmModal";
import { PasswordRevealModal } from "../../components/PasswordRevealModal";
import { ImportCsvModal } from "../../components/ImportCsvModal";
import { RangeFilter } from "../../components/RangeFilter";
import { useToasts } from "../../components/ui/Toast";
import { errorMessage, api } from "../../api/client";
import type { StudentWithPassword } from "../../api/teacher-crud";

export default function ReferenceStudents() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const groupId = params.get("group") ? Number(params.get("group")) : undefined;
  const archived = params.get("archived") === "1";
  const sortRaw = params.get("sort") ?? "";
  const minSessions = params.get("min_s") ? Number(params.get("min_s")) : undefined;
  const maxSessions = params.get("max_s") ? Number(params.get("max_s")) : undefined;

  const { data, isLoading, isFetching, isError, error } = useStudents({ q, group_id: groupId, archived });
  const pushToast = useToasts((s) => s.push);
  const groupsQuery = useGroups("", undefined, false);

  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<StudentOut | null>(null);
  const [createdStudent, setCreatedStudent] = useState<StudentWithPassword | null>(null);

  const setQ = (next: string) => {
    const p = new URLSearchParams(params);
    if (next) p.set("q", next); else p.delete("q");
    setParams(p, { replace: true });
  };
  const setArchived = (v: boolean) => {
    const p = new URLSearchParams(params);
    if (v) p.set("archived", "1"); else p.delete("archived");
    setParams(p, { replace: true });
  };
  const setGroupIdx = (gid: number | undefined) => {
    const p = new URLSearchParams(params);
    if (!gid) p.delete("group"); else p.set("group", String(gid));
    setParams(p, { replace: true });
  };
  const setRange = (key: string, v: { min?: number; max?: number }) => {
    const p = new URLSearchParams(params);
    if (v.min === undefined) p.delete(`min_${key}`); else p.set(`min_${key}`, String(v.min));
    if (v.max === undefined) p.delete(`max_${key}`); else p.set(`max_${key}`, String(v.max));
    setParams(p, { replace: true });
  };

  const create = useCreateStudent();
  const archive = useArchiveStudent();

  const filtered = filterRanges(data, { sessions: { min: minSessions, max: maxSessions } });
  const sorted = sortLocally(filtered, sortRaw);
  const groupsForFilter = groupsQuery.data ?? [];

  const columns: DataTableColumn<StudentOut>[] = [
    {
      key: "full_name",
      header: "ФИО",
      sortable: true,
      sortValue: (r) => r.last_name + " " + r.first_name,
      cell: (r) => (
        <button
          type="button"
          onClick={() => { window.location.href = `/teacher/reference/students/${r.student_id}`; }}
          className="text-left font-medium hover:text-[var(--color-accent)]"
        >
          {r.full_name}
        </button>
      ),
    },
    {
      key: "email",
      header: "Email",
      sortable: true,
      sortValue: (r) => r.email,
      cell: (r) => <span className="text-xs text-[var(--color-text-muted)]">{r.email}</span>,
    },
    {
      key: "login",
      header: "Логин",
      sortable: true,
      sortValue: (r) => r.login,
      cell: (r) => <span className="text-xs font-mono">{r.login}</span>,
    },
    {
      key: "group_name",
      header: "Группа",
      sortable: true,
      sortValue: (r) => r.group_name || "",
      cell: (r) => r.group_name === null ? <span className="text-[var(--color-text-muted)]">—</span> : <span>{r.group_name}</span>,
    },
    {
      key: "sessions_count",
      header: "Попыток",
      align: "right",
      sortable: true,
      sortValue: (r) => r.sessions_count,
      cell: (r) => <span className="text-xs tabular-nums">{r.sessions_count}</span>,
    },
    {
      key: "average_score",
      header: "Средний %",
      align: "right",
      sortable: true,
      sortValue: (r) => r.average_score ?? -1,
      cell: (r) => <span className="text-xs tabular-nums">{r.average_score != null ? `${r.average_score}%` : "—"}</span>,
    },
  ];

  return (
    <>
      <DataToolbar
        title="Студенты"
        primaryLabel="Новый студент"
        onPrimary={() => setCreating(true)}
        query={q}
        onQueryChange={setQ}
        queryPlaceholder="Поиск по ФИО, email или логину…"
        isFetching={isFetching}
        archived={archived}
        onArchivedChange={setArchived}
        hint={filtered ? <>Найдено: <span className="font-mono">{filtered.length}</span> из <span className="font-mono">{data?.length ?? 0}</span></> : null}
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={groupId ?? ""}
              onChange={(e) => setGroupIdx(e.target.value ? Number(e.target.value) : undefined)}
              className="input pr-8 appearance-none text-xs"
              aria-label="Фильтр по группе"
            >
              <option value="">Все группы</option>
              {groupsForFilter.map((g) => (
                <option key={g.group_id} value={g.group_id}>{g.name}</option>
              ))}
            </select>
            <RangeFilter
              label="Попыток"
              min={0}
              max={500}
              value={{ min: minSessions, max: maxSessions }}
              onChange={(v) => setRange("s", v)}
            />
            <Button variant="secondary" size="sm" iconLeft={<Upload className="w-3.5 h-3.5" />} onClick={() => setImportOpen(true)}>
              Импорт (CSV/XLSX)
            </Button>
          </div>
        }
      />

      {isError && <EmptyState title="Не удалось загрузить" description={errorMessage(error)} />}
      {isLoading && (
        <Card>
          <Skeleton className="h-10 w-full mb-2" />
          <Skeleton className="h-10 w-full mb-2" />
          <Skeleton className="h-10 w-full" />
        </Card>
      )}
      {!isLoading && !isError && (
        <DataTable
          rows={(sorted ?? []).slice(0, 500)}
          columns={columns}
          rowKey={(r) => r.student_id}
          sortKey={sortRaw.replace(/^-/, "")}
          sortDir={sortRaw.startsWith("-") ? "desc" : sortRaw ? "asc" : null}
          onSortChange={(key, dir) => {
            const p = new URLSearchParams(params);
            if (!dir) p.delete("sort");
            else p.set("sort", dir === "desc" ? `-${key}` : key);
            setParams(p, { replace: true });
          }}
          loading={isLoading}
          rowActions={(r) => (
            <RowMenu
              row={r}
              archived={archived}
              onArchive={() => setArchiveTarget(r)}
            />
          )}
          emptyState={
            <EmptyState
              icon={<GraduationCap className="w-8 h-8" />}
              title={q ? `По запросу «${q}» ничего не нашли` : "Пока нет студентов"}
              description="Создайте студента вручную или импортируйте CSV."
            />
          }
        />
      )}

      {creating && (
        <StudentDrawer
          open
          initial={null}
          groups={groupsQuery.data ?? []}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            try {
              const result = await create.mutateAsync(values);
              setCreating(false);
              setCreatedStudent(result);
            } catch (e) {
              pushToast("error", errorMessage(e));
            }
          }}
          submitting={create.isPending}
        />
      )}

      <ConfirmModal
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        title={`Архивировать «${archiveTarget?.full_name ?? ""}»?`}
        description="Студент будет скрыт из списков. Сессии сохранятся. В течение 5 секунд после архивации его можно восстановить из всплывающего уведомления."
        confirmLabel="Архивировать"
        onConfirm={async () => {
          if (archiveTarget) {
            const target = archiveTarget;
            setArchiveTarget(null);
            try {
              await archive.mutateAsync(target.student_id);
              pushToast("success", `Студент «${target.full_name}» архивирован`, 5000, {
                label: "Отменить",
                title: "Восстановить студента",
                onClick: async () => {
                  await api.post(`/api/v2/teacher/reference/students/${target.student_id}/restore`);
                },
              });
            } catch (e) {
              pushToast("error", errorMessage(e));
            }
          } else {
            setArchiveTarget(null);
          }
        }}
      />

      {importOpen && (
        <ImportCsvModal
          open
          onClose={() => setImportOpen(false)}
          title="Импорт студентов (CSV/XLSX)"
          onImport={async (parsed) => {
            const valid = parsed.rows.flatMap((r) => (r.parsed ? [r.parsed] : []));
            const groupNameToId = new Map((groupsQuery.data ?? []).map((g) => [g.name, g.group_id]));
            const queue = valid.slice();
            const errors: { row: number; message: string }[] = [];
            let created = 0;
            const concurrency = 3;
            async function worker() {
              while (queue.length) {
                const next = queue.shift();
                if (!next) break;
                const gid = groupNameToId.get(next.group_name);
                if (!gid) {
                  errors.push({ row: next.row_number, message: `группа «${next.group_name}» не найдена` });
                  continue;
                }
                try {
                  await create.mutateAsync({
                    last_name: next.last_name,
                    first_name: next.first_name,
                    email: next.email,
                    login: next.login ?? null,
                    group_id: gid,
                    initial_password: next.initial_password ?? null,
                  });
                  created++;
                } catch (e) {
                  errors.push({ row: next.row_number, message: errorMessage(e) });
                }
              }
            }
            await Promise.all(Array.from({ length: concurrency }, worker));
            return {
              created,
              skipped: valid.length - created - errors.length,
              errors,
            };
          }}
        />
      )}

      {createdStudent && (
        <PasswordRevealModal
          open
          onClose={() => setCreatedStudent(null)}
          password={createdStudent.one_time_password}
          recipient={`${createdStudent.full_name} (${createdStudent.email})`}
        />
      )}
    </>
  );
}

function filterRanges(
  rows: StudentOut[] | undefined,
  filters: { sessions?: { min?: number; max?: number } },
): StudentOut[] | undefined {
  if (!rows) return rows;
  return rows.filter((r) => {
    if (filters.sessions?.min !== undefined && r.sessions_count < filters.sessions.min) return false;
    if (filters.sessions?.max !== undefined && r.sessions_count > filters.sessions.max) return false;
    return true;
  });
}

function sortLocally(rows: StudentOut[] | undefined, rawSort: string | null) {
  if (!rows) return [];
  if (!rawSort) return rows;
  const dir = rawSort.startsWith("-") ? "desc" : "asc";
  const key = rawSort.replace(/^-/, "");
  const sorted = [...rows].sort((a, b) => {
    let av: any = (a as unknown as Record<string, unknown>)[key];
    let bv: any = (b as unknown as Record<string, unknown>)[key];

    if (key === "full_name") {
      av = a.last_name + " " + a.first_name;
      bv = b.last_name + " " + b.first_name;
    }

    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv), "ru");
  });
  return dir === "desc" ? sorted.reverse() : sorted;
}

function RowMenu({
  row,
  archived,
  onArchive,
}: {
  row: StudentOut;
  archived: boolean;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-ghost btn-sm h-8 w-8 p-0"
        aria-label="Действия"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          onMouseLeave={() => setOpen(false)}
          className="absolute right-0 mt-1 min-w-[180px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-md p-1 z-20"
        >
          {!archived && (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onArchive(); }}
              className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)] text-[var(--color-danger)]"
            >
              <Archive className="w-3.5 h-3.5" /> Архивировать
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  initial: StudentOut | null;
  groups: { group_id: number; name: string; admission_year: number }[];
  onClose: () => void;
  onSubmit: (values: {
    last_name: string;
    first_name: string;
    middle_name?: string | null;
    email: string;
    login?: string | null;
    group_id: number;
    initial_password?: string | null;
  }) => Promise<void>;
  submitting: boolean;
}

function StudentDrawer({ initial, groups, onClose, onSubmit, submitting }: DrawerProps) {
  const [last, setLast] = useState(initial?.last_name ?? "");
  const [first, setFirst] = useState(initial?.first_name ?? "");
  const [middle, setMiddle] = useState(initial?.middle_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [login, setLogin] = useState(initial?.login ?? "");
  const [groupId, setGroupId] = useState(String(initial?.group_id ?? groups[0]?.group_id ?? ""));
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <Drawer
      open
      onClose={onClose}
      title={initial ? "Изменить студента" : "Новый студент"}
      description={initial?.full_name ?? "Заполните карточку студента"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Отмена</Button>
          <Button
            variant="primary"
            onClick={async () => {
              setErr(null);
              if (!last.trim()) return setErr("Фамилия обязательна");
              if (!first.trim()) return setErr("Имя обязательно");
              if (!/.+@.+\..+/.test(email)) return setErr("Email некорректен");
              const gid = Number(groupId);
              if (!Number.isFinite(gid) || gid <= 0) return setErr("Выберите группу");
              await onSubmit({
                last_name: last.trim(),
                first_name: first.trim(),
                middle_name: middle.trim() || null,
                email: email.trim().toLowerCase(),
                login: login.trim() || null,
                group_id: gid,
                initial_password: password || null,
              });
            }}
            loading={submitting}
          >
            {initial ? "Сохранить" : "Создать"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Фамилия" required>
            <Input value={last} onChange={(e) => setLast(e.target.value)} autoFocus maxLength={100} />
          </Field>
          <Field label="Имя" required>
            <Input value={first} onChange={(e) => setFirst(e.target.value)} maxLength={100} />
          </Field>
        </div>
        <Field label="Отчество">
          <Input value={middle} onChange={(e) => setMiddle(e.target.value)} maxLength={100} />
        </Field>
        <Field label="Email" required>
          <Input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@univ.ru"
          />
        </Field>
        <Field label="Логин" hint="только латиница/цифры/._-; 3..64 симв. Авто-генерация из email">
          <Input value={login} onChange={(e) => setLogin(e.target.value.toLowerCase())} maxLength={64} />
        </Field>
        <Field label="Группа" required>
          <Select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">— выберите —</option>
            {groups.map((g) => (
              <option key={g.group_id} value={g.group_id}>
                {g.name} ({g.admission_year})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Начальный пароль" hint="Если не указан — будет сгенерирован автоматически">
          <Input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="оставьте пустым для авто-генерации"
            minLength={8}
            maxLength={128}
          />
        </Field>
        {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
      </div>
    </Drawer>
  );
}
