import { useLocation } from "react-router-dom";
import { cn } from "../lib/cn";
import { useBranding } from "../store/branding";

/**
 * Логотип колледжа в правом нижнем углу — только на странице авторизации.
 * Адаптация под темы:
 *   — карточка с прозрачным elevated-bg + лёгкая блюр-подсветка,
 *   — в светлой теме: без фильтра;
 *   — в тёмной теме: небольшое осветление/усиление насыщенности через CSS-фильтр,
 *     чтобы логотип не «выжигал» экран на тёмном фоне.
 */
export function CornerLogo() {
  const location = useLocation();
  const branding = useBranding((s) => s.branding);
  const isLogin = location.pathname === "/login";

  if (!isLogin || branding?.institution_logo_enabled === false || !branding?.institution_logo_url) return null;

  const size = branding.institution_logo_display_size_px || 56;

  return (
    <a
      aria-label="Логотип колледжа"
      title="Колледж"
      className={cn(
        "fixed z-30 select-none",
        "bottom-3 right-3 sm:bottom-4 sm:right-4",
        "rounded-lg overflow-hidden",
        "bg-[var(--color-bg-elevated)]/85 backdrop-blur",
        "border border-[var(--color-border)] shadow-sm",
        "transition hover:scale-105 hover:shadow-md",
      )}
    >
      <img
        src={branding.institution_logo_url}
        alt="Колледж"
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={cn(
          "block object-contain",
          // тёмная тема: лёгкое осветление и насыщение,
          // чтобы логотип не выглядел как тёмное пятно.
          "dark:brightness-110 dark:contrast-105 dark:saturate-110",
        )}
        style={{ width: size, height: size }}
      />
    </a>
  );
}
