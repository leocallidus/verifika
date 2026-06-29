import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, MoreHorizontal, Pencil, Archive, RotateCcw, Settings } from "lucide-react";
import {
  DisciplineOut,
  useArchiveDiscipline,
  useCreateDiscipline,
  useDisciplines,
  usePatchDiscipline,
  useRestoreDiscipline,
} from "../../api/teacher-crud";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { DataToolbar } from "../../components/DataToolbar";
import { Drawer } from "../../components/Drawer";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Badge } from "../../components/ui/Badge";
import { ConfirmModal } from "../../components/ConfirmModal";
import { RangeFilter } from "../../components/RangeFilter";
import { useToasts } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";
import { errorMessage } from "../../api/client";

export default function ReferenceDisciplines() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const archived = params.get("archived") === "1";
  const sortRaw = params.get("sort") ?? "";
  const sortKey = sortRaw.replace(/^-/, "");
  const sortDir: "asc" | "desc" | null = sortRaw.startsWith("-") ? "desc" : sortRaw ? "asc" : null;
  const minHours = params.get("min_hours") ? Number(params.get("min_hours")) : undefined;
  const maxHours = params.get("max_hours") ? Number(params.get("max_hours")) : undefined;
  const minMinutes = params.get("min_minutes") ? Number(params.get("min_minutes")) : undefined;
  const maxMinutes = params.get("max_minutes") ? Number(params.get("max_minutes")) : undefined;
  const minQuestions = params.get("min_q") ? Number(params.get("min_q")) : undefined;
  const maxQuestions = params.get("max_q") ? Number(params.get("max_q")) : undefined;

  const { data, isLoading, isFetching, isError, error } = useDisciplines(q, archived);
  const pushToast = useToasts((s) => s.push);

  const [editing, setEditing] = useState<DisciplineOut | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiveId, setArchiveId] = useState<number | null>(null);

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
  const handleSort = (key: string, dir: "asc" | "desc" | null) => {
    const p = new URLSearchParams(params);
    if (!dir) p.delete("sort");
    else p.set("sort", dir === "desc" ? `-${key}` : key);
    setParams(p, { replace: true });
  };

  const create = useCreateDiscipline();
  const patch = usePatchDiscipline();
  const archive = useArchiveDiscipline();
  const restore = useRestoreDiscipline();

  const filtered = filterRanges(data, {
    hours: { min: minHours, max: maxHours },
    minutes: { min: minMinutes, max: maxMinutes },
    questions: { min: minQuestions, max: maxQuestions },
  });
  const sorted = sortLocally(filtered, sortKey, sortDir);

  const columns: DataTableColumn<DisciplineOut>[] = [
    {
      key: "name",
      header: "Название",
      sortable: true,
      sortValue: (r) => r.name,
      cell: (r) => (
        <button
          type="button"
          onClick={() => setEditing(r)}
          className="text-left font-medium hover:text-[var(--color-accent)]"
        >
          {r.name}
        </button>
      ),
    },
    {
      key: "description",
      header: "Описание",
      cell: (r) => <span className="text-[var(--color-text-muted)] line-clamp-1 max-w-[220px]">{r.description ?? "—"}</span>,
    },
    {
      key: "total_hours",
      header: "Часов всего",
      align: "right",
      sortable: true,
      sortValue: (r) => r.total_hours ?? -1,
      cell: (r) => <span className="text-xs tabular-nums">{r.total_hours ?? "—"}</span>,
    },
    {
      key: "credits",
      header: "Час/нед",
      align: "right",
      sortable: true,
      sortValue: (r) => r.credits ?? -1,
      cell: (r) => <span className="text-xs tabular-nums">{r.credits ?? "—"}</span>,
    },
    {
      key: "question_count",
      header: "Вопросов",
      sortable: true,
      align: "right",
      sortValue: (r) => r.question_count,
      cell: (r) => <span className="text-xs tabular-nums">{r.question_count}</span>,
    },
    {
      key: "time_limit_minutes",
      header: "Лимит мин.",
      sortable: true,
      align: "right",
      sortValue: (r) => r.time_limit_minutes,
      cell: (r) => <span className="text-xs tabular-nums">{r.time_limit_minutes}</span>,
    },
    {
      key: "student_count",
      header: "Попыток",
      sortable: true,
      align: "right",
      sortValue: (r) => r.student_count,
      cell: (r) => <span className="text-xs tabular-nums">{r.student_count}</span>,
    },
    {
      key: "policy_settings",
      header: "Управление",
      align: "center",
      cell: (r) => (
        <Link
          to={`/teacher/policy/${r.discipline_id}`}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] font-medium"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Настройки</span>
        </Link>
      ),
    },
  ];

  return (
    <>
      <DataToolbar
        title="Дисциплины"
        primaryLabel="Новая дисциплина"
        onPrimary={() => setCreating(true)}
        query={q}
        onQueryChange={setQ}
        queryPlaceholder="Поиск по названию или описанию…"
        isFetching={isFetching}
        archived={archived}
        onArchivedChange={setArchived}
        hint={filtered ? <>Найдено: <span className="font-mono">{filtered.length}</span> из <span className="font-mono">{data?.length ?? 0}</span></> : null}
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <RangeFilter
              label="Часов"
              min={1}
              max={2000}
              value={{ min: minHours, max: maxHours }}
              onChange={(v) => setRange("hours", v)}
            />
            <RangeFilter
              label="Вопросов"
              min={1}
              max={2000}
              value={{ min: minQuestions, max: maxQuestions }}
              onChange={(v) => setRange("q", v)}
            />
            <RangeFilter
              label="Минут"
              min={1}
              max={240}
              value={{ min: minMinutes, max: maxMinutes }}
              onChange={(v) => setRange("minutes", v)}
            />
          </div>
        }
      />

      {isError && (
        <EmptyState title="Не удалось загрузить" description={errorMessage(error)} />
      )}
      {isLoading && (
        <Card><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full" /></Card>
      )}
      {!isLoading && !isError && (
        <DataTable
          rows={sorted}
          columns={columns}
          rowKey={(r) => r.discipline_id}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={handleSort}
          loading={isLoading}
          rowActions={(r) => (
            <RowMenu
              row={r}
              archived={archived}
              onEdit={() => setEditing(r)}
              onArchive={() => setArchiveId(r.discipline_id)}
              onRestore={() => restore.mutate(r.discipline_id)}
            />
          )}
          emptyState={
            <EmptyState
              title={q ? `По запросу «${q}» ничего не нашли` : "Пока нет дисциплин"}
              description="Создайте первую или измените фильтры."
            />
          }
        />
      )}

      {(creating || editing) && (
        <DisciplineDrawer
          open
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSubmit={async (values) => {
            try {
              if (editing) {
                await patch.mutateAsync({ id: editing.discipline_id, payload: values });
              } else {
                await create.mutateAsync(values);
              }
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
        title="Архивировать дисциплину?"
        description="Дисциплина будет скрыта из списков. Вопросы и попытки студентов сохранятся. В течение 5 секунд после архивации её можно восстановить из всплывающего уведомления."
        confirmLabel="Архивировать"
        onConfirm={async () => {
          if (archiveId != null) {
            const id = archiveId;
            const saved = data?.find((d) => d.discipline_id === id) ?? null;
            setArchiveId(null);
            try {
              await archive.mutateAsync(id);
              pushToast("success", `Дисциплина «${saved?.name ?? ""}» архивирована`, 5000, {
                label: "Отменить",
                title: "Восстановить дисциплину",
                onClick: async () => {
                  if (saved) {
                    await restore.mutateAsync(id);
                  }
                },
              });
            } catch (e) {
              pushToast("error", errorMessage(e));
            }
          } else {
            setArchiveId(null);
          }
        }}
      />
    </>
  );
}

function filterRanges(
  rows: DisciplineOut[] | undefined,
  filters: { hours?: { min?: number; max?: number }; minutes?: { min?: number; max?: number }; questions?: { min?: number; max?: number } },
): DisciplineOut[] | undefined {
  if (!rows) return rows;
  return rows.filter((r) => {
    if (filters.hours?.min !== undefined && (r.total_hours ?? 0) < filters.hours.min) return false;
    if (filters.hours?.max !== undefined && (r.total_hours ?? Infinity) > filters.hours.max) return false;
    if (filters.minutes?.min !== undefined && r.time_limit_minutes < filters.minutes.min) return false;
    if (filters.minutes?.max !== undefined && r.time_limit_minutes > filters.minutes.max) return false;
    if (filters.questions?.min !== undefined && r.question_count < filters.questions.min) return false;
    if (filters.questions?.max !== undefined && r.question_count > filters.questions.max) return false;
    return true;
  });
}

function sortLocally(rows: DisciplineOut[] | undefined, key: string, dir: "asc" | "desc" | null) {
  if (!rows) return [];
  if (!key || !dir) return rows;
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
  onEdit,
  onArchive,
  onRestore,
}: {
  row: DisciplineOut;
  archived: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
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
              onClick={() => { setOpen(false); onEdit(); }}
              className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)]"
            >
              <Pencil className="w-3.5 h-3.5" /> Изменить
            </button>
          )}
          {!archived && (
            <Link
              role="menuitem"
              to={`/teacher/policy/${row.discipline_id}`}
              className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)] text-[var(--color-text-primary)]"
            >
              <Settings className="w-3.5 h-3.5" /> Настройки & Прокторинг
            </Link>
          )}
          {!archived ? (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onArchive(); }}
              className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)] text-[var(--color-danger)]"
            >
              <Archive className="w-3.5 h-3.5" /> Архивировать
            </button>
          ) : (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onRestore(); }}
              className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)]"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Восстановить
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface DrawerFormProps {
  open: boolean;
  initial: DisciplineOut | null;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    description?: string | null;
    total_hours?: number | null;
    credits?: number | null;
    question_count: number;
    time_limit_minutes: number;
  }) => Promise<void>;
  submitting: boolean;
}

