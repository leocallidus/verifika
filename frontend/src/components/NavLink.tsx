import { NavLink as RouterNavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  show?: boolean;
}

export function NavLink({ to, label, icon, end = false }: { to: string; label: string; icon: ReactNode; end?: boolean }) {
  return (
    <RouterNavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium transition",
          isActive
            ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]",
        )
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </RouterNavLink>
  );
}
