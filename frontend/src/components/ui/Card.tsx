import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  children: ReactNode;
}

export function Card({ elevated, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5",
        elevated && "shadow-sm",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
