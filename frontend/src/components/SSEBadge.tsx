import { Link, useNavigate } from "react-router-dom";
import { BellOff, Bell, Radio } from "lucide-react";
import { useNotifications } from "../store/notifications";
import { cn } from "../lib/cn";

export function SSEBadge() {
  const items = useNotifications((s) => s.items);
  const connected = useNotifications((s) => s.connected);
  const unseen = items.filter((n) => !n.read_at && n.event_type !== "hello").length;
  const nav = useNavigate();
  return (
    <Link
      to="/teacher/notifications"
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium transition border",
        connected
          ? "bg-[var(--color-success-bg)] border-[var(--color-success)]/30 text-[var(--color-success)]"
          : "bg-[var(--color-bg-muted)] border-[var(--color-border)] text-[var(--color-text-muted)]",
      )}
      title={connected ? "SSE: подключено" : "SSE: ожидание"}
    >
      {connected ? <Radio className="w-3.5 h-3.5" strokeWidth={2.5} /> : <BellOff className="w-3.5 h-3.5" />}
      <span>{connected ? 'онлайн' : 'оффлайн'}</span>
      {unseen > 0 && (
        <span className="ml-1 px-1.5 rounded-full bg-[var(--color-danger)] text-white text-[10px] font-bold leading-4 min-w-[16px] text-center">
          {unseen > 9 ? "9+" : unseen}
        </span>
      )}
    </Link>
  );
}
