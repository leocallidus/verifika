import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface SectionProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeCls: Record<NonNullable<SectionProps["size"]>, string> = {
  sm: "py-8",
  md: "py-10 sm:py-12",
  lg: "py-12 sm:py-16 md:py-20",
};

export function Section({ children, className, title, description, actions, size = "md" }: SectionProps) {
  return (
    <section className={cn(sizeCls[size], className)}>
      {(title || actions) && (
        <header className="max-w-7xl mx-auto px-4 sm:px-6 mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-lg sm:text-xl font-semibold text-[var(--color-text-primary)] tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-2xl">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">{children}</div>
    </section>
  );
}
