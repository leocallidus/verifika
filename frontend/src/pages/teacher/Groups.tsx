import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, Plus } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { AppShell } from "../../components/AppShell";
import type { GroupOut } from "../../types/api";

export default function Groups() {
  const q = useQuery<GroupOut[]>({
    queryKey: ["teacher", "groups"],
    queryFn: () => api.get("/api/teacher/groups").then((r) => r.data),
  });

  return (
    <AppShell rightSlot={<Link to="/teacher" className="hidden md:inline-flex btn btn-ghost btn-sm">На главную</Link>}>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Группы</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Студенты по группам</p>
        </header>
        {q.isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="h-24"><Skeleton className="h-4 w-24" /></Card>
            ))}
          </div>
        )}
        {q.isError && (
          <EmptyState icon={<Users />} title="Не удалось загрузить" description={errorMessage(q.error)} />
        )}
        {q.data && q.data.length === 0 && (
          <EmptyState icon={<Users />} title="Групп пока нет" />
        )}
        {q.data && q.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {q.data.map((g) => (
              <Link key={g.group_id} to={`/teacher/groups/${g.group_id}/students`} className="card hover:border-[var(--color-border-strong)] transition">
                <div className="flex items-start justify-between">
                  <div className="grid place-items-center w-10 h-10 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                    <Users className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-2xl font-semibold tabular-nums">{g.student_count}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">студентов</span>
                  </div>
                </div>
                <h2 className="font-semibold mt-3">{g.name}</h2>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
