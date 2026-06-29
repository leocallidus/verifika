import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]",
  accent: "bg-[var(--color-accent)]/10 text-[var(--color-accent)]",
  success: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  danger: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
  info: "bg-[var(--color-info-bg)] text-[var(--color-info)]",
};

export interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return <span className={cn("badge", tones[tone], className)}>{children}</span>;
}
