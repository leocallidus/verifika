import { useState, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  MoreHorizontal,
  MoveRight,
  Users,
  UserPlus,
  UserMinus,
  Search,
  FileSpreadsheet,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Field, Input } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../api/client";
import { useToasts } from "../../components/ui/Toast";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import {
  GroupOut,
  StudentOut,
  useAvailableStudentsToEnroll,
  useEnrollBulk,
  useGroups,
  usePatchStudent,
  useStudents,
  useUnassignBulk,
} from "../../api/teacher-crud";
import { cn } from "../../lib/cn";
import { formatGrade } from "../../utils/grade";


interface GroupDetailOut {
  group_id: number;
  name: string;
  admission_year: number;
  student_count: number;
}

export default function ReferenceGroupDetail() {
  const { groupId } = useParams();
  const id = Number(groupId);
  const navigate = useNavigate();

  const group = useQuery({
    queryKey: ["reference", "group", id],
    queryFn: () => api.get<GroupDetailOut>(`/api/v2/teacher/reference/groups/${id}`).then((r) => r.data),
    enabled: Number.isFinite(id) && id > 0,
  });

  const [transferOpen, setTransferOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [removeIds, setRemoveIds] = useState<number[]>([]);
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <AppShell
      rightSlot={
        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => navigate("/teacher/reference/groups")}
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> К группам
          </button>
        </div>
      }
    >
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <button
            type="button"
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] inline-flex items-center gap-1.5"
            onClick={() => navigate("/teacher/reference/groups")}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> К группам
          </button>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2">
            Группа {group.data?.name ?? "…"}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {group.data ? `Год поступления: ${group.data.admission_year} · студентов: ${group.data.student_count}` : "Загрузка…"}
          </p>
        </header>

        {group.data && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button
              variant="primary"
              size="sm"
              iconLeft={<UserPlus className="w-3.5 h-3.5" />}
              onClick={() => setAddOpen(true)}
            >
              Зачислить студентов
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<FileSpreadsheet className="w-3.5 h-3.5" />}
              onClick={() => navigate(`/teacher/groups/${id}/gradebook`)}
            >
              Журнал оценок
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<UserMinus className="w-3.5 h-3.5" />}
              onClick={() => setRemoveOpen(true)}
              disabled={selectedIds.length === 0}
            >
              Снять с группы ({selectedIds.length})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<MoveRight className="w-3.5 h-3.5" />}
              onClick={() => setTransferOpen(true)}
            >
              Перевести всех в другую…
            </Button>
          </div>
        )}

        {group.isLoading && <Card><Skeleton className="h-10 w-full" /></Card>}
        {group.error && (
          <EmptyState title="Не удалось загрузить" description={errorMessage(group.error)} />
        )}
        {group.data && (
          <GroupStudentsTable
            groupId={group.data.group_id}
            groupName={group.data.name}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        )}

        {group.data && addOpen && (
          <EnrollDialog
            groupId={group.data.group_id}
            groupName={group.data.name}
            open
            onClose={() => setAddOpen(false)}
          />
        )}

        {group.data && removeOpen && selectedIds.length > 0 && (
          <UnassignDialog
            groupId={group.data.group_id}
            groupName={group.data.name}
            count={selectedIds.length}
            open
            onClose={() => setRemoveOpen(false)}
            ids={selectedIds}
            onDone={() => { setSelectedIds([]); setRemoveOpen(false); }}
          />
        )}

        {group.data && transferOpen && (
          <TransferAllDialog
            groupId={group.data.group_id}
            groupName={group.data.name}
            open
            onClose={() => setTransferOpen(false)}
          />
        )}
      </section>
    </AppShell>
  );
}

interface GroupStudentsTableProps {
  groupId: number;
  groupName: string;
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
}

