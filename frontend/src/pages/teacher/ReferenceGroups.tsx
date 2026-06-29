import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, MoreHorizontal, Pencil, Archive, Users } from "lucide-react";
import {
  GroupOut,
  useArchiveGroup,
  useCreateGroup,
  useGroups,
  usePatchGroup,
} from "../../api/teacher-crud";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { DataToolbar } from "../../components/DataToolbar";
import { Drawer } from "../../components/Drawer";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Badge } from "../../components/ui/Badge";
import { RangeFilter } from "../../components/RangeFilter";
import { useToasts } from "../../components/ui/Toast";
import { errorMessage, api } from "../../api/client";
import { formatGrade } from "../../utils/grade";


export default function ReferenceGroups() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const year = params.get("year") ? Number(params.get("year")) : undefined;
  const archived = params.get("archived") === "1";
  const minStudents = params.get("min_students") ? Number(params.get("min_students")) : undefined;
  const maxStudents = params.get("max_students") ? Number(params.get("max_students")) : undefined;
  const minAvg = params.get("min_avg") ? Number(params.get("min_avg")) : undefined;
  const maxAvg = params.get("max_avg") ? Number(params.get("max_avg")) : undefined;

  const [gradeScale, setGradeScale] = useState<"5_point" | "10_point" | "percent">("5_point");
  const { data, isLoading, isFetching, isError, error } = useGroups(q, year, archived);

  const pushToast = useToasts((s) => s.push);

  const [editing, setEditing] = useState<GroupOut | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiveId, setArchiveId] = useState<GroupOut | null>(null);

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
  const setRange = (key: string, v: { min?: number; max?: number }) => {
    const p = new URLSearchParams(params);
    if (v.min === undefined) p.delete(`min_${key}`); else p.set(`min_${key}`, String(v.min));
    if (v.max === undefined) p.delete(`max_${key}`); else p.set(`max_${key}`, String(v.max));
    setParams(p, { replace: true });
  };

  const create = useCreateGroup();
  const patch = usePatchGroup();
  const archive = useArchiveGroup();

  // Available years from data + 4 past + 1 future
  const yearsAvailable = Array.from(
    new Set([...(data ?? []).map((g) => g.admission_year), 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]),
  ).sort((a, b) => b - a);

  const filtered = filterRanges(data, {
    students: { min: minStudents, max: maxStudents },
    avg: { min: minAvg, max: maxAvg },
  });
  const sorted = sortLocally(filtered, params.get("sort"));

  const columns: DataTableColumn<GroupOut>[] = [
    {
      key: "name",
      header: "Название",
      sortable: true,
      sortValue: (r) => r.name,
      cell: (r) => (
        <button
          type="button"
          onClick={() => navigate(`/teacher/reference/groups/${r.group_id}`)}
          className="text-left font-medium hover:text-[var(--color-accent)]"
        >
          {r.name}
        </button>
      ),
    },
    {
      key: "admission_year",
      header: "Год",
      align: "right",
      sortable: true,
      sortValue: (r) => r.admission_year,
      cell: (r) => <span className="text-xs tabular-nums">{r.admission_year}</span>,
    },
    {
      key: "student_count",
      header: "Студентов",
      align: "right",
      sortable: true,
      sortValue: (r) => r.student_count,
      cell: (r) => <Badge tone="info">{r.student_count}</Badge>,
    },
    {
      key: "attempts_total",
      header: "Попыток",
      align: "right",
      sortable: true,
      sortValue: (r) => r.attempts_total,
      cell: (r) => <span className="text-xs tabular-nums text-[var(--color-text-muted)]">{r.attempts_total}</span>,
    },
    {
      key: "average_score",
      header: gradeScale === "percent" ? "Средний %" : "Средний балл",
      align: "right",
      sortable: true,
      sortValue: (r) => r.average_score ?? -1,
      cell: (r) => <span className="text-xs">{r.average_score != null ? formatGrade(r.average_score, gradeScale).value : "—"}</span>,
    },
  ];

  return (
    <>
      <DataToolbar
        title="Группы"
        primaryLabel="Новая группа"
        onPrimary={() => setCreating(true)}
        query={q}
        onQueryChange={setQ}
        queryPlaceholder="Поиск по названию…"
        isFetching={isFetching}
        archived={archived}
        onArchivedChange={setArchived}
        hint={filtered ? <>Найдено: <span className="font-mono">{filtered.length}</span> из <span className="font-mono">{data?.length ?? 0}</span></> : null}
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={year ?? ""}
              onChange={(e) => {
                const p = new URLSearchParams(params);
                if (e.target.value) p.set("year", e.target.value); else p.delete("year");
                setParams(p, { replace: true });
              }}
              className="input pr-8 appearance-none text-xs"
              aria-label="Фильтр по году поступления"
            >
              <option value="">Все годы</option>
              {yearsAvailable.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={gradeScale}
              onChange={(e) => setGradeScale(e.target.value as any)}
              className="input pr-8 appearance-none text-xs"
              aria-label="Система оценок"
            >
              <option value="5_point">Пятибалльная (1-5)</option>
              <option value="10_point">Десятибалльная (1-10)</option>
              <option value="percent">Проценты (%)</option>
            </select>
            <RangeFilter
              label="Студентов"
              min={0}
              max={500}
              value={{ min: minStudents, max: maxStudents }}
              onChange={(v) => setRange("students", v)}
            />
            <RangeFilter
              label="Средний %"
              min={0}
              max={100}
              value={{ min: minAvg, max: maxAvg }}
              onChange={(v) => setRange("avg", v)}
              unit="%"
            />
          </div>
        }
      />

      {isError && <EmptyState title="Не удалось загрузить" description={errorMessage(error)} />}
      {isLoading && (
        <Card><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full" /></Card>
      )}
      {!isLoading && !isError && (
        <DataTable
          rows={sorted}
          columns={columns}
          rowKey={(r) => r.group_id}
          sortKey={(params.get("sort") ?? "").replace(/^-/, "")}
          sortDir={(params.get("sort") ?? "").startsWith("-") ? "desc" : (params.get("sort") ? "asc" : null)}
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
              onOpen={() => navigate(`/teacher/reference/groups/${r.group_id}`)}
              onEdit={() => setEditing(r)}
              onArchive={() => setArchiveId(r)}
            />
          )}
          emptyState={
            <EmptyState
              icon={<Users className="w-8 h-8" />}
              title={q ? `По запросу «${q}» ничего не нашли` : "Пока нет групп"}
              description="Создайте первую группу и зачислите студентов."
            />
          }
        />
      )}

      {(creating || editing) && (
        <GroupDrawer
          open
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSubmit={async (v) => {
            try {
              if (editing) await patch.mutateAsync({ id: editing.group_id, payload: v });
              else await create.mutateAsync(v);
              setCreating(false);
              setEditing(null);
            } catch (e) {
              pushToast("error", errorMessage(e));
            }
          }}
          submitting={create.isPending || patch.isPending}
        />
      )}

      <ConfirmModal
        open={archiveId !== null}
        onClose={() => setArchiveId(null)}
        title={`Архивировать группу «${archiveId?.name ?? ""}»?`}
        description={
          archiveId && archiveId.student_count > 0
            ? `В группе ${archiveId.student_count} студентов. Сначала переведите их в другую группу.`
            : "Группа будет скрыта. В течение 5 секунд её можно восстановить из всплывающего уведомления."
        }
        confirmLabel={archiveId && archiveId.student_count > 0 ? "Невозможно" : "Архивировать"}
        onConfirm={async () => {
          const target = archiveId;
          setArchiveId(null);
          if (!target) return;
          if (target.student_count > 0) return;
          try {
            await archive.mutateAsync(target.group_id);
            pushToast("success", `Группа «${target.name}» архивирована`, 5000, {
              label: "Отменить",
              title: "Восстановить группу",
              onClick: async () => {
                await api.post(`/api/v2/teacher/reference/groups/${target.group_id}/restore`);
              },
            });
          } catch (e) {
            pushToast("error", errorMessage(e));
          }
        }}
      />
    </>
  );
}

