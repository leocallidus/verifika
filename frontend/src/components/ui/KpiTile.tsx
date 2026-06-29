import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trend?: { delta: number; direction: "up" | "down" | "flat" };
  className?: string;
}

export function KpiTile({ label, value, hint, trend, className }: KpiTileProps) {
  const TrendIcon = trend?.direction === "up" ? ArrowRight : trend?.direction === "down" ? ArrowLeft : null;
  return (
    <div className={cn("card flex flex-col gap-1", className)}>
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-[var(--color-text-primary)]">
        {value}
      </div>
      {hint && <div className="text-xs text-[var(--color-text-muted)]">{hint}</div>}
      {trend && (
        <div className="text-xs flex items-center gap-1 mt-1">
          {TrendIcon && <TrendIcon className="w-3 h-3" />}
          <span
            className={cn(
              "font-medium",
              trend.direction === "up" && "text-[var(--color-success)]",
              trend.direction === "down" && "text-[var(--color-danger)]",
              trend.direction === "flat" && "text-[var(--color-text-muted)]",
            )}
          >
            {trend.delta > 0 ? "+" : ""}
            {trend.delta}%
          </span>
        </div>
      )}
    </div>
  );
}
