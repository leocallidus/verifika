import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users as UsersIcon, Archive, ArrowRightLeft } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Modal } from "../../components/ui/Modal";
import { useToasts } from "../../components/ui/Toast";
import { errorMessage } from "../../api/client";
import { adminApi } from "../../api/admin";
import type { AdminGroupOut } from "../../types/api";

export default function AdminGroups() {
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [archived, setArchived] = useState<boolean | "all">("all");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [transferSrc, setTransferSrc] = useState<AdminGroupOut | null>(null);

  const groups = useQuery({
    queryKey: ["admin", "groups", archived, q],
    queryFn: () =>
      adminApi.listGroups({ archived, q: q || undefined }).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "groups"] });
    qc.invalidateQueries({ queryKey: ["admin", "stats"] });
  };

  async function doArchive(g: AdminGroupOut) {
    if (!confirm(`Архивировать группу ${g.name}?`)) return;
    try {
      await adminApi.archiveGroup(g.group_id);
      pushToast({ tone: "success", title: "Группа архивирована", body: g.name });
      invalidate();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function doBulkTransfer(target: number) {
    if (!transferSrc) return;
    try {
      const r = await adminApi.bulkTransfer(transferSrc.group_id, target);
      pushToast({
        tone: "success",
        title: "Переведено",
        body: `Из «${transferSrc.name}» переведено ${(r.data as { moved: number })?.moved ?? 0} студентов.`,
      });
      setTransferSrc(null);
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
              Группы
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Архивирование и bulk-transfer студентов между группами.
            </p>
          </div>
          <Button variant="primary" iconLeft={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            Новая группа
          </Button>
        </header>

        <Card>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <Field label="Поиск">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Название группы…"
              />
            </Field>
            <Field label="Статус">
              <Select
                value={String(archived)}
                onChange={(e) =>
                  setArchived(e.target.value === "all" ? "all" : e.target.value === "true")
                }
              >
                <option value="all">Все</option>
                <option value="false">Активные</option>
                <option value="true">Архивные</option>
              </Select>
            </Field>
          </div>

          {groups.isLoading && <Skeleton className="h-24 w-full" />}
          {groups.isError && (
            <EmptyState title="Не удалось загрузить" description={errorMessage(groups.error)} />
          )}
          {groups.data && groups.data.length === 0 && (
            <EmptyState icon={<UsersIcon />} title="Групп нет" />
          )}
          {groups.data && groups.data.length > 0 && (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <tr>
                    <th className="py-2 pr-4">Название</th>
                    <th className="py-2 pr-4">Год поступления</th>
                    <th className="py-2 pr-4">Студентов</th>
                    <th className="py-2 pr-4">Статус</th>
                    <th className="py-2 pr-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.data.map((g) => (
                    <tr key={g.group_id} className="border-b border-[var(--color-border)]/60 hover:bg-[var(--color-bg-muted)]/50">
                      <td className="py-2 pr-4 font-medium">{g.name}</td>
                      <td className="py-2 pr-4">{g.admission_year ?? "—"}</td>
                      <td className="py-2 pr-4">{g.students_count}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={g.archived ? "warning" : "neutral"}>
                          {g.archived ? "Архив" : "Активна"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center justify-end gap-1">
                          {!g.archived && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                iconLeft={<ArrowRightLeft className="w-3.5 h-3.5" />}
                                onClick={() => setTransferSrc(g)}
                                title="Bulk-transfer студентов"
                              >
                                Перевести всех
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                iconLeft={<Archive className="w-3.5 h-3.5" />}
                                onClick={() => doArchive(g)}
                                title="Архивировать"
                              />
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
          <CreateGroupModal
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              invalidate();
            }}
          />
        )}
        {transferSrc && (
          <TransferTargetModal
            src={transferSrc}
            onClose={() => setTransferSrc(null)}
            onConfirm={doBulkTransfer}
          />
        )}
      </section>
    </AppShell>
  );
}

function CreateGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const [name, setName] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear());

  async function submit() {
    try {
      await adminApi.createGroup({ name, admission_year: year });
      pushToast({ tone: "success", title: "Группа создана" });
      onCreated();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Новая группа"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={submit}>Создать</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Название" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ИУ5-12Б" />
        </Field>
        <Field label="Год поступления">
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </Field>
      </div>
    </Modal>
  );
}

function TransferTargetModal({
  src,
  onClose,
  onConfirm,
}: {
  src: AdminGroupOut;
  onClose: () => void;
  onConfirm: (targetId: number) => void;
}) {
  const [targetId, setTargetId] = useState<number | "">("");
  const groups = useQuery({
    queryKey: ["admin", "groups", "active"],
    queryFn: () => adminApi.listGroups({ archived: false }).then((r) => r.data),
  });
  const candidates: AdminGroupOut[] = (groups.data || []).filter(
    (g) => g.group_id !== src.group_id,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Перевести всех студентов"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" disabled={!targetId} onClick={() => onConfirm(Number(targetId))}>
            Перевести
          </Button>
        </div>
      }
    >
      <p className="text-sm">
        Из группы <b>{src.name}</b> ({src.students_count} студентов) будет перевод в:
      </p>
      <Field label="Целевая группа">
        <Select
          value={String(targetId)}
          onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">— выберите группу —</option>
          {candidates.map((g) => (
            <option key={g.group_id} value={g.group_id}>
              {g.name} ({g.students_count} студ.)
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-xs text-[var(--color-text-muted)] mt-2">
        Записывается в аудит-журнал как <code>group_bulk_transfer</code>.
      </p>
    </Modal>
  );
}
