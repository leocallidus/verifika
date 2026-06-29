import { Link, NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import {
  GraduationCap,
  LogOut,
  LogIn,
  User,
  ChevronDown,
  Menu,
  BookOpen,
  LineChart,
  Database,
  Users,
  Radio,
  History,
  Library,
	  ShieldCheck,
	  Activity,
	  Building2,
	  Bell,
  Settings,
  ChevronLeft,
  Sparkles,
  Table2,
  FileSpreadsheet,
  BarChart3,
  HelpCircle,
  CheckSquare,
  Palette,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../store/auth";
import { ThemeSwitch } from "./ThemeSwitch";
import { NavLink } from "./NavLink";
import { useNotifications } from "../store/notifications";
import { NotificationBell } from "./NotificationBell";
import { TeacherNotificationBell } from "./teacher/TeacherNotificationBell";
import { CommandPalette } from "./teacher/CommandPalette";
import { useStudentNotificationStream } from "../api/useStudentNotificationStream";
import { useTeacherNotificationStream } from "../api/useTeacherNotificationStream";
import { cn } from "../lib/cn";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { CornerLogo } from "./CornerLogo";
import { getAiStatus, getPendingQuestions } from "../api/ai";

import { useBranding } from "../store/branding";

interface NavSpec {
  to: string;
  label: string;
  icon: ReactNode;
  short?: string; // сокращение для dropdown / icon-only
  badge?: ReactNode;
  /**
   * Если true, nav-элемент активен не только при точном совпадении path,
   * но и для всех дочерних маршрутов. Используется для «родительских»
   * секций (например, /teacher, /admin) — пункты меню остаются
   * подсвеченными, когда пользователь находится в любом подразделе секции.
   *
   * При этом активное состояние выбирается по самому специфичному
   * совпадению: если активны и /teacher, и /teacher/dashboard, то
   * подсвечивается только /teacher/dashboard.
   */
  matchChildren?: boolean;
}

const teacherNav: NavSpec[] = [
  { to: "/teacher", label: "Справочники", icon: <Library className="w-4 h-4" />, short: "Справ.", matchChildren: true },
  { to: "/teacher/dashboard", label: "Дашборд", icon: <LineChart className="w-4 h-4" /> },
  { to: "/teacher/topic-analytics", label: "Аналитика тем", icon: <BarChart3 className="w-4 h-4" />, short: "Темы" },
  { to: "/teacher/diagnostics", label: "Диагностика", icon: <Activity className="w-4 h-4" />, short: "Диаг." },
  { to: "/teacher/bank", label: "Банк", icon: <Database className="w-4 h-4" /> },
  { to: "/teacher/groups", label: "Журнал", icon: <Users className="w-4 h-4" />, matchChildren: true },
  { to: "/teacher/pending-file-reviews", label: "Проверка файлов", icon: <CheckSquare className="w-4 h-4" />, short: "Проверка" },
  { to: "/teacher/notifications", label: "Уведомления", icon: <Bell className="w-4 h-4" />, short: "Увед." },
  { to: "/teacher/audit", label: "Журнал действий", icon: <ShieldCheck className="w-4 h-4" />, short: "Аудит" },
  { to: "/teacher/profile", label: "Профиль", icon: <User className="w-4 h-4" /> },
  { to: "/teacher/docs", label: "Инструкция", icon: <BookOpen className="w-4 h-4" />, short: "Док." },
];
const studentNav: NavSpec[] = [
  { to: "/student", label: "Дисциплины", icon: <BookOpen className="w-4 h-4" />, short: "Дисц.", matchChildren: true },
  { to: "/student/dashboard", label: "Дашборд", icon: <LineChart className="w-4 h-4" /> },
  { to: "/student/results", label: "История", icon: <History className="w-4 h-4" /> },
  { to: "/student/activity", label: "Активность", icon: <Activity className="w-4 h-4" />, short: "Актив." },
  { to: "/student/notifications", label: "Уведомления", icon: <Bell className="w-4 h-4" />, short: "Увед." },
  { to: "/student/profile", label: "Профиль", icon: <User className="w-4 h-4" /> },
  { to: "/student/docs", label: "Инструкция", icon: <HelpCircle className="w-4 h-4" />, short: "Док." },
];
const adminNav: NavSpec[] = [
  { to: "/admin", label: "Дашборд", icon: <LineChart className="w-4 h-4" />, matchChildren: true },
	  { to: "/admin/users", label: "Пользователи", icon: <Users className="w-4 h-4" />, short: "Юзеры" },
	  { to: "/admin/groups", label: "Группы", icon: <Building2 className="w-4 h-4" /> },
  { to: "/admin/disciplines", label: "Дисциплины", icon: <Database className="w-4 h-4" />, short: "Дисц." },
  { to: "/admin/assignments", label: "Назначения", icon: <Table2 className="w-4 h-4" />, short: "Назн." },
  { to: "/admin/structure", label: "Импорт", icon: <FileSpreadsheet className="w-4 h-4" /> },
  { to: "/admin/events", label: "Лента", icon: <Bell className="w-4 h-4" /> },
  { to: "/admin/audit", label: "Аудит", icon: <History className="w-4 h-4" /> },
  { to: "/admin/sessions", label: "Сессии", icon: <Activity className="w-4 h-4" /> },
  { to: "/admin/health", label: "Здоровье", icon: <ShieldCheck className="w-4 h-4" /> },
  { to: "/admin/branding", label: "Брендинг", icon: <Palette className="w-4 h-4" /> },
  { to: "/admin/docs", label: "Документация", icon: <BookOpen className="w-4 h-4" />, short: "Док." },
];
const allRolesNav: NavSpec[] = [
  { to: "/settings/desktop", label: "Desktop", icon: <Settings className="w-4 h-4" /> },
];
const guestNav: NavSpec[] = [];

/**
 * Эмпирические ширины пункта навигации в px, используются для расчёта
 * переполнения. Реальная ширина считается браузером, поэтому небольшая
 * неточность допустима.
 */
const NAV_ITEM_PX_WITH_LABEL = 130;
const NAV_GAP_PX = 4;
const MORE_DROPDOWN_PX = 56;

export interface AppShellProps {
  children: ReactNode;
  rightSlot?: ReactNode;
}

/**
 * Legacy alias — pages previously exported `<Shell title right children>`.
 * Provide a thin adapter so untouched pages keep compiling.
 */
export function Shell({
  title,
  right,
  children,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppShell
      rightSlot={
        right ? (
          <div className="flex items-center gap-2">
            {title && (
              <h1 className="text-base font-semibold text-[var(--color-text-primary)] mr-2 hidden 2xl:block">{title}</h1>
            )}
            {right}
          </div>
        ) : undefined
      }
    >
      <Section title={title}>
        <div className="max-w-5xl">{children}</div>
      </Section>
    </AppShell>
  );
}

function Section({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="py-8">
      {title && (
        <h1 className="max-w-7xl mx-auto px-4 sm:px-6 text-lg font-semibold mb-4">{title}</h1>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function AppShell({ children, rightSlot }: AppShellProps) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [userOpen, setUserOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapperRef = useRef<HTMLDivElement | null>(null);

  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";
  const isAdmin = user?.role === "admin";

  useStudentNotificationStream();
  useTeacherNotificationStream();
  const notifCount = useNotifications((s) =>
    isStudent ? s.items.filter((n) => !n.read_at).length : 0,
  );
  const isTestRunner = location.pathname.startsWith("/student/test/");
  const aiStatus = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => getAiStatus(),
    enabled: !!user,
    staleTime: 60000,
    retry: false,
  });

  const aiEnabled = aiStatus.data?.enabled ?? false;

  const pendingCountQuery = useQuery({
    queryKey: ["ai-pending-count"],
    queryFn: () => getPendingQuestions(),
    enabled: !!user && isTeacher,
    refetchInterval: 15000,
  });

  const pendingCount = pendingCountQuery.data?.length ?? 0;

  const navItems = useMemo<NavSpec[]>(() => {
    let items: NavSpec[] = [];
    if (isAdmin) {
      items = [...adminNav];
    } else if (isTeacher) {
      items = [...teacherNav];
    } else if (isStudent) {
      items = [...studentNav];
    } else {
      items = [...guestNav];
    }

    if (aiEnabled) {
      if (isTeacher) {
        const bankIndex = items.findIndex((it) => it.to === "/teacher/bank");
        const badge = pendingCount > 0 ? (
          <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold bg-indigo-600 text-white rounded-full leading-none tabular-nums animate-pulse">
            {pendingCount}
          </span>
        ) : null;

        const aiReviewItem: NavSpec = {
          to: "/teacher/ai-review",
          label: "На проверке (AI)",
          icon: <Sparkles className="w-4 h-4 text-indigo-500" />,
          badge,
        };
        if (bankIndex !== -1) {
          const copy = [...items];
          copy.splice(bankIndex + 1, 0, aiReviewItem);
          items = copy;
        } else {
          items = [...items, aiReviewItem];
        }
      }

      const profileIndex = items.findIndex((it) => it.to.endsWith("/profile"));
      const aiItem: NavSpec = {
        to: "/ai",
        label: "ИИ-Ассистент",
        icon: <Sparkles className="w-4 h-4" />,
        short: "ИИ",
      };
      if (profileIndex !== -1) {
        const copy = [...items];
        copy.splice(profileIndex, 0, aiItem);
        items = copy;
      } else {
        items = [...items, aiItem];
      }
    }

    return [...items, ...allRolesNav];
  }, [isAdmin, isTeacher, isStudent, aiEnabled, pendingCount]);

  // =====================================================================
  //  Определяем «активный» пункт навигации с учётом дочерних маршрутов.
  //  Правило: самый специфичный путь выигрывает.
  //  Пример: pathname="/teacher/dashboard" активирует
  //  ровно /teacher/dashboard, НЕ /teacher (даже если для /teacher
  //  включён matchChildren).
  // =====================================================================
  const activeNavPath = useMemo<string | null>(() => {
    let best: NavSpec | null = null;
    for (const it of navItems) {
      const exact = location.pathname === it.to;
      const child =
        it.matchChildren &&
        (location.pathname === it.to ||
          location.pathname.startsWith(it.to + "/"));
      if (!exact && !child) continue;
      if (!best || it.to.length > best.to.length) best = it;
    }
    return best?.to ?? null;
  }, [location.pathname, navItems]);
  const isNavActive = (item: NavSpec): boolean =>
    activeNavPath === item.to;

  // Показывать правый слот + user-dropdown на узких экранах — отдельно;
  // на mobile switchим в более компактные компоненты (только иконка).

  // =====================================================================
  //  Авто-укладка пунктов навигации в «Ещё» при нехватке ширины.
  //  - Меряем intrinsic scrollWidth vs constrained clientWidth.
  //  - Бинарным поиском ищем максимум N видимых пунктов, при котором они + 1
  //    dropdown помещаются в clientWidth.
  //  - Ре-измерение: на каждом изменении navItems.length, по window resize,
  //    и при смене `measureNonce` (mtime).
  //
  //  Чтобы не войти в цикл ре-маунта (когда смена overflowCount меняет
  //  scrollWidth) — мы пересчитываем, но только в одном направлении:
  //  "если overflow = 0 не влезает, увеличиваем; если после увеличения всё
  //  влезает, держим больший overflow".
  //  Т.е. берём result = if (current overflowCount > 0) keep else compute.
  // =====================================================================
  const navMeasureRef = useRef<HTMLDivElement | null>(null);
  const [overflowCount, setOverflowCount] = useState(0);
  const [measureNonce, setMeasureNonce] = useState(0);
  // Запоминаем последнее присвоенное значение, чтобы не реагировать на него.
  const lastSetRef = useRef<number>(0);

  useLayoutEffect(() => {
    const el = navMeasureRef.current;
    if (!el) return;
    const total = navItems.length;
    if (total === 0) {
      setOverflowCount(0);
      lastSetRef.current = 0;
      return;
    }
    const { clientWidth, scrollWidth } = el;
    if (scrollWidth <= clientWidth) {
      // Все items помещаются → 0 overflow.
      if (lastSetRef.current !== 0) {
        lastSetRef.current = 0;
        setOverflowCount(0);
      }
      return;
    }
    // Не помещается — найдём минимум overflow (по сути max visible items).
    let lo = 1, hi = total;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const needed =
        mid * NAV_ITEM_PX_WITH_LABEL +
        (mid + 1) * NAV_GAP_PX +
        MORE_DROPDOWN_PX;
      if (needed <= clientWidth) lo = mid;
      else hi = mid - 1;
    }
    const over = Math.max(0, Math.min(total - lo, total - 1));
    if (over !== lastSetRef.current) {
      lastSetRef.current = over;
      setOverflowCount(over);
    }
  }, [navItems.length, measureNonce]);

  // Resize: намеренно пере-измеряем после изменения размера окна,
  // но НЕ реагируем на изменения контента во избежание циклов.
  useEffect(() => {
    const handle = () => {
      // При resize сначала сбросить lastSetRef, чтобы измерение пересчитало.
      lastSetRef.current = -1;
      setMeasureNonce((n) => n + 1);
    };
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  // Закрыть dropdown «Ещё» при клике снаружи и Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!moreWrapperRef.current) return;
      if (!moreWrapperRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  // Список видимых пунктов + дополнительных ("Ещё"):
  const { primary, overflow } = useMemo(() => {
    const n = navItems.length;
    if (overflowCount <= 0) {
      return { primary: navItems, overflow: [] };
    }
    // Выносим последние N пунктов ("Audit", "Desktop") — обычно менее приоритетные.
    const cuts = Math.min(overflowCount, n - 1);
    const primary = navItems.slice(0, n - cuts);
    const overflow = navItems.slice(n - cuts);
    return { primary, overflow };
  }, [navItems, overflowCount]);

  const branding = useBranding((s) => s.branding);
  const appName = branding?.app_name || "Верифика";

  return (
    <div className="min-h-[100vh] bg-[var(--color-bg)] text-[var(--color-text-primary)] flex flex-col">
      <header
        className={cn(
          "sticky top-0 z-40 bg-[var(--color-bg-elevated)]/85 backdrop-blur",
          "border-b border-[var(--color-border)] h-14",
        )}
      >
        <div
          className={cn(
            "h-full w-full max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6",
            "flex items-center gap-2 lg:gap-3 flex-nowrap min-w-0",
          )}
        >
          {/* Hamburger (mobile / очень узкое окно) */}
          <button
            type="button"
            aria-label="Меню"
            onClick={() => setDrawerOpen(true)}
            className={cn(
              "btn btn-ghost h-9 w-9 p-0 shrink-0",
              isTestRunner ? "inline-flex" : "md:hidden",
              overflow.length > 0 ? "inline-flex" : "md:hidden",
            )}
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Logo */}
          <Link
            to={
              user
                ? isAdmin
                  ? "/admin"
                  : isTeacher
                    ? "/teacher/reference"
                    : "/student"
                : "/"
            }
            className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)] shrink min-w-0 max-w-[55vw]"
          >
            {branding?.topbar_logo_url ? (
              <img src={branding.topbar_logo_url} className="h-6 object-contain shrink-0" alt="Logo" />
            ) : (
              <GraduationCap className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
            )}
            <span
              className={cn(
                "hidden md:inline whitespace-nowrap truncate min-w-0",
                "max-w-[160px] lg:max-w-[200px] xl:max-w-[240px]",
              )}
              title={appName}
            >
              {appName}
            </span>
            <span className="md:hidden whitespace-nowrap truncate min-w-0">{appName}</span>
          </Link>

          {/* Главная навигация: измеряем ширину → решаем сколько показывать.
              ВАЖНО: overflow-hidden здесь обрезает выходящие за края меню,
              поэтому <div> «Ещё» вынесен наружу и использует fixed-координаты. */}
          <div
            ref={navMeasureRef}
            className={cn(
              "min-w-0 overflow-hidden shrink",
              isTestRunner ? "hidden" : "hidden md:flex",
            )}
          >
            <nav
              aria-label="Главная навигация"
              className={cn(
                "flex items-center gap-1 min-w-0 flex-nowrap",
                // На mobile используется боковой drawer.
              )}
            >
              {primary.map((it) => (
                <HeaderNavItem key={it.to} it={it} active={isNavActive(it)} />
              ))}
            </nav>
          </div>

          {/* Кнопка «Ещё» — снаружи overflow-hidden, чтобы её выпадающее
              меню могло выходить за края родителя. Координаты меню —
              через fixed, чтобы не зависеть от контейнера. */}
          {overflow.length > 0 && !isTestRunner && (
            <div ref={moreWrapperRef} className="hidden md:block shrink-0 relative">
              <button
                type="button"
                aria-label={`Ещё (${overflow.length})`}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 lg:px-3 h-9 rounded-md text-sm",
                  "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                )}
              >
                <span className="hidden lg:inline">Ещё</span>
                <span
                  className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] text-[11px] tabular-nums font-medium"
                  aria-hidden="true"
                >
                  {overflow.length}
                </span>
                <ChevronDown
                  className={cn(
                    "w-3 h-3 transition",
                    moreOpen && "rotate-180",
                  )}
                />
              </button>
              {moreOpen && (
                <div
                  role="menu"
                  className={cn(
                    "absolute right-0 mt-1 min-w-[240px] max-w-[320px]",
                    "bg-[var(--color-bg-elevated)] border border-[var(--color-border)]",
                    "rounded-lg shadow-md p-1 z-50",
                  )}
                  style={{ position: "absolute" }}
                >
                  <ul role="none">
                    {overflow.map((it) => {
                      const active = isNavActive(it);
                      return (
                        <li key={it.to}>
                          <RouterNavLink
                            to={it.to}
                            end={!it.matchChildren}
                            role="menuitem"
                            onClick={() => setMoreOpen(false)}
                            className={() =>
                              cn(
                                "flex items-center gap-2 px-3 py-2 rounded text-sm",
                                active
                                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                                  : "hover:bg-[var(--color-bg-muted)] text-[var(--color-text-primary)]",
                              )
                            }
                            aria-current={active ? "page" : undefined}
                          >
                            <span className="grid place-items-center w-5 h-5 shrink-0">
                              {it.icon}
                            </span>
                            <span className="truncate flex-1">{it.label}</span>
                            {it.badge}
                          </RouterNavLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1 min-w-1" />

          {/* Right slot (page-specific). shrink-0 + nowrap so its buttons are
              never clipped — when space is tight the adaptive nav collapses
              into the «Ещё» dropdown instead. */}
          {rightSlot && (
            <div className="hidden xl:flex items-center gap-2 shrink-0 whitespace-nowrap">
              {rightSlot}
            </div>
          )}

          {/* Right group: command palette, notifications, theme, user */}
          <div className="flex items-center gap-1 lg:gap-2 shrink-0">
            {user && <CommandPalette />}
            {isStudent && <NotificationBell unreadCount={notifCount} />}
            {isTeacher && <TeacherNotificationBell />}
            <ThemeSwitch compact />

            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserOpen((v) => !v)}
                  className="btn btn-ghost h-9 gap-1.5 max-w-[130px] sm:max-w-[160px] lg:max-w-[200px] xl:max-w-[240px] 2xl:max-w-[300px]"
                  aria-haspopup="menu"
                  aria-expanded={userOpen}
                  title={user.full_name}
                >
                  <User className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                  <span className="hidden sm:inline text-sm truncate min-w-0">
                    {user.full_name}
                    {isAdmin && (
                      <span className="ml-1 text-xs text-[var(--color-accent)] inline-flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        админ
                      </span>
                    )}
                  </span>
                  <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />
                </button>
                {userOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-1 min-w-[220px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg shadow-md p-1 z-50"
                    onMouseLeave={() => setUserOpen(false)}
                  >
                    <Link
                      to={isTeacher ? "/teacher/profile" : isStudent ? "/student/profile" : "/admin/profile"}
                      onClick={() => setUserOpen(false)}
                      className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)]"
                      role="menuitem"
                    >
                      <User className="w-3.5 h-3.5" /> Профиль
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-[var(--color-bg-muted)] text-[var(--color-danger)]"
                      onClick={() => {
                        setUserOpen(false);
                        logout();
                      }}
                    >
                      <LogOut className="w-3.5 h-3.5" /> Выйти
                    </button>
                  </div>
                )}
              </div>
            ) : (
              !location.pathname.startsWith("/reset") && (
                <Button variant="primary" size="sm" iconLeft={<LogIn className="w-3.5 h-3.5" />} onClick={() => nav("/login")}>
                  Войти
                </Button>
              )
            )}
          </div>
        </div>
      </header>

      <main
        className={cn(
          "flex-1 w-full min-w-0",
          location.pathname.startsWith("/student/test/") ? undefined : "pb-16 md:pb-0",
        )}
      >
        {children}
      </main>

      {user && !location.pathname.startsWith("/student/test/") && (
        <nav
          aria-label="Нижняя навигация"
          className="fixed bottom-0 inset-x-0 z-40 bg-[var(--color-bg-elevated)]/95 backdrop-blur border-t border-[var(--color-border)] h-14 md:hidden grid"
          style={{ gridTemplateColumns: `repeat(${Math.min(navItems.length, 5)}, minmax(0, 1fr))` }}
          role="navigation"
        >
          {navItems.slice(0, 5).map((it) => {
            const active = isNavActive(it);
            return (
              <RouterNavLink
                key={it.to}
                to={it.to}
                end={!it.matchChildren}
                aria-current={active ? "page" : undefined}
                className={() =>
                  cn(
                    "flex flex-col items-center justify-center text-[11px] gap-0.5 transition min-w-0 truncate px-1",
                    active
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                  )
                }
              >
                <span
                  className={cn(
                    "grid place-items-center w-6 h-6 rounded-md transition",
                    active
                      ? "bg-[var(--color-accent)]/15"
                      : "bg-transparent",
                  )}
                >
                  {it.icon}
                </span>
                <span className="leading-none truncate max-w-[64px]">
                  {it.short ?? it.label}
                </span>
              </RouterNavLink>
            );
          })}
        </nav>
      )}

      <CornerLogo />

      <Modal open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Меню">
        <nav className="flex flex-col gap-1" aria-label="Главная навигация">
          {user && navItems.map((it) => {
            const active = isNavActive(it);
            return (
              <Link
                key={it.to}
                to={it.to}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  "px-3 py-2 rounded text-sm flex items-center gap-2",
                  active
                    ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                    : "hover:bg-[var(--color-bg-muted)]",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className="grid place-items-center w-5 h-5 shrink-0">{it.icon}</span>
                <span className="flex-1">{it.label}</span>
                {it.badge}
              </Link>
            );
          })}
          {!user && (
            <Link
              to="/login"
              onClick={() => setDrawerOpen(false)}
              className="px-3 py-2 rounded text-sm hover:bg-[var(--color-bg-muted)]"
            >
              Войти
            </Link>
          )}
        </nav>
      </Modal>
    </div>
  );
}

interface HeaderNavItemProps {
  it: NavSpec;
  active: boolean;
}

/**
 * Пункт горизонтальной навигации в header.
 * Всегда отображается как icon + label. `shrink-0` запрещает сжатие -
 * именно за счёт этого измерение scrollWidth/clientWidth даёт точный
 * результат переполнения, и алгоритм навигации решает, что вынести в «Ещё».
 */
function HeaderNavItem({ it, active }: HeaderNavItemProps) {
  return (
    <RouterNavLink
      to={it.to}
      end={!it.matchChildren}
      className={() =>
        cn(
          "h-9 rounded-md text-sm font-medium transition shrink-0 whitespace-nowrap",
          "inline-flex items-center gap-1.5 px-2 lg:px-3",
          active
            ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]",
        )
      }
      title={it.label}
      aria-label={it.label}
      aria-current={active ? "page" : undefined}
    >
      {it.icon}
      <span className="truncate min-w-0">{it.label}</span>
      {it.badge}
    </RouterNavLink>
  );
}