function GroupStudentsTable({ groupId, groupName, selectedIds, onSelectionChange }: GroupStudentsTableProps) {
  const patch = usePatchStudent();
  const { data: studentsLists } = useStudents({ group_id: groupId });
  const [moveOpen, setMoveOpen] = useState<StudentOut | null>(null);
  const [gradeScale, setGradeScale] = useState<"5_point" | "10_point" | "percent">("5_point");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const rows = studentsLists ?? [];

  const all = rows.length;
  const allSelected = all > 0 && selectedIds.length === all;

  function toggleAll() {
    onSelectionChange(allSelected ? [] : rows.map((r) => r.student_id));
  }

  function toggle(id: number) {
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  }

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    if (!sortKey || !sortDir) return rows;
    const sorted = [...rows].sort((a, b) => {
      let av: any = (a as unknown as Record<string, unknown>)[sortKey];
      let bv: any = (b as unknown as Record<string, unknown>)[sortKey];

      if (sortKey === "full_name") {
        av = a.last_name + " " + a.first_name;
        bv = b.last_name + " " + b.first_name;
      }

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), "ru");
    });
    return sortDir === "desc" ? sorted.reverse() : sorted;
  }, [rows, sortKey, sortDir]);

  const columns: DataTableColumn<StudentOut>[] = [
    {
      key: "_select",
      header: (
        <input
          type="checkbox"
          aria-label="Выбрать всех"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = selectedIds.length > 0 && !allSelected; }}
          onChange={toggleAll}
          className="w-4 h-4 align-middle"
        />
      ),
      align: "center",
      cell: (r) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(r.student_id)}
          aria-label={`Выбрать ${r.full_name}`}
          onChange={() => toggle(r.student_id)}
          className="w-4 h-4 align-middle"
        />
      ),
    },
    {
      key: "full_name",
      header: "ФИО",
      sortable: true,
      cell: (r) => (
        <button
          className="text-left font-medium hover:text-[var(--color-accent)]"
          onClick={() => { window.location.href = `/teacher/reference/students/${r.student_id}`; }}
        >
          {r.full_name}
        </button>
      ),
    },
    { key: "email", header: "Email", sortable: true, cell: (r) => <span className="text-xs text-[var(--color-text-muted)]">{r.email}</span> },
    { key: "login", header: "Логин", sortable: true, cell: (r) => <span className="text-xs font-mono">{r.login}</span> },
    {
      key: "sessions_count",
      header: "Попыток",
      align: "right",
      sortable: true,
      cell: (r) => <span className="text-xs tabular-nums">{r.sessions_count}</span>,
    },
    {
      key: "average_score",
      header: gradeScale === "percent" ? "Средний %" : "Средний балл",
      align: "right",
      sortable: true,
      cell: (r) => <span className="text-xs tabular-nums">{r.average_score != null ? formatGrade(r.average_score, gradeScale).value : "—"}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">Система оценок:</span>
          <select
            value={gradeScale}
            onChange={(e) => setGradeScale(e.target.value as any)}
            className="input pr-8 py-1 text-xs appearance-none bg-no-repeat bg-[right_0.5rem_center] w-48"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717a'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              backgroundSize: "1rem",
            }}
          >
            <option value="5_point">Пятибалльная (1-5)</option>
            <option value="10_point">Десятибалльная (1-10)</option>
            <option value="percent">Проценты (%)</option>
          </select>
        </div>
      </div>
      <DataTable
        rows={sortedRows}
        columns={columns}
        rowKey={(r) => r.student_id}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
        }}
        loading={false}
        rowActions={(r) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<MoveRight className="w-3.5 h-3.5" />}
              onClick={() => setMoveOpen(r)}
            >
              Перевести
            </Button>
          </div>
        )}
        emptyState={
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title={`В группе «${groupName}» пока нет студентов`}
            description="Зачислите студентов кнопкой «Зачислить студентов» выше."
          />
        }
      />
      {moveOpen && (
        <Modal open onClose={() => setMoveOpen(null)} title={`Перевести студента «${moveOpen.full_name}»`}>
          <MoveStudentForm
            studentId={moveOpen.student_id}
            currentGroupId={groupId}
            currentGroupName={groupName}
            onClose={() => setMoveOpen(null)}
            onSubmit={async (newGroupId) => {
              await patch.mutateAsync({ id: moveOpen.student_id, payload: { group_id: newGroupId } });
              setMoveOpen(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function MoveStudentForm({
  studentId,
  currentGroupId,
  currentGroupName,
  onSubmit,
  onClose,
}: {
  studentId: number;
  currentGroupId: number;
  currentGroupName: string;
  onSubmit: (groupId: number) => Promise<void>;
  onClose: () => void;
}) {
  void studentId;
  const allGroups = useQuery({
    queryKey: ["reference", "groups-for-pick"],
    queryFn: () => api.get<GroupOut[]>("/api/v2/teacher/reference/groups", { params: { q: "" } }).then((r) => r.data),
  });
  const [targetId, setTargetId] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const items = (allGroups.data ?? []).filter((g) => g.group_id !== currentGroupId);

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-text-muted)]">Из группы: <span className="font-medium text-[var(--color-text-primary)]">{currentGroupName}</span></p>
      <Field label="Новая группа" required hint="Все данные и сессии сохраняются">
        <select
          className="input pr-8 appearance-none"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          <option value="">— выберите группу —</option>
          {items.map((g) => (
            <option key={g.group_id} value={g.group_id}>
              {g.name} ({g.admission_year})
            </option>
          ))}
        </select>
      </Field>
      {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button
          variant="primary"
          onClick={async () => {
            setErr(null);
            const v = Number(targetId);
            if (!Number.isFinite(v) || v <= 0) return setErr("Выберите группу");
            try {
              await onSubmit(v);
            } catch (e) {
              setErr(errorMessage(e));
            }
          }}
        >
          Перевести
        </Button>
      </div>
    </div>
  );
}

function EnrollDialog({
  groupId,
  groupName,
  open,
  onClose,
}: {
  groupId: number;
  groupName: string;
  open: boolean;
  onClose: () => void;
}) {
  const enroll = useEnrollBulk(groupId);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const candidates = useAvailableStudentsToEnroll(groupId, query);
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);

  // Reset selected on close.
  if (!open && picked.size > 0) {
    /* render-only reset below */
  }

  function togglePick(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function enrollPicked() {
    if (picked.size === 0) return;
    try {
      const res = await enroll.mutateAsync({ student_ids: Array.from(picked) });
      pushToast("success", `Зачислено: ${res.enrolled}`);
      setPicked(new Set());
      setQuery("");
      // Force refetch
      queryClient.invalidateQueries({ queryKey: ["reference", "available-students", groupId] });
      onClose();
    } catch (e) {
      pushToast("error", errorMessage(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Зачислить в «${groupName}»`} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          Выберите студентов, которые сейчас без группы либо в другой группе. Поиск поддерживает ФИО, email или логин.
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск студентов…"
            className="input pl-8"
          />
        </div>
        <div className="border border-[var(--color-border)] rounded-md max-h-[50vh] overflow-y-auto">
          {candidates.isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : (candidates.data ?? []).length === 0 ? (
            <EmptyState
              title="Нет подходящих студентов"
              description={query ? "По вашему запросу никого не нашли" : "Все активные студенты уже распределены по группам"}
            />
          ) : (
            <ul>
              {(candidates.data ?? []).map((r) => {
                const pickedHere = picked.has(r.student_id);
                return (
                  <li
                    key={r.student_id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 border-b border-[var(--color-border)] last:border-b-0 cursor-pointer hover:bg-[var(--color-bg-muted)]",
                      pickedHere && "bg-[var(--color-accent)]/5",
                    )}
                    onClick={() => togglePick(r.student_id)}
                  >
                    <input
                      type="checkbox"
                      checked={pickedHere}
                      readOnly
                      className="w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.full_name}</div>
                      <div className="text-xs text-[var(--color-text-muted)] truncate">
                        {r.email} · логин <span className="font-mono">{r.login}</span>
                        {r.group_name && <> · сейчас в «{r.group_name}»</>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--color-border)]">
          <span className="text-xs text-[var(--color-text-muted)]">
            Выбрано: <span className="font-mono">{picked.size}</span>
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Отмена</Button>
            <Button 
              variant="primary" 
              onClick={enrollPicked} 
              disabled={picked.size === 0}
              loading={enroll.isPending}
            >
              Зачислить {picked.size > 0 ? `(${picked.size})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function UnassignDialog({
  groupId,
  groupName,
  count,
  open,
  onClose,
  onDone,
  ids,
}: {
  groupId: number;
  groupName: string;
  count: number;
  open: boolean;
  onClose: () => void;
  ids: number[];
  onDone: () => void;
}) {
  const un = useUnassignBulk(groupId);
  const [err, setErr] = useState<string | null>(null);
  async function doIt() {
    try {
      await un.mutateAsync({ student_ids: ids });
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Снять ${count} студентов с группы «${groupName}»?`}>
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-text-muted)]">
          Студенты будут помечены как «без группы» и появятся в общем списке.
          Их сессии и результаты сохранятся.
        </p>
        {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={un.isPending}>Отмена</Button>
          <Button variant="danger" onClick={doIt} loading={un.isPending}>Снять с группы</Button>
        </div>
      </div>
    </Modal>
  );
}

function TransferAllDialog({
  groupId,
  groupName,
  open,
  onClose,
}: {
  groupId: number;
  groupName: string;
  open: boolean;
  onClose: () => void;
}) {
  const target = useGroups("", undefined, false);
  const [targetId, setTargetId] = useState("");
  const pushToast = useToasts((s) => s.push);
  const submit = async () => {
    const v = Number(targetId);
    if (!v || v === groupId) return;
    try {
      await api.post(`/api/v2/teacher/reference/groups/${groupId}/transfer-all`, { target_group_id: v });
      pushToast("success", "Все студенты переведены");
      onClose();
    } catch (e) {
      pushToast("error", errorMessage(e));
    }
  };
  const others = (target.data ?? []).filter((g) => g.group_id !== groupId);

  return (
    <Modal open={open} onClose={onClose} title={`Перевести всех из «${groupName}»`}>
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-text-muted)]">
          Все активные студенты будут переведены, их данные и сессии сохранятся.
        </p>
        <Field label="Целевая группа">
          <select className="input pr-8 appearance-none" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">— выберите группу —</option>
            {others.map((g) => (
              <option key={g.group_id} value={g.group_id}>
                {g.name} ({g.admission_year})
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" disabled={!targetId || Number(targetId) === groupId} iconLeft={<MoveRight className="w-3.5 h-3.5" />} onClick={submit}>
            Перевести
          </Button>
        </div>
      </div>
    </Modal>
  );
}
