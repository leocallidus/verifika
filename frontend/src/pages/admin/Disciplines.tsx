import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Database, Archive, Link2, Unlink, Users, UserPlus, X } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Modal } from "../../components/ui/Modal";
import { useToasts } from "../../components/ui/Toast";
import { errorMessage } from "../../api/client";
import { adminApi } from "../../api/admin";
import type {
  AdminDisciplineOut,
  AdminAssignTeacherIn,
  AdminGroupOut,
  AdminUserOut,
} from "../../types/api";

export default function AdminDisciplines() {
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [archived, setArchived] = useState<boolean | "all">("all");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const disciplines = useQuery({
    queryKey: ["admin", "disciplines", archived, q],
    queryFn: () =>
      adminApi.listDisciplines({ archived, q: q || undefined }).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "disciplines"] });
    qc.invalidateQueries({ queryKey: ["admin", "stats"] });
  };

  async function doArchive(d: AdminDisciplineOut) {
    if (!confirm(`Архивировать дисциплину ${d.name}?`)) return;
    try {
      await adminApi.archiveDiscipline(d.discipline_id);
      pushToast({ tone: "success", title: "Дисциплина архивирована", body: d.name });
      invalidate();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Дисциплины
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Создание, архивирование, преподаватели и доступ студентов.
            </p>
          </div>
          <Button variant="primary" iconLeft={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            Новая дисциплина
          </Button>
        </header>

        <Card>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <Field label="Поиск">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название дисциплины…" />
            </Field>
            <Field label="Статус">
              <Select
                value={String(archived)}
                onChange={(e) => setArchived(e.target.value === "all" ? "all" : e.target.value === "true")}
              >
                <option value="all">Все</option>
                <option value="false">Активные</option>
                <option value="true">Архивные</option>
              </Select>
            </Field>
          </div>

          {disciplines.isLoading && <Skeleton className="h-24 w-full" />}
          {disciplines.isError && (
            <EmptyState title="Не удалось загрузить" description={errorMessage(disciplines.error)} />
          )}
          {disciplines.data && disciplines.data.length === 0 && (
            <EmptyState icon={<Database />} title="Дисциплин нет" />
          )}
          {disciplines.data && disciplines.data.length > 0 && (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <tr>
                    <th className="py-2 pr-4">Название</th>
                    <th className="py-2 pr-4">Преподаватели</th>
                    <th className="py-2 pr-4">Темы / вопросы</th>
                    <th className="py-2 pr-4">Статус</th>
                    <th className="py-2 pr-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {disciplines.data.map((d) => (
                    <tr key={d.discipline_id} className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-bg-muted)]/50">
                      <td className="py-2 pr-4">
                        <div className="font-medium">{d.name}</div>
                        {d.description && (
                          <div className="text-xs text-[var(--color-text-muted)] line-clamp-1">{d.description}</div>
                        )}
                      </td>
                      <td className="py-2 pr-4">{d.teachers_count}</td>
                      <td className="py-2 pr-4">
                        <Badge tone="neutral">{d.topics_count} тем</Badge>{" "}
                        <Badge tone="neutral">{d.questions_count} вопросов</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={d.archived ? "warning" : "neutral"}>
                          {d.archived ? "Архив" : "Активна"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center justify-end gap-1">
                          {!d.archived && (
                            <>
                              <AssignTeacherButton discipline={d} onDone={invalidate} />
                              <ManageAccessButton discipline={d} />
                              <Button
                                size="sm"
                                variant="ghost"
                                iconLeft={<Archive className="w-3.5 h-3.5" />}
                                onClick={() => doArchive(d)}
                              >
                                Архивировать
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {showCreate && (
          <CreateDisciplineModal
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              invalidate();
            }}
          />
        )}
      </section>
    </AppShell>
  );
}

function AssignTeacherButton({
  discipline,
  onDone,
}: {
  discipline: AdminDisciplineOut;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [teacherId, setTeacherId] = useState<number | "">("");
  const pushToast = useToasts((s) => s.push);

  // Reuse listUsers with role=teacher; in real domain we'd query /api/admin/users with role filter.
  const teachers = useQuery({
    queryKey: ["admin", "users", "teacher-or-list"],
    queryFn: () => adminApi.listUsers({ role: "teacher", page_size: 200 }).then((r) => r.data),
    enabled: open,
  });

  async function submit() {
    if (!teacherId) return;
    const payload: AdminAssignTeacherIn = { teacher_id: Number(teacherId) };
    try {
      await adminApi.assignTeacher(discipline.discipline_id, payload);
      pushToast({ tone: "success", title: "Преподаватель назначен" });
      setOpen(false);
      onDone();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        iconLeft={<Link2 className="w-3.5 h-3.5" />}
        onClick={() => setOpen(true)}
      >
        Назначить
      </Button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={`Назначить преподавателя на «${discipline.name}»`}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
              <Button variant="primary" onClick={submit} disabled={!teachers.data || !teacherId}>
                Назначить
              </Button>
            </div>
          }
        >
          <Field label="Преподаватель">
            <Select
              value={String(teacherId)}
              onChange={(e) => setTeacherId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— выберите —</option>
              {(teachers.data?.items || []).filter((u) => !u.archived).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} (@{u.login}, {u.department || "—"})
                </option>
              ))}
            </Select>
          </Field>
          {discipline.teachers_count > 0 && (
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              У дисциплины уже <b>{discipline.teachers_count}</b> преподавателей.{" "}
              <Unlink className="inline w-3 h-3 mr-1" />
              Отвязка — в карточке дисциплины (TODO).
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

function ManageAccessButton({ discipline }: { discipline: AdminDisciplineOut }) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState<number | "">("");
  const [studentId, setStudentId] = useState<number | "">("");
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();

  const assignments = useQuery({
    queryKey: ["admin", "disciplines", discipline.discipline_id, "assignments"],
    queryFn: () => adminApi.disciplineAssignments(discipline.discipline_id).then((r) => r.data),
    enabled: open,
  });
  const groups = useQuery({
    queryKey: ["admin", "groups", "active-for-discipline-access"],
    queryFn: () => adminApi.listGroups({ archived: false }).then((r) => r.data),
    enabled: open,
  });
  const students = useQuery({
    queryKey: ["admin", "users", "students-for-discipline-access"],
    queryFn: () => adminApi.listUsers({ role: "student", page_size: 500 }).then((r) => r.data),
    enabled: open,
  });

  async function refresh() {
    await assignments.refetch();
    await qc.invalidateQueries({ queryKey: ["admin", "disciplines"] });
  }

  async function assignGroup() {
    if (!groupId) return;
    try {
      await adminApi.assignGroup(discipline.discipline_id, { group_id: Number(groupId) });
      pushToast({ tone: "success", title: "Группа назначена" });
      setGroupId("");
      await refresh();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function assignStudent() {
    if (!studentId) return;
    try {
      await adminApi.assignStudent(discipline.discipline_id, { student_id: Number(studentId) });
      pushToast({ tone: "success", title: "Студент назначен" });
      setStudentId("");
      await refresh();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function revoke(targetType: "group" | "student", targetId: number) {
    try {
      if (targetType === "group") {
        await adminApi.revokeGroup(discipline.discipline_id, { group_id: targetId });
      } else {
        await adminApi.revokeStudent(discipline.discipline_id, { student_id: targetId });
      }
      pushToast({ tone: "success", title: "Доступ отозван" });
      await refresh();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  const assignedGroups = new Set(
    (assignments.data || []).filter((a) => a.target_type === "group").map((a) => a.target_id),
  );
  const assignedStudents = new Set(
    (assignments.data || []).filter((a) => a.target_type === "student").map((a) => a.target_id),
  );
  const groupOptions: AdminGroupOut[] = (groups.data || []).filter((g) => !assignedGroups.has(g.group_id));
  const studentOptions: AdminUserOut[] = (students.data?.items || []).filter((s) => !s.archived && !assignedStudents.has(s.id));

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        iconLeft={<Users className="w-3.5 h-3.5" />}
        onClick={() => setOpen(true)}
      >
        Доступ
      </Button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={`Доступ студентов к «${discipline.name}»`}
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Закрыть</Button>
            </div>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" /> Группа
                </div>
                <div className="flex gap-2">
                  <Select
                    value={String(groupId)}
                    onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">— выберите —</option>
                    {groupOptions.map((g) => (
                      <option key={g.group_id} value={g.group_id}>
                        {g.name} ({g.students_count})
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" onClick={assignGroup} disabled={!groupId}>
                    Назначить
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <UserPlus className="h-4 w-4" /> Студент
                </div>
                <div className="flex gap-2">
                  <Select
                    value={String(studentId)}
                    onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">— выберите —</option>
                    {studentOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} {s.group_name ? `(${s.group_name})` : ""}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" onClick={assignStudent} disabled={!studentId}>
                    Назначить
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Текущие назначения</div>
              {assignments.isLoading && <Skeleton className="h-16 w-full" />}
              {assignments.data && assignments.data.length === 0 && (
                <EmptyState title="Назначений нет" description="Студенты не увидят эту дисциплину, пока она не назначена группе или студенту." />
              )}
              {assignments.data && assignments.data.length > 0 && (
                <div className="space-y-2">
                  {assignments.data.map((a) => (
                    <div
                      key={`${a.target_type}-${a.target_id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2"
                    >
                      <div>
                        <Badge tone={a.target_type === "group" ? "neutral" : "info"}>
                          {a.target_type === "group" ? "Группа" : "Студент"}
                        </Badge>{" "}
                        <span className="font-medium">{a.target_name}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconLeft={<X className="h-3.5 w-3.5" />}
                        onClick={() => revoke(a.target_type, a.target_id)}
                      >
                        Отозвать
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function CreateDisciplineModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const [form, setForm] = useState({
    name: "",
    description: "",
    credits: "",
    total_hours: "",
  });

  async function submit() {
    try {
      await adminApi.createDiscipline({
        name: form.name,
        description: form.description || null,
        credits: form.credits ? Number(form.credits) : null,
        total_hours: form.total_hours ? Number(form.total_hours) : null,
      });
      pushToast({ tone: "success", title: "Дисциплина создана" });
      onCreated();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Новая дисциплина"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={submit}>Создать</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Название" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Описание">
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Кредиты">
            <Input
              type="number"
              value={form.credits}
              onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
            />
          </Field>
          <Field label="Часы">
            <Input
              type="number"
              value={form.total_hours}
              onChange={(e) => setForm((f) => ({ ...f, total_hours: e.target.value }))}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
