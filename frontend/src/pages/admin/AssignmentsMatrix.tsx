import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Search, Table2, UserPlus, Users, X } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Field, Input, Select } from "../../components/ui/Field";
import { Modal } from "../../components/ui/Modal";
import { useToasts } from "../../components/ui/Toast";
import { adminApi } from "../../api/admin";
import { errorMessage } from "../../api/client";
import type {
  AdminAssignmentGroupOut,
  AdminAssignmentMatrixRowOut,
  AdminAssignmentStudentOut,
  AdminAssignmentTeacherOut,
  AdminGroupOut,
  AdminUserOut,
} from "../../types/api";

export default function AdminAssignmentsMatrix() {
  const [archived, setArchived] = useState<boolean | "all">(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [displayLimit, setDisplayLimit] = useState(50);
  const [selected, setSelected] = useState<AdminAssignmentMatrixRowOut | null>(null);
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQ(q);
    }, 300);
    return () => clearTimeout(handler);
  }, [q]);

  useEffect(() => {
    setDisplayLimit(50);
  }, [debouncedQ, archived]);

  const matrix = useQuery({
    queryKey: ["admin", "assignments", "matrix", archived, debouncedQ],
    queryFn: () =>
      adminApi.assignmentMatrix({ archived, q: debouncedQ || undefined, limit: 500 }).then((r) => r.data),
  });

  const displayedRows = useMemo(() => {
    if (!matrix.data) return [];
    return matrix.data.rows.slice(0, displayLimit);
  }, [matrix.data, displayLimit]);

  const reload = async () => {
    await qc.invalidateQueries({ queryKey: ["admin", "assignments", "matrix"] });
    await qc.invalidateQueries({ queryKey: ["admin", "disciplines"] });
  };

  async function revokeTeacher(row: AdminAssignmentMatrixRowOut, teacherId: number) {
    try {
      await adminApi.revokeTeacher(row.discipline_id, { teacher_id: teacherId });
      pushToast({ tone: "success", title: "Преподаватель отвязан" });
      await reload();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось отвязать", body: errorMessage(e) });
    }
  }

  async function revokeGroup(row: AdminAssignmentMatrixRowOut, groupId: number) {
    try {
      await adminApi.revokeGroup(row.discipline_id, { group_id: groupId });
      pushToast({ tone: "success", title: "Группа отвязана" });
      await reload();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось отвязать", body: errorMessage(e) });
    }
  }

  async function revokeStudent(row: AdminAssignmentMatrixRowOut, studentId: number) {
    try {
      await adminApi.revokeStudent(row.discipline_id, { student_id: studentId });
      pushToast({ tone: "success", title: "Студент отвязан" });
      await reload();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось отвязать", body: errorMessage(e) });
    }
  }

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Назначения дисциплин
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Матрица преподавателей, групп и индивидуальных доступов студентов.
            </p>
          </div>
        </header>

        <Card>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <Field label="Поиск">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Дисциплина…"
              />
            </Field>
            <Field label="Статус">
              <Select
                value={String(archived)}
                onChange={(e) => setArchived(e.target.value === "all" ? "all" : e.target.value === "true")}
              >
                <option value="false">Активные</option>
                <option value="all">Все</option>
                <option value="true">Архивные</option>
              </Select>
            </Field>
          </div>

          {matrix.isLoading && <Skeleton className="h-32 w-full" />}
          {matrix.isError && (
            <EmptyState title="Не удалось загрузить матрицу" description={errorMessage(matrix.error)} />
          )}
          {matrix.data && matrix.data.rows.length === 0 && (
            <EmptyState icon={<Search />} title="Назначений не найдено" />
          )}
          {matrix.data && matrix.data.rows.length > 0 && (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                  <tr>
                    <th className="py-2 pr-4 min-w-[220px]">Дисциплина</th>
                    <th className="py-2 pr-4 min-w-[220px]">Преподаватели</th>
                    <th className="py-2 pr-4 min-w-[220px]">Группы</th>
                    <th className="py-2 pr-4 min-w-[240px]">Студенты</th>
                    <th className="py-2 pr-4 text-right">Охват</th>
                    <th className="py-2 pr-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => (
                    <tr
                      key={row.discipline_id}
                      className="border-b border-[var(--color-border)]/60 align-top hover:bg-[var(--color-bg-muted)]/50"
                    >
                      <td className="py-3 pr-4">
                        <div className="font-medium">{row.discipline_name}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.archived && <Badge tone="warning">Архив</Badge>}
                          {!row.has_teacher && <Badge tone="danger">Нет преподавателя</Badge>}
                          {!row.has_student_access && <Badge tone="warning">Нет доступа</Badge>}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <ChipList
                          empty="Не назначены"
                          items={row.teachers}
                          render={(teacher) => (
                            <AssignmentChip
                              key={teacher.teacher_id}
                              label={teacher.full_name}
                              details={teacher.department || undefined}
                              onRemove={() => revokeTeacher(row, teacher.teacher_id)}
                            />
                          )}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <ChipList
                          empty="Не назначены"
                          items={row.groups}
                          render={(group) => (
                            <AssignmentChip
                              key={group.group_id}
                              label={group.name}
                              details={`${group.students_count} студ.`}
                              onRemove={() => revokeGroup(row, group.group_id)}
                            />
                          )}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <ChipList
                          empty="Не назначены"
                          items={row.students}
                          render={(student) => (
                            <AssignmentChip
                              key={student.student_id}
                              label={student.full_name}
                              details={student.group_name || undefined}
                              onRemove={() => revokeStudent(row, student.student_id)}
                            />
                          )}
                        />
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <Badge tone={row.effective_students_count > 0 ? "success" : "warning"}>
                          {row.effective_students_count} студ.
                        </Badge>
                      </td>
                      <td className="py-3 pr-2 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          iconLeft={<Link2 className="h-3.5 w-3.5" />}
                          onClick={() => setSelected(row)}
                          disabled={row.archived}
                        >
                          Назначить
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {matrix.data && matrix.data.rows.length > displayLimit && (
            <div className="mt-4 flex justify-center border-t border-[var(--color-border)] pt-4">
              <Button variant="secondary" onClick={() => setDisplayLimit((prev) => prev + 50)}>
                Показать еще ({matrix.data.rows.length - displayLimit} осталось)
              </Button>
            </div>
          )}
        </Card>

        {selected && (
          <AssignModal
            row={selected}
            onClose={() => setSelected(null)}
            onDone={async () => {
              setSelected(null);
              await reload();
            }}
          />
        )}
      </section>
    </AppShell>
  );
}

