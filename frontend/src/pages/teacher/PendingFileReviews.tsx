import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, Inbox, ChevronRight, CheckSquare, AlertCircle } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Skeleton, EmptyState } from "../../components/ui/Feedback";
import type { PendingFileReviewsOut } from "../../types/api";

function fmt(dt: string) {
  return new Date(dt).toLocaleString("ru-RU");
}

export default function PendingFileReviews() {
  const q = useQuery<PendingFileReviewsOut>({
    queryKey: ["teacher", "pending-file-reviews"],
    queryFn: () => api.get("/api/teacher/pending-file-reviews").then((r) => r.data),
  });

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Ручная проверка ответов</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Здесь отображаются попытки студентов, требующие проверки присланных файлов.
            </p>
          </div>
        </header>

        {q.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="h-20 animate-pulse">
                <div />
              </Card>
            ))}
          </div>
        )}

        {q.isError && (
          <EmptyState
            icon={<AlertCircle className="w-8 h-8 text-[var(--color-danger)]" />}
            title="Ошибка загрузки"
            description={errorMessage(q.error)}
          />
        )}

        {q.data && q.data.items.length === 0 && (
          <EmptyState
            icon={<Inbox className="w-8 h-8 text-[var(--color-text-muted)]" />}
            title="Очередь пуста"
            description="Нет незавершённых попыток, ожидающих ручной проверки файлов."
          />
        )}

        {q.data && q.data.items.length > 0 && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    <th className="p-4">Студент</th>
                    <th className="p-4">Дисциплина / Тема</th>
                    <th className="p-4">Завершено</th>
                    <th className="p-4">Статус файлов</th>
                    <th className="p-4 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)] text-sm text-[var(--color-text-primary)]">
                  {q.data.items.map((item) => {
                    const isAllGraded = item.graded_count === item.file_upload_count;
                    return (
                      <tr key={item.session_id} className="hover:bg-[var(--color-bg-muted)] transition">
                        <td className="p-4">
                          <div className="font-semibold">{item.student_name}</div>
                          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{item.group_name}</div>
                        </td>
                        <td className="p-4">
                          <div>{item.discipline_name}</div>
                          {item.topic_name && (
                            <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{item.topic_name}</div>
                          )}
                        </td>
                        <td className="p-4 text-xs text-[var(--color-text-muted)]">
                          {fmt(item.completed_at)}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Badge tone={isAllGraded ? "success" : "warning"}>
                              Проверено {item.graded_count} из {item.file_upload_count}
                            </Badge>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <Link
                            to={`/teacher/sessions/${item.session_id}/file-review`}
                            className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                          >
                            Проверить <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
