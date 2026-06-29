import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Tags, MoreHorizontal, Pencil, Archive, RotateCcw } from "lucide-react";
import {
  TagOut,
  useCreateTag,
  useDeleteTag,
  usePatchTag,
  useRestoreTag,
  useTags,
} from "../../api/tags-crud";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { DataToolbar } from "../../components/DataToolbar";
import { Drawer } from "../../components/Drawer";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useToasts } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";
import { errorMessage } from "../../api/client";

/**
 * Полноценный CRUD тегов. Теги — это метки, которые преподаватели вешают на вопросы,
 * чтобы фильтровать банк по тематике / сложности / происхождению.
 */
export default function ReferenceTags() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const archived = params.get("archived") === "1";

  const { data, isLoading, isFetching, isError, error } = useTags(q, archived);
  const pushToast = useToasts((s) => s.push);
  const create = useCreateTag();
  const patch = usePatchTag();
  const del = useDeleteTag();
  const restore = useRestoreTag();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TagOut | null>(null);
  const [deleteId, setDeleteId] = useState<TagOut | null>(null);

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

  const columns: DataTableColumn<TagOut>[] = [
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
          <span className="inline-flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-[var(--color-bg-muted)] text-[var(--color-accent)] text-xs font-mono">#{r.name}</span>
          </span>
        </button>
      ),
    },
    {
      key: "question_count",
      header: "Вопросов",
      align: "right",
      sortable: true,
      sortValue: (r) => r.question_count,
      cell: (r) => <span className="text-xs tabular-nums">{r.question_count}</span>,
    },
  ];

  const sorted = sortLocally(data, params.get("sort"));

  return (
    <>
      <DataToolbar
        title="Теги"
        primaryLabel="Новый тег"
        onPrimary={() => setCreating(true)}
        query={q}
        onQueryChange={setQ}
        queryPlaceholder="Поиск по названию тега…"
        isFetching={isFetching}
        archived={archived}
        onArchivedChange={setArchived}
        hint={data ? <>Найдено: <span className="font-mono">{data.length}</span></> : null}
      />

      {isError && <EmptyState title="Не удалось загрузить" description={errorMessage(error)} />}
      {isLoading && (
        <Card><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full" /></Card>
      )}
      {!isLoading && !isError && (
        <DataTable
          rows={sorted}
          columns={columns}
          rowKey={(r) => r.tag_id}
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
              onEdit={() => setEditing(r)}
              onDelete={() => setDeleteId(r)}
              onRestore={() => restore.mutate(r.tag_id)}
            />
          )}
          emptyState={
            <EmptyState
              icon={<Tags className="w-8 h-8" />}
              title={q ? `По запросу «${q}» ничего не нашли` : "Пока нет тегов"}
              description="Создайте первый тег — например «sql», «theory», «practice»."
            />
          }
        />
      )}

      {(creating || editing) && (
        <TagDrawer
          open
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSubmit={async (name) => {
            try {
              if (editing) {
                await patch.mutateAsync({ id: editing.tag_id, name });
              } else {
                await create.mutateAsync({ name });
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
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title={`Удалить тег «${deleteId?.name ?? ""}»?`}
        description={
          deleteId && deleteId.question_count > 0
            ? `Тег используется в ${deleteId.question_count} вопросе(-ах). После удаления они перестанут фильтроваться по этому тегу. В течение 5 секунд удаление можно отменить.`
            : "Тег не используется — удаление безопасно. В течение 5 секунд его можно восстановить."
        }
        confirmLabel="Удалить"
        onConfirm={async () => {
          const target = deleteId;
          setDeleteId(null);
          if (!target) return;
          try {
            await del.mutateAsync(target.tag_id);
            pushToast("success", `Тег «${target.name}» удалён`, 5000, {
              label: "Отменить",
              title: "Восстановить тег",
              onClick: async () => {
                await restore.mutateAsync(target.tag_id);
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

function sortLocally(rows: TagOut[] | undefined, rawSort: string | null) {
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

function RowMenu({ row, archived, onEdit, onRestore, onDelete }: { row: TagOut; archived?: boolean; onEdit: () => void; onRestore?: () => void; onDelete: () => void }) {
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
          className="absolute right-0 mt-1 min-w-[160px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-md p-1 z-20"
        >
          {!archived && (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onEdit(); }}
              className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)]"
            >
              <Pencil className="w-3.5 h-3.5" /> Переименовать
            </button>
          )}
          {archived && onRestore && (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onRestore(); }}
              className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)]"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Восстановить
            </button>
          )}
          {!archived && (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onDelete(); }}
              className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)] text-[var(--color-danger)]"
            >
              <Archive className="w-3.5 h-3.5" /> Удалить
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  initial: TagOut | null;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  submitting: boolean;
}

function TagDrawer({ initial, onClose, onSubmit, submitting }: DrawerProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Drawer
      open
      onClose={onClose}
      title={initial ? "Переименовать тег" : "Новый тег"}
      description={initial ? `Сейчас: ${initial.name}` : "Лаконичное имя без пробелов и спецсимволов"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Отмена</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const v = name.trim().toLowerCase().replace(/\s+/g, "-");
              if (!v) return setErr("Введите название");
              if (!/^[a-z0-9._-]{1,64}$/.test(v)) return setErr("только латиница/цифры/._-");
              await onSubmit(v);
            }}
            loading={submitting}
          >
            {initial ? "Сохранить" : "Создать"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Название" required hint="латиница/цифры/._- ; до 64 символов">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            placeholder="sql"
            autoFocus
            maxLength={64}
            className="font-mono"
          />
        </Field>
        <p className="text-xs text-[var(--color-text-muted)]">
          Теги используются для фильтрации банка вопросов. Со временем они накапливаются —
          периодически удаляйте неиспользуемые.
        </p>
        {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
      </div>
    </Drawer>
  );
}
