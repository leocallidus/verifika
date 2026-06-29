import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Eye, EyeOff } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { errorMessage } from "../../api/client";
import { adminApi } from "../../api/admin";
import type { AdminEventListOut } from "../../types/api";

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU");

export default function AdminEvents() {
  const [typeFilter, setTypeFilter] = useState("");
  const [severity, setSeverity] = useState<number | "all">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const events = useQuery<AdminEventListOut>({
    queryKey: ["admin", "events", typeFilter, severity, q, page],
    queryFn: () =>
      adminApi
        .listEvents({
          type: typeFilter || undefined,
          severity: severity === "all" ? undefined : severity,
          q: q || undefined,
          page,
          page_size: 30,
        })
        .then((r) => r.data),
    refetchInterval: 8_000,
  });

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-[var(--color-accent)]" />
            Лента событий
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Все события admin-канала (<code>recipient_role=admin</code>) и все admin-инициированные мутации.
          </p>
        </header>
        <Card>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <Field label="Поиск">
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="login, payload…"
              />
            </Field>
            <Field label="Тип">
              <Input
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="user_created…"
              />
            </Field>
            <Field label="Severity">
              <Select
                value={String(severity)}
                onChange={(e) => {
                  setSeverity(e.target.value === "all" ? "all" : Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value="all">Все</option>
                <option value="0">info</option>
                <option value="1">warn</option>
                <option value="2">alert</option>
              </Select>
            </Field>
          </div>

          {events.isLoading && <Skeleton className="h-32 w-full" />}
          {events.isError && (
            <EmptyState title="Не удалось загрузить" description={errorMessage(events.error)} />
          )}
          {events.data && events.data.items.length === 0 && (
            <EmptyState icon={<Bell />} title="Событий нет" />
          )}
          {events.data && events.data.items.length > 0 && (
            <ul className="space-y-1.5">
              {events.data.items.map((e) => (
                <li
                  key={e.notification_id}
                  className="border border-[var(--color-border)] rounded-md p-2"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className={
                        "w-1.5 h-1.5 rounded-full inline-block " +
                        (e.severity >= 2
                          ? "bg-[var(--color-danger)]"
                          : e.severity >= 1
                            ? "bg-[var(--color-warning)]"
                            : "bg-[var(--color-success)]")
                      }
                    />
                    <span className="truncate">{e.event_type}</span>
                    <Badge tone="neutral">{e.channel}</Badge>
                    <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                      {fmtDateTime(e.created_at)}
                    </span>
                  </div>
                  <PayloadPanel payload={(e.payload ?? e.metadata) as Record<string, unknown> | null} />
                </li>
              ))}
            </ul>
          )}

          {events.data && events.data.total > 30 && (
            <div className="flex justify-between items-center mt-4">
              <span className="text-xs text-[var(--color-text-muted)]">
                Страница {page} из {Math.ceil(events.data.total / 30)} • {events.data.total} всего
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  ← Назад
                </Button>
                <Button
                  variant="ghost"
                  disabled={page * 30 >= events.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Дальше →
                </Button>
              </div>
            </div>
          )}
        </Card>
      </section>
    </AppShell>
  );
}

function PayloadPanel({ payload }: { payload: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!payload) return null;
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="text-xs mt-1"
    >
      <summary className="cursor-pointer text-[var(--color-text-muted)] flex items-center gap-1">
        {open ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {open ? "скрыть" : "показать"} подробности
      </summary>
      <pre className="mt-1 text-[11px] bg-[var(--color-bg-muted)] rounded p-2 overflow-auto max-h-48">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}
