import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Clock3, History, KeyRound, LogIn, ShieldAlert, TimerReset } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import type { StudentActivityItemOut, StudentActivityOut } from "../../types/api";

type SourceFilter = "all" | "audit" | "notification" | "session";

function fmt(dt: string): string {
  return new Date(dt).toLocaleString("ru-RU");
}

function iconFor(item: StudentActivityItemOut) {
  if (item.category === "auth") return <LogIn className="w-4 h-4" />;
  if (item.category === "security") return <KeyRound className="w-4 h-4" />;
  if (item.category === "notification") return <Bell className="w-4 h-4" />;
  if (item.category === "test") return <TimerReset className="w-4 h-4" />;
  return <History className="w-4 h-4" />;
}

function toneFor(item: StudentActivityItemOut): "neutral" | "accent" | "success" | "warning" | "danger" {
  if (item.type === "auth_login_failed") return "danger";
  if (item.category === "security") return "warning";
  if (item.category === "notification") return item.is_read === false ? "accent" : "neutral";
  if (item.type.includes("finished")) return "success";
  if (item.category === "test") return "accent";
  return "neutral";
}

function linkFor(item: StudentActivityItemOut): string | null {
  if (item.session_id && (item.type.includes("finished") || item.type === "test_graded")) {
    return `/student/results/${item.session_id}`;
  }
  return null;
}

export default function StudentActivity() {
  const [source, setSource] = useState<SourceFilter>("all");
  const q = useQuery<StudentActivityOut>({
    queryKey: ["student", "activity", source],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (source !== "all") params.set("source", source);
      return api.get(`/api/student/activity?${params.toString()}`).then((r) => r.data);
    },
  });

  return (
    <AppShell>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Активность</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Входы, тесты, смены пароля и уведомления.
            </p>
          </div>
          {q.data && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="neutral">аудит: {q.data.audit_count}</Badge>
              <Badge tone="neutral">уведомления: {q.data.notification_count}</Badge>
              <Badge tone="neutral">сессии: {q.data.session_count}</Badge>
            </div>
          )}
        </header>

        <div className="flex flex-wrap gap-2">
          {[
            ["all", "Все"],
            ["audit", "Аудит"],
            ["notification", "Уведомления"],
            ["session", "Сессии"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSource(value as SourceFilter)}
              className={[
                "rounded-md border px-3 py-1.5 text-sm transition",
                source === value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {q.isLoading && <Skeleton className="h-72 rounded-lg" />}
        {q.isError && (
          <EmptyState
            icon={<ShieldAlert />}
            title="Не удалось загрузить активность"
            description={errorMessage(q.error)}
          />
        )}
        {q.data && q.data.items.length === 0 && (
          <EmptyState icon={<History />} title="Событий пока нет" />
        )}
        {q.data && q.data.items.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <ul>
              {q.data.items.map((item) => {
                const link = linkFor(item);
                const content = (
                  <div className="flex items-start gap-3">
                    <div className="grid place-items-center w-9 h-9 rounded-md bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] shrink-0">
                      {iconFor(item)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={toneFor(item)}>{item.title}</Badge>
                        <span className="text-xs text-[var(--color-text-muted)] inline-flex items-center gap-1 ml-auto">
                          <Clock3 className="w-3 h-3" />
                          {fmt(item.created_at)}
                        </span>
                      </div>
                      {item.body && <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{item.body}</p>}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
                        <span>{item.source}</span>
                        {item.session_id && <span>сессия #{item.session_id}</span>}
                        {item.ip_addr && <span>IP {item.ip_addr}</span>}
                        {item.is_read === false && <span>новое</span>}
                      </div>
                    </div>
                  </div>
                );
                return (
                  <li key={item.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    {link ? (
                      <Link to={link} className="block p-4 hover:bg-[var(--color-bg-muted)]">
                        {content}
                      </Link>
                    ) : (
                      <div className="p-4">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </AppShell>
  );
}
