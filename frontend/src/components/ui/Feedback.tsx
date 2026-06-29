import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-[var(--color-bg-muted)]", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 px-4", className)}>
      <div className="mb-3 text-[var(--color-text-muted)] [&_svg]:w-10 [&_svg]:h-10">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-[var(--color-text-muted)] max-w-md">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
