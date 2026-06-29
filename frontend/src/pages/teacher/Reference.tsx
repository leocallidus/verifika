import { useState } from "react";
import { Library, Users, BookOpen, Tags } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Link, NavLink } from "react-router-dom";
import { SSEBadge } from "../../components/SSEBadge";
import { cn } from "../../lib/cn";

const tabs = [
  { to: "/teacher/reference/disciplines", label: "Дисциплины", icon: BookOpen },
  { to: "/teacher/reference/groups", label: "Группы", icon: Users },
  { to: "/teacher/reference/students", label: "Студенты", icon: Library },
  { to: "/teacher/reference/tags", label: "Теги", icon: Tags },
] as const;

export default function Reference() {
  return (
    <AppShell
      rightSlot={
        <div className="hidden md:flex items-center gap-2">
          <SSEBadge />
          <Link to="/teacher" className="btn btn-ghost btn-sm">На главную</Link>
        </div>
      }
    >
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Справочники</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Поиск, добавление, изменение и архив дисциплин, групп и студентов.
          </p>
        </header>
        <ReferenceTabs />
        <div className="mt-6">
          {/* Routed children render under this outlet via App.tsx */}
          <Outlet />
        </div>
      </section>
    </AppShell>
  );
}

function ReferenceTabs() {
  return (
    <div
      role="tablist"
      aria-label="Разделы справочника"
      className="inline-flex p-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] overflow-x-auto max-w-full"
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={false}
          className={({ isActive }) =>
            cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap",
              isActive
                ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            )
          }
          role="tab"
        >
          <t.icon className="w-3.5 h-3.5" />
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

// React-router Outlet
import { Outlet } from "react-router-dom";
