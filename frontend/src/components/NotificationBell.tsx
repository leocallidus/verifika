import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { cn } from "../lib/cn";
import type { StudentNotificationsOut } from "../types/api";

export interface NotificationBellProps {
  unreadCount?: number;
}

export function NotificationBell({ unreadCount }: NotificationBellProps) {
  const qc = useQueryClient();
  const q = useQuery<StudentNotificationsOut>({
    queryKey: ["student", "notifications", { unreadCount: true }],
    queryFn: () => api.get("/api/student/notifications?limit=1").then((r) => r.data),
    enabled: typeof unreadCount !== "number",
    refetchInterval: 60_000,
  });
  const count = unreadCount ?? q.data?.unread_count ?? 0;
  return (
    <Link
      to="/student/notifications"
      aria-label={`Уведомления (непрочитанных: ${count})`}
      className="btn btn-ghost h-9 w-9 p-0 relative"
      onClick={() => {
        void qc.invalidateQueries({ queryKey: ["student", "notifications"] });
      }}
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
