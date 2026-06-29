import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Archive, RotateCcw, KeyRound, UserCog, Pencil } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Modal } from "../../components/ui/Modal";
import { useToasts } from "../../components/ui/Toast";
import { api, errorMessage, getToken } from "../../api/client";
import { adminApi } from "../../api/admin";
import type {
  AdminUserCreate,
  AdminUserCreateAdmin,
  AdminGroupOut,
  AdminUserOut,
  Role,
} from "../../types/api";

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU") : "—";

export default function AdminUsers() {
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [archived, setArchived] = useState<boolean | "all">("all");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState<"student" | "teacher" | "admin" | null>(null);
  const [showEdit, setShowEdit] = useState<AdminUserOut | null>(null);

  const users = useQuery({
    queryKey: ["admin", "users", roleFilter, archived, q],
    queryFn: () =>
      adminApi
        .listUsers({
          role: roleFilter || undefined,
          archived,
          q: q || undefined,
          page_size: 200,
        })
        .then((r) => r.data),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "events"] });
  };

  async function doArchive(u: AdminUserOut) {
    if (!confirm(`Архивировать пользователя ${u.full_name}?`)) return;
    try {
      await adminApi.archiveUser(u.role, u.id);
      pushToast({ tone: "success", title: "Архивирован", body: u.full_name });
      invalidate();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function doRestore(u: AdminUserOut) {
    try {
      await adminApi.restoreUser(u.role, u.id);
      pushToast({ tone: "success", title: "Восстановлен", body: u.full_name });
      invalidate();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function doResetPassword(u: AdminUserOut) {
    try {
      const r = await adminApi.resetPassword(u.role, u.id);
      navigator.clipboard?.writeText(r.data.new_password);
      pushToast({
        tone: "success",
        title: "Новый пароль",
        body: `Скопирован в буфер: ${r.data.new_password.slice(0, 4)}…`,
      });
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function doChangeRole(u: AdminUserOut, target: Role) {
    if (target === u.role) return;
    let confirmValue: string | undefined;
    if (u.role === "admin" && target !== "admin") {
      const v = prompt(
        `Вы понижаете администратора ${u.full_name}. Для подтверждения введите полный логин (${u.login}) и причину:`,
      );
      if (!v) return;
      const [login, ...rest] = v.split("|");
      const reason = rest.join("|").trim();
      if (login?.trim() !== u.login) {
        pushToast({ tone: "error", title: "Не совпадает логин" });
        return;
      }
      if (!reason) {
        pushToast({ tone: "error", title: "Укажите причину" });
        return;
      }
      confirmValue = login.trim();
      try {
        await adminApi.changeRole(u.role, u.id, {
          role: target,
          confirm: confirmValue,
          reason,
        });
        pushToast({ tone: "success", title: "Смена роли выполнена" });
        invalidate();
      } catch (e) {
        pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
      }
      return;
    }
    try {
      await adminApi.changeRole(u.role, u.id, { role: target });
      pushToast({ tone: "success", title: "Смена роли" });
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
              Пользователи
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Создавайте преподавателей и студентов, меняйте роли, сбрасывайте пароли.
            </p>
            <p className="text-xs text-amber-600 mt-2">
              <b>Внимание</b>: 2FA для администраторов пока не подключена — флаг <code>requires_totp</code> зарезервирован.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              iconLeft={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreate("student")}
            >
              Студент
            </Button>
            <Button
              variant="primary"
              iconLeft={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreate("teacher")}
            >
              Преподаватель
            </Button>
            <Button
              variant="secondary"
              iconLeft={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreate("admin")}
              title="Создать ещё одного администратора"
            >
              Админ
            </Button>
          </div>
        </header>

        <Card>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <Field label="Поиск">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Логин, email или имя…"
                  className="pl-8"
                />
              </div>
            </Field>
            <Field label="Роль">
              <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | Role)}>
                <option value="">Все</option>
                <option value="student">Студенты</option>
                <option value="teacher">Преподаватели</option>
                <option value="admin">Админы</option>
              </Select>
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

          {users.isLoading && <Skeleton className="h-32 w-full" />}
          {users.isError && (
            <EmptyState
              title="Не удалось загрузить"
              description={errorMessage(users.error)}
            />
          )}
          {users.data && users.data.items.length === 0 && (
            <EmptyState
              title="Пользователей нет"
              description="Создайте первого через кнопки выше."
            />
          )}
          {users.data && users.data.items.length > 0 && (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <tr>
                    <th className="py-2 pr-4">ФИО / логин</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Роль</th>
                    <th className="py-2 pr-4">Группа / кафедра</th>
                    <th className="py-2 pr-4">2FA</th>
                    <th className="py-2 pr-4">Создан</th>
                    <th className="py-2 pr-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.items.map((u) => (
                    <tr key={`${u.role}-${u.id}`} className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-bg-muted)]/50">
                      <td className="py-2 pr-4">
                        <div className="font-medium">{u.full_name}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">@{u.login}</div>
                      </td>
                      <td className="py-2 pr-4">{u.email}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={u.role === "admin" ? "accent" : u.role === "teacher" ? "info" : "neutral"}>
                          {u.role === "student" ? "Студент" : u.role === "teacher" ? "Преподаватель" : "Админ"}
                        </Badge>
                        {u.archived && (
                          <Badge tone="warning" className="ml-2">Архив</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {u.role === "student"
                          ? u.group_id ? `группа #${u.group_id}` : "—"
                          : u.department || "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {u.requires_totp ? (
                          <Badge tone="success">включена</Badge>
                        ) : (
                          <Badge tone="neutral">в планах</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs">{fmtDate(u.created_at)}</td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center justify-end gap-1">
                          {!u.archived && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                iconLeft={<Pencil className="w-3.5 h-3.5" />}
                                onClick={() => setShowEdit(u)}
                                title="Редактировать"
                              >
                                Изменить
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                iconLeft={<KeyRound className="w-3.5 h-3.5" />}
                                onClick={() => doResetPassword(u)}
                                title="Сбросить пароль"
                              >
                                Пароль
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                iconLeft={<UserCog className="w-3.5 h-3.5" />}
                                onClick={() => pickRole(u, doChangeRole)}
                                title="Сменить роль"
                              >
                                Роль
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                iconLeft={<Archive className="w-3.5 h-3.5" />}
                                onClick={() => doArchive(u)}
                                title="Архивировать"
                              />
                            </>
                          )}
                          {u.archived && (
                            <Button
                              size="sm"
                              variant="ghost"
                              iconLeft={<RotateCcw className="w-3.5 h-3.5" />}
                              onClick={() => doRestore(u)}
                              title="Восстановить"
                            >
                              Восстановить
                            </Button>
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
          <CreateUserModal
            role={showCreate}
            onClose={() => setShowCreate(null)}
            onCreated={() => {
              setShowCreate(null);
              invalidate();
            }}
          />
        )}

        {showEdit && (
          <EditUserModal
            user={showEdit}
            onClose={() => setShowEdit(null)}
            onUpdated={() => {
              setShowEdit(null);
              invalidate();
            }}
          />
        )}
      </section>
    </AppShell>
  );
}

function pickRole(u: AdminUserOut, cb: (u: AdminUserOut, target: Role) => void) {
  const v = prompt(
    `Изменить роль для ${u.full_name}: введите одну из student/teacher/admin`,
  );
  if (!v) return;
  const r = v.trim().toLowerCase();
  if (!["student", "teacher", "admin"].includes(r)) {
    alert("Неверная роль");
    return;
  }
  cb(u, r as Role);
}

function CreateUserModal({
  role,
  onClose,
  onCreated,
}: {
  role: "student" | "teacher" | "admin";
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    login: "",
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    middle_name: "",
    department: "",
    group_id: "" as string | number,
  });
  const [submitting, setSubmitting] = useState(false);
  const pushToast = useToasts((s) => s.push);

  const groups = useQuery({
    queryKey: ["admin", "groups", "all"],
    queryFn: () => adminApi.listGroups().then((r) => r.data),
    enabled: role === "student",
  });

  async function submit() {
    setSubmitting(true);
    try {
      if (role === "student") {
        const payload: AdminUserCreate = {
          role: "student",
          login: form.login,
          email: form.email,
          password: form.password,
          first_name: form.first_name,
          last_name: form.last_name,
          middle_name: form.middle_name || undefined,
          group_id: Number(form.group_id),
        };
        await adminApi.createStudent(payload);
      } else if (role === "teacher") {
        const payload: AdminUserCreate = {
          role: "teacher",
          login: form.login,
          email: form.email,
          password: form.password,
          first_name: form.first_name,
          last_name: form.last_name,
          middle_name: form.middle_name || undefined,
          department: form.department || undefined,
        };
        await adminApi.createTeacher(payload);
      } else {
        const payload: AdminUserCreateAdmin = {
          login: form.login,
          email: form.email,
          password: form.password,
          first_name: form.first_name,
          last_name: form.last_name,
          middle_name: form.middle_name || undefined,
          department: form.department || undefined,
        };
        await adminApi.createAdmin(payload);
      }
      pushToast({
        tone: "success",
        title: "Создан",
        body: `${form.first_name} ${form.last_name}`,
      });
      onCreated();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Создать ${role === "student" ? "студента" : role === "teacher" ? "преподавателя" : "администратора"}`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            Создать
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Логин" required>
          <Input
            value={form.login}
            onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
            placeholder="ivanov"
          />
        </Field>
        <Field label="Email" required>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="ivanov@univ.ru"
          />
        </Field>
        <Field label="Пароль" required hint="Минимум 8 символов; пользователь сможет изменить после первого входа.">
          <Input
            type="text"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Не короче 8 символов"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Фамилия" required>
            <Input
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
            />
          </Field>
          <Field label="Имя" required>
            <Input
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Отчество">
          <Input
            value={form.middle_name}
            onChange={(e) => setForm((f) => ({ ...f, middle_name: e.target.value }))}
          />
        </Field>
        {role === "student" && (
          <Field label="Группа" required>
            <Select
              value={String(form.group_id)}
              onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}
            >
              <option value="">— выберите группу —</option>
              {(groups.data || []).map((g: AdminGroupOut) => (
                <option key={g.group_id} value={g.group_id}>
                  {g.name} ({g.students_count} студ.)
                </option>
              ))}
            </Select>
          </Field>
        )}
        {role !== "student" && (
          <Field label={role === "admin" ? "Подразделение" : "Кафедра"}>
            <Input
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function EditUserModal({
  user,
  onClose,
  onUpdated,
}: {
  user: AdminUserOut;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [form, setForm] = useState({
    login: user.login || "",
    email: user.email || "",
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    middle_name: user.middle_name || "",
    department: user.department || "",
    group_id: (user.group_id !== null && user.group_id !== undefined) ? String(user.group_id) : "",
  });
  const [submitting, setSubmitting] = useState(false);
  const pushToast = useToasts((s) => s.push);

  const groups = useQuery({
    queryKey: ["admin", "groups", "all"],
    queryFn: () => adminApi.listGroups().then((r) => r.data),
    enabled: user.role === "student",
  });

  async function submit() {
    setSubmitting(true);
    try {
      const payload: any = {
        login: form.login,
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        middle_name: form.middle_name || null,
      };
      if (user.role === "student") {
        payload.group_id = form.group_id ? Number(form.group_id) : null;
      } else {
        payload.department = form.department || null;
      }

      await adminApi.patchUser(user.role, user.id, payload);
      pushToast({
        tone: "success",
        title: "Сохранено",
        body: `${form.first_name} ${form.last_name}`,
      });
      onUpdated();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось сохранить", body: errorMessage(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Редактировать ${user.role === "student" ? "студента" : user.role === "teacher" ? "преподавателя" : "администратора"}`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            Сохранить
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Логин" required>
          <Input
            value={form.login}
            onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
            placeholder="ivanov"
          />
        </Field>
        <Field label="Email" required>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="ivanov@univ.ru"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Фамилия" required>
            <Input
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
            />
          </Field>
          <Field label="Имя" required>
            <Input
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Отчество">
          <Input
            value={form.middle_name}
            onChange={(e) => setForm((f) => ({ ...f, middle_name: e.target.value }))}
          />
        </Field>
        {user.role === "student" && (
          <Field label="Группа" required>
            <Select
              value={form.group_id}
              onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}
            >
              <option value="">— выберите группу —</option>
              {(groups.data || []).map((g: AdminGroupOut) => (
                <option key={g.group_id} value={g.group_id}>
                  {g.name} ({g.students_count} студ.)
                </option>
              ))}
            </Select>
          </Field>
        )}
        {user.role !== "student" && (
          <Field label={user.role === "admin" ? "Подразделение" : "Кафедра"}>
            <Input
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}