function filterRanges(
  rows: GroupOut[] | undefined,
  filters: { students?: { min?: number; max?: number }; avg?: { min?: number; max?: number } },
): GroupOut[] | undefined {
  if (!rows) return rows;
  return rows.filter((r) => {
    if (filters.students?.min !== undefined && r.student_count < filters.students.min) return false;
    if (filters.students?.max !== undefined && r.student_count > filters.students.max) return false;
    if (filters.avg?.min !== undefined && (r.average_score ?? 0) < filters.avg.min) return false;
    if (filters.avg?.max !== undefined && (r.average_score ?? Infinity) > filters.avg.max) return false;
    return true;
  });
}

function sortLocally(rows: GroupOut[] | undefined, rawSort: string | null) {
  if (!rows) return [];
  if (!rawSort) return rows;
  const dir = rawSort.startsWith("-") ? "desc" : "asc";
  const key = rawSort.replace(/^-/, "");
  const sorted = [...rows].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[key];
    const bv = (b as unknown as Record<string, unknown>)[key];
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
  onOpen,
  onEdit,
  onArchive,
}: {
  row: GroupOut;
  archived: boolean;
  onOpen: () => void;
  onEdit: () => void;
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
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onOpen(); }}
            className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)]"
          >
            <Users className="w-3.5 h-3.5" /> Открыть группу
          </button>
          {!archived && (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onEdit(); }}
              className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)]"
            >
              <Pencil className="w-3.5 h-3.5" /> Изменить
            </button>
          )}
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onArchive(); }}
            className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)] text-[var(--color-danger)]"
          >
            <Archive className="w-3.5 h-3.5" /> Архивировать
          </button>
        </div>
      )}
    </div>
  );
}

interface DrawerFormProps {
  open: boolean;
  initial: GroupOut | null;
  onClose: () => void;
  onSubmit: (values: { name: string; admission_year: number }) => Promise<void>;
  submitting: boolean;
}

function GroupDrawer({ initial, onClose, onSubmit, submitting }: DrawerFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [year, setYear] = useState(String(initial?.admission_year ?? new Date().getFullYear()));
  const [err, setErr] = useState<string | null>(null);

  return (
    <Drawer
      open
      onClose={onClose}
      title={initial ? "Изменить группу" : "Новая группа"}
      description={initial?.name ?? "Создание группы"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Отмена</Button>
          <Button
            variant="primary"
            onClick={async () => {
              setErr(null);
              const y = Number(year);
              if (!name.trim()) return setErr("Укажите название");
              if (!Number.isFinite(y) || y < 2000 || y > 2100) return setErr("Год: 2000..2100");
              await onSubmit({ name: name.trim(), admission_year: y });
            }}
            loading={submitting}
          >
            {initial ? "Сохранить" : "Создать"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Название" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ИВТ-23"
            autoFocus
            maxLength={50}
          />
        </Field>
        <Field label="Год поступления" required hint="2000..2100">
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min={2000}
            max={2100}
          />
        </Field>
        {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
      </div>
    </Drawer>
  );
}
