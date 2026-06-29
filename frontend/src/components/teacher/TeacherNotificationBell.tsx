import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api } from "../../api/client";
import { cn } from "../../lib/cn";
import type { TeacherNotificationsOut } from "../../types/api";

export interface TeacherNotificationBellProps {
  unreadCount?: number;
}

export function TeacherNotificationBell({ unreadCount }: TeacherNotificationBellProps) {
  const q = useQuery<TeacherNotificationsOut>({
    queryKey: ["teacher", "notifications", { unread: true }],
    queryFn: () =>
      api.get("/api/teacher/notifications?limit=1&is_read=false").then((r) => r.data),
    enabled: typeof unreadCount !== "number",
    refetchInterval: 60_000,
  });
  const count = unreadCount ?? q.data?.unread_count ?? 0;
  return (
    <Link
      to="/teacher/notifications"
      aria-label={`Уведомления (непрочитанных: ${count})`}
      className="btn btn-ghost h-9 w-9 p-0 relative"
    >
      <Bell className={cn("w-4 h-4", count > 0 && "text-[var(--color-accent)]")} />
      {count > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-danger)] text-white text-[10px] font-medium grid place-items-center"
          aria-hidden="true"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
