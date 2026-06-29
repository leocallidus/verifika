import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, BookOpen, Users, GraduationCap, FileText, Hash } from "lucide-react";
import { Modal } from "../ui/Modal";
import { api } from "../../api/client";
import { cn } from "../../lib/cn";
import type { TeacherSearchItemOut, TeacherSearchOut } from "../../types/api";

const KIND_META: Record<string, { label: string; icon: typeof BookOpen }> = {
  discipline: { label: "Дисциплина", icon: BookOpen },
  group: { label: "Группа", icon: Users },
  student: { label: "Студент", icon: GraduationCap },
  question: { label: "Вопрос", icon: FileText },
  topic: { label: "Тема", icon: BookOpen },
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  // Ctrl+K / Cmd+K open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const q = useMemo(
    () => ({
      queryKey: ["teacher", "search", query],
      queryFn: () =>
        api
          .get<TeacherSearchOut>(
            `/api/teacher/search?q=${encodeURIComponent(query)}&limit=20`,
          )
          .then((r) => r.data),
      enabled: open && query.length > 0,
      staleTime: 30_000,
    }),
    [open, query],
  );
  // We avoid react-query here to keep this self-contained; use light fetch.
  const [results, setResults] = useState<TeacherSearchItemOut[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !query) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get<TeacherSearchOut>(
          `/api/teacher/search?q=${encodeURIComponent(query)}&limit=20`,
        )
        .then((r) => {
          if (cancelled) return;
          setResults(r.data.items);
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
          setHighlight(0);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const grouped = useMemo(() => {
    const map: Record<string, TeacherSearchItemOut[]> = {};
    for (const it of results) {
      (map[it.kind] ||= []).push(it);
    }
    return Object.entries(map);
  }, [results]);

  function go(item: TeacherSearchItemOut) {
    setOpen(false);
    navigate(item.href);
  }

  function onKeyDownOnList(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((v) => Math.min(results.length - 1, v + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((v) => Math.max(0, v - 1));
    } else if (e.key === "Enter" && results[highlight]) {
      e.preventDefault();
      go(results[highlight]);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Глобальный поиск (Ctrl+K)"
        onClick={() => setOpen(true)}
        className="btn btn-ghost h-9 gap-1.5 px-2.5 text-[var(--color-text-muted)] hidden md:inline-flex"
        title="Ctrl+K"
      >
        <Search className="w-4 h-4" />
        <span className="text-sm hidden lg:inline">Поиск</span>
        <kbd className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
          Ctrl K
        </kbd>
      </button>
      {/* Mobile fallback */}
      <button
        type="button"
        aria-label="Поиск"
        onClick={() => setOpen(true)}
        className="btn btn-ghost h-9 w-9 p-0 md:hidden"
      >
        <Search className="w-4 h-4" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Глобальный поиск">
        <div onKeyDown={onKeyDownOnList}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Дисциплина, группа, студент, вопрос, тема..."
              className="input pl-9 w-full"
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls="search-results-list"
              aria-activedescendant={results[highlight] ? `search-item-${results[highlight].kind}-${results[highlight].id}-${highlight}` : undefined}
            />
          </div>
          <div id="search-results-list" role="listbox" aria-label="Результаты поиска" className="mt-3 max-h-[60vh] overflow-y-auto">
            {query.length === 0 && (
              <div className="text-xs text-[var(--color-text-muted)] py-3 px-1">
                Начните вводить текст. Поиск по 5 типам сущностей (только ваши).
              </div>
            )}
            {query.length > 0 && loading && (
              <div className="text-xs text-[var(--color-text-muted)] py-3 px-1">
                Поиск…
              </div>
            )}
            {query.length > 0 && !loading && results.length === 0 && (
              <div className="text-xs text-[var(--color-text-muted)] py-3 px-1">
                Ничего не найдено.
              </div>
            )}
            {grouped.map(([kind, items]) => {
              const Icon = KIND_META[kind]?.icon ?? Hash;
              const label = KIND_META[kind]?.label ?? kind;
              const offset = results.findIndex((r) => r.kind === kind);
              return (
                <div key={kind} className="mb-2 last:mb-0">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] px-2 pt-2">
                    {label}
                  </div>
                  <ul role="presentation">
                    {items.map((it, idx) => {
                      const index = offset + idx;
                      const active = index === highlight;
                      const optionId = `search-item-${it.kind}-${it.id}-${index}`;
                      return (
                        <li key={`${kind}-${it.id}-${idx}`} role="presentation">
                          <button
                            type="button"
                            id={optionId}
                            role="option"
                            aria-selected={active}
                            onClick={() => go(it)}
                            onMouseEnter={() => setHighlight(index)}
                            className={cn(
                              "w-full text-left px-2 py-2 rounded-md flex items-center gap-2",
                              active
                                ? "bg-[var(--color-bg-muted)] ring-1 ring-[var(--color-accent)]"
                                : "hover:bg-[var(--color-bg-muted)]",
                            )}
                          >
                            <Icon className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm truncate">{it.label}</div>
                              {it.hint && (
                                <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                                  {it.hint}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-[var(--color-text-muted)] flex items-center gap-2">
            <span>↑↓ навигация</span>
            <span>·</span>
            <span>Enter — открыть</span>
            <span>·</span>
            <span>Esc — закрыть</span>
          </div>
        </div>
      </Modal>
    </>
  );
}
