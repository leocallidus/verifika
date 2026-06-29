import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Users, FileSpreadsheet } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { AppShell } from "../../components/AppShell";
import { ScoreBadge } from "../../components/ScoreBadge";
import { downloadBlob } from "../../api/downloads";
import type { GroupStudentsOut } from "../../types/api";

export default function GroupStudents() {
  const { groupId } = useParams<{ groupId: string }>();
  const gid = Number(groupId);
  const q = useQuery<GroupStudentsOut>({
    queryKey: ["teacher", "groups", gid, "students"],
    queryFn: () => api.get(`/api/teacher/groups/${gid}/students`).then((r) => r.data),
    enabled: Number.isFinite(gid),
  });

  return (
    <AppShell
      rightSlot={
        <div className="hidden md:flex items-center gap-2">
          {q.data && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<FileSpreadsheet className="w-4 h-4" />}
              onClick={() => downloadBlob(`/api/v2/teacher/reports/groups/${gid}/gradebook.xlsx`, `gradebook-g${gid}.xlsx`)}
            >
              Excel
            </Button>
          )}
          <Link to="/teacher/groups" className="hidden md:inline-flex btn btn-ghost btn-sm">
            К группам
          </Link>
        </div>
      }
    >
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <Link to="/teacher/groups" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] inline-flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> К группам
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">
            Группа: {q.data?.group_name ?? "…"}
          </h1>
        </header>

        {q.isLoading && (
          <Card className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </Card>
        )}
        {q.isError && (
          <EmptyState icon={<Users />} title="Не удалось загрузить" description={errorMessage(q.error)} />
        )}
        {q.data && q.data.students.length === 0 && (
          <EmptyState icon={<Users />} title="Студентов пока нет" />
        )}
        {q.data && q.data.students.length > 0 && (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)] bg-[var(--color-bg-muted)]">
                <tr>
                  <th className="py-2.5 px-4 font-medium">ФИО</th>
                  <th className="py-2.5 px-4 font-medium">Email</th>
                  <th className="py-2.5 px-4 font-medium">Попыток</th>
                  <th className="py-2.5 px-4 font-medium">Средний %</th>
                </tr>
              </thead>
              <tbody>
                {q.data.students.map((s) => (
                  <tr
                    key={s.student_id}
                    className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-muted)] cursor-pointer transition"
                    onClick={() => (location.href = `/teacher/students/${s.student_id}`)}
                  >
                    <td className="py-2.5 px-4 font-medium text-[var(--color-text-primary)]">{s.full_name}</td>
                    <td className="py-2.5 px-4 text-[var(--color-text-muted)]">{s.email}</td>
                    <td className="py-2.5 px-4">
                      <Badge tone={s.sessions_count > 0 ? "info" : "neutral"}>{s.sessions_count}</Badge>
                    </td>
                    <td className="py-2.5 px-4">
                      {s.average_score == null ? <span className="text-[var(--color-text-muted)]">—</span> : <ScoreBadge score={Math.round(s.average_score)} max={100} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </AppShell>
  );
}
