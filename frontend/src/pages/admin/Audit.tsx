import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Eye, EyeOff } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Field, Input, Select } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { errorMessage } from "../../api/client";
import { adminApi } from "../../api/admin";
import type { AdminAuditListOut } from "../../types/api";

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU");

export default function AdminAudit() {
  const [targetType, setTargetType] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const audit = useQuery<AdminAuditListOut>({
    queryKey: ["admin", "audit", targetType, actor, from, to, q, page],
    queryFn: () =>
      adminApi
        .listAudit({
          target_type: targetType || undefined,
          actor: actor || undefined,
          from: from || undefined,
          to: to || undefined,
          q: q || undefined,
          page,
          page_size: 50,
        })
        .then((r) => r.data),
    refetchInterval: 15_000,
  });

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-[var(--color-accent)]" />
            Аудит-журнал
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Критичные действия админов, преподавателей и студентов: <code>actor, target, before, after, ip, reason</code>.
          </p>
        </header>
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Field label="Поиск">
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="action или target…"
              />
            </Field>
            <Field label="Target type">
              <Select value={targetType} onChange={(e) => { setTargetType(e.target.value); setPage(1); }}>
                <option value="">Любой</option>
                <option value="student">student</option>
                <option value="teacher">teacher</option>
                <option value="admin">admin</option>
                <option value="group">group</option>
                <option value="discipline">discipline</option>
                <option value="topic">topic</option>
                <option value="topic_test">topic_test</option>
                <option value="question">question</option>
                <option value="session">session</option>
                <option value="user">user (role-change)</option>
              </Select>
            </Field>
            <Field label="Actor">
              <Select value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }}>
                <option value="">Любой</option>
                <option value="admin">admin</option>
                <option value="teacher">teacher</option>
                <option value="student">student</option>
              </Select>
            </Field>
            <Field label="От">
              <Input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            </Field>
            <Field label="До">
              <Input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </Field>
          </div>

          {audit.isLoading && <Skeleton className="h-32 w-full" />}
          {audit.isError && (
            <EmptyState title="Не удалось" description={errorMessage(audit.error)} />
          )}
          {audit.data && audit.data.items.length === 0 && (
            <EmptyState icon={<History />} title="Записей нет" />
          )}
          {audit.data && audit.data.items.length > 0 && (
            <ul className="space-y-1.5">
              {audit.data.items.map((r) => (
                <li
                  key={r.log_id}
                  className="border border-[var(--color-border)] rounded-md p-2 text-sm"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={r.actor_role === "admin" ? "accent" : "neutral"}>
                      {r.actor_role || "system"}
                    </Badge>
                    <span className="font-medium">{r.action}</span>
                    {r.target_type && (
                      <Badge tone="neutral">
                        {r.target_type}#{r.target_id ?? ""}
                      </Badge>
                    )}
                    {r.ip_addr && (
                      <span className="text-xs text-[var(--color-text-muted)]">{r.ip_addr}</span>
                    )}
                    <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                      {fmtDateTime(r.created_at)}
                    </span>
                  </div>
                  {r.reason && (
                    <div className="text-xs text-[var(--color-text-muted)] mt-1">
                      причина: {r.reason}
                    </div>
                  )}
                  <DiffPanel
                    before={r.before_json as Record<string, unknown> | null}
                    after={r.after_json as Record<string, unknown> | null}
                    metadata={r.metadata as Record<string, unknown> | null}
                  />
                </li>
              ))}
            </ul>
          )}

          {audit.data && audit.data.total > 50 && (
            <div className="flex justify-between items-center mt-4">
              <span className="text-xs text-[var(--color-text-muted)]">
                Страница {page} из {Math.ceil(audit.data.total / 50)} • {audit.data.total} всего
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Назад
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page * 50 >= audit.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Дальше →
                </button>
              </div>
            </div>
          )}
        </Card>
      </section>
    </AppShell>
  );
}

function DiffPanel({
  before,
  after,
  metadata,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}) {
  const [open, setOpen] = useState(false);
  if (!before && !after && !metadata) return null;
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="text-xs mt-1"
    >
      <summary className="cursor-pointer text-[var(--color-text-muted)] flex items-center gap-1">
        {open ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {open ? "скрыть" : "показать"} diff
      </summary>
      <div className="grid md:grid-cols-2 gap-2 mt-1">
        {before && (
          <pre className="text-[11px] bg-[var(--color-warning-bg)]/30 rounded p-2 overflow-auto max-h-48">
            <b>before</b>
            {"\n"}
            {JSON.stringify(before, null, 2)}
          </pre>
        )}
        {after && (
          <pre className="text-[11px] bg-[var(--color-success-bg)]/30 rounded p-2 overflow-auto max-h-48">
            <b>after</b>
            {"\n"}
            {JSON.stringify(after, null, 2)}
          </pre>
        )}
        {metadata && (
          <pre className="text-[11px] bg-[var(--color-bg-muted)] rounded p-2 overflow-auto max-h-48 md:col-span-2">
            <b>metadata</b>
            {"\n"}
            {JSON.stringify(metadata, null, 2)}
          </pre>
        )}
      </div>
    </details>
  );
}
