import { create } from "zustand";
import { useEffect } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  set: (t: Theme) => void;
}

const KEY = "verifika.theme";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const isDark = t === "dark" || (t === "system" && mql.matches);
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";

  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute("content", isDark ? "#09090B" : "#FFFFFF");
}

export const useTheme = create<ThemeState>((set) => ({
  theme: (typeof localStorage !== "undefined" && (localStorage.getItem(KEY) as Theme)) || "system",
  set(t) {
    localStorage.setItem(KEY, t);
    applyTheme(t);
    set({ theme: t });
  },
}));

export function useThemeSync() {
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);
}
