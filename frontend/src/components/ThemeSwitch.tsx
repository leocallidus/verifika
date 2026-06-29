import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "../theme/theme";
import { cn } from "../lib/cn";

const opts = [
  { v: "light", icon: Sun, label: "Светлая" },
  { v: "dark", icon: Moon, label: "Тёмная" },
  { v: "system", icon: Laptop, label: "Системная" },
] as const;

export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const theme = useTheme((s) => s.theme);
  const set = useTheme((s) => s.set);
  if (compact) {
    const next = { light: "dark", dark: "system", system: "light" } as const;
    const Icon = opts.find((o) => o.v === theme)!.icon;
    return (
      <button
        type="button"
        onClick={() => set(next[theme])}
        className="btn btn-ghost h-9 w-9 p-0"
        aria-label={`Тема: ${theme}. Переключить`}
        title={`Тема: ${theme}`}
      >
        <Icon className="w-4 h-4" />
      </button>
    );
  }
  return (
    <div role="group" aria-label="Тема оформления" className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0.5">
      {opts.map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => set(v)}
          aria-pressed={theme === v}
          aria-label={label}
          title={label}
          className={cn(
            "h-7 w-7 rounded grid place-items-center transition",
            theme === v
              ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)]"
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