function ChipList<T>({
  empty,
  items,
  render,
}: {
  empty: string;
  items: T[];
  render: (item: T) => JSX.Element;
}) {
  if (items.length === 0) {
    return <span className="text-xs text-[var(--color-text-muted)]">{empty}</span>;
  }
  return (
    <div className="flex max-w-[320px] max-h-24 overflow-y-auto pr-1 flex-wrap gap-1.5 scrollbar-thin">
      {items.map(render)}
    </div>
  );
}

function AssignmentChip({
  label,
  details,
  onRemove,
}: {
  label: string;
  details?: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1">
      <span className="min-w-0 truncate">
        <span className="font-medium">{label}</span>
        {details && <span className="text-[var(--color-text-muted)]"> · {details}</span>}
      </span>
      <button
        type="button"
        className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
        aria-label={`Отвязать ${label}`}
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function AssignModal({
  row,
  onClose,
  onDone,
}: {
  row: AdminAssignmentMatrixRowOut;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [teacherId, setTeacherId] = useState<number | "">("");
  const [groupId, setGroupId] = useState<number | "">("");
  const [studentId, setStudentId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const pushToast = useToasts((s) => s.push);

  const teachers = useQuery({
    queryKey: ["admin", "users", "teachers-for-assignment-matrix"],
    queryFn: () => adminApi.listUsers({ role: "teacher", archived: false, page_size: 500 }).then((r) => r.data),
  });
  const groups = useQuery({
    queryKey: ["admin", "groups", "active-for-assignment-matrix"],
    queryFn: () => adminApi.listGroups({ archived: false }).then((r) => r.data),
  });
  const students = useQuery({
    queryKey: ["admin", "users", "students-for-assignment-matrix"],
    queryFn: () => adminApi.listUsers({ role: "student", archived: false, page_size: 500 }).then((r) => r.data),
  });

  const assignedTeacherIds = useMemo(
    () => new Set(row.teachers.map((teacher) => teacher.teacher_id)),
    [row.teachers],
  );
  const assignedGroupIds = useMemo(
    () => new Set(row.groups.map((group) => group.group_id)),
    [row.groups],
  );
  const assignedStudentIds = useMemo(
    () => new Set(row.students.map((student) => student.student_id)),
    [row.students],
  );

  const teacherOptions: AdminUserOut[] = (teachers.data?.items || [])
    .filter((teacher) => !teacher.archived && !assignedTeacherIds.has(teacher.id));
  const groupOptions: AdminGroupOut[] = (groups.data || [])
    .filter((group) => !group.archived && !assignedGroupIds.has(group.group_id));
  const studentOptions: AdminUserOut[] = (students.data?.items || [])
    .filter((student) => !student.archived && !assignedStudentIds.has(student.id));

  async function submit() {
    if (!teacherId && !groupId && !studentId) return;
    setSaving(true);
    try {
      if (teacherId) {
        await adminApi.assignTeacher(row.discipline_id, { teacher_id: Number(teacherId) });
      }
      if (groupId) {
        await adminApi.assignGroup(row.discipline_id, { group_id: Number(groupId) });
      }
      if (studentId) {
        await adminApi.assignStudent(row.discipline_id, { student_id: Number(studentId) });
      }
      pushToast({ tone: "success", title: "Назначения обновлены" });
      await onDone();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось назначить", body: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Назначить: ${row.discipline_name}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!teacherId && !groupId && !studentId}
            onClick={submit}
          >
            Сохранить
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Преподаватель">
          <Select value={String(teacherId)} onChange={(e) => setTeacherId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Не менять</option>
            {teacherOptions.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.full_name} {teacher.department ? `(${teacher.department})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Группа">
          <Select value={String(groupId)} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Не менять</option>
            {groupOptions.map((group) => (
              <option key={group.group_id} value={group.group_id}>
                {group.name} ({group.students_count})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Студент">
          <Select value={String(studentId)} onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Не менять</option>
            {studentOptions.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name} {student.group_name ? `(${student.group_name})` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryBox icon={<UserPlus className="h-4 w-4" />} label="Преподаватели" value={row.teachers.length} />
        <SummaryBox icon={<Users className="h-4 w-4" />} label="Группы" value={row.groups.length} />
        <SummaryBox icon={<Table2 className="h-4 w-4" />} label="Охват студентов" value={row.effective_students_count} />
      </div>
    </Modal>
  );
}

function SummaryBox({ icon, label, value }: { icon: JSX.Element; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