function DisciplineDrawer({ initial, onClose, onSubmit, submitting }: DrawerFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [totalHours, setTotalHours] = useState(initial?.total_hours?.toString() ?? "");
  const [credits, setCredits] = useState(initial?.credits?.toString() ?? "");
  const [questions, setQuestions] = useState(String(initial?.question_count ?? 10));
  const [minutes, setMinutes] = useState(String(initial?.time_limit_minutes ?? 20));
  const [err, setErr] = useState<string | null>(null);

  return (
    <Drawer
      open
      onClose={onClose}
      title={initial ? `Изменить дисциплину` : "Новая дисциплина"}
      description={initial ? initial.name : "Создание новой дисциплины"}
      footer={
        <div className="flex justify-end gap-2 w-full">
          {initial && (
            <Link
              to={`/teacher/policy/${initial.discipline_id}`}
              className="btn btn-secondary mr-auto flex items-center gap-1.5 text-sm"
            >
              <Settings className="w-4 h-4" /> Настройки & Прокторинг
            </Link>
          )}
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Отмена</Button>
          <Button
            variant="primary"
            onClick={async () => {
              setErr(null);
              const q = Number(questions);
              const m = Number(minutes);
              const th = totalHours.trim() === "" ? null : Number(totalHours);
              const cr = credits.trim() === "" ? null : Number(credits);
              if (!name.trim()) return setErr("Укажите название");
              if (th !== null && (!Number.isFinite(th) || th < 1 || th > 2000)) return setErr("Часов всего: 1..2000");
              if (cr !== null && (!Number.isFinite(cr) || cr < 1 || cr > 60)) return setErr("Часов в неделю: 1..60");
              if (!Number.isFinite(q) || q < 1 || q > 2000) return setErr("Вопросов: 1..2000");
              if (!Number.isFinite(m) || m < 1 || m > 240) return setErr("Лимит минут: 1..240");
              await onSubmit({
                name: name.trim(),
                description: description.trim() || null,
                total_hours: th,
                credits: cr,
                question_count: q,
                time_limit_minutes: m,
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
        {initial && (
          <div className="p-3 bg-[var(--color-bg-muted)] rounded-lg border border-[var(--color-border)] flex items-center justify-between text-xs gap-3">
            <div className="space-y-0.5">
              <span className="font-semibold block text-[var(--color-text-primary)]">Параметры теста и прокторинга</span>
              <span className="text-[var(--color-text-muted)]">Расписание, попытки и уровень прокторинга настраиваются отдельно.</span>
            </div>
            <Link
              to={`/teacher/policy/${initial.discipline_id}`}
              className="btn btn-secondary btn-sm shrink-0 flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Перейти</span>
            </Link>
          </div>
        )}
        <Field label="Название" required error={name === "" && err ? err : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} autoFocus />
        </Field>
        <Field label="Описание">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={4}
            className="input min-h-[5rem] py-2 leading-relaxed"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Часов всего"
            hint="обязательно для отчётов"
            error={
              totalHours.trim() !== "" && err && err.startsWith("Часов всего") ? err : undefined
            }
          >
            <Input
              type="number"
              inputMode="numeric"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
              min={1}
              max={2000}
              placeholder="например 72"
            />
          </Field>
          <Field
            label="Часов в неделю"
            hint="необязательно"
            error={
              credits.trim() !== "" && err && err.startsWith("Часов в неделю") ? err : undefined
            }
          >
            <Input
              type="number"
              inputMode="numeric"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              min={1}
              max={60}
              placeholder="опционально"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Вопросов" hint="1..2000">
            <Input type="number" inputMode="numeric" value={questions} onChange={(e) => setQuestions(e.target.value)} min={1} max={2000} />
          </Field>
          <Field label="Лимит мин." hint="1..240">
            <Input type="number" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} min={1} max={240} />
          </Field>
        </div>
        {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
      </div>
    </Drawer>
  );
}
