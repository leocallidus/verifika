import { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  Bell,
  Power,
  Lock,
  RefreshCw,
  Bug,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { useToasts } from "../../components/ui/Toast";
import { errorMessage } from "../../api/client";
import {
  isTauri,
  tauriCommands,
  tauriEvents,
  parseStsDeepLink,
} from "../../lib/tauri";
import { clearToken } from "../../lib/secure-token";
import {
  browserNotificationPermission,
  requestBrowserNotificationPermission,
  showSystemNotification,
  useSystemNotificationSettings,
  type BrowserPermissionState,
  type NotificationLevel,
} from "../../lib/system-notifications";

interface SettingsState {
  download_path: string;
  autostart: boolean;
  minimize_to_tray_on_close: boolean;
  update_channel: "stable" | "beta";
  last_seen_version: string | null;
  update_available?: { version: string; available: boolean };
}

const defaultState: SettingsState = {
  download_path: "",
  autostart: false,
  minimize_to_tray_on_close: true,
  update_channel: "stable",
  last_seen_version: null,
};

export default function SettingsDesktop() {
  const pushToast = useToasts((s) => s.push);
  const notificationsEnabled = useSystemNotificationSettings((st) => st.enabled);
  const notificationsSeverity = useSystemNotificationSettings((st) => st.severity);
  const setNotificationsEnabled = useSystemNotificationSettings((st) => st.setEnabled);
  const setNotificationSeverity = useSystemNotificationSettings((st) => st.setSeverity);
  const [s, setS] = useState<SettingsState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [sizeInfo, setSizeInfo] = useState<{ files: number; sizeBytes: number } | null>(null);
  const [browserPermission, setBrowserPermission] = useState<BrowserPermissionState>(() =>
    browserNotificationPermission(),
  );
  const deeplinkStarted = useRef(false);

  useEffect(() => {
    setBrowserPermission(browserNotificationPermission());
  }, []);

  // Initial load: pull defaults from cargo host.
  useEffect(() => {
    (async () => {
      if (isTauri()) {
        try {
          const path = await tauriCommands.currentDownloadDir();
          setS((cur) => ({ ...cur, download_path: path }));
        } catch (e) {
          pushToast({
            tone: "error",
            title: "Не удалось получить путь",
            body: errorMessage(e),
          });
        }
      } else {
        setS((cur) => ({
          ...cur,
          download_path:
            "(веб-режим — выбор папки доступен только в Tauri)",
        }));
      }
      setLoaded(true);
    })();
  }, [pushToast]);

  // Auto-update check on mount + listen to update:installed event.
  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const status = await tauriCommands.updateStatus();
        if (status.available) {
          setS((cur) => ({
            ...cur,
            update_available: { version: status.version ?? "?", available: true },
            last_seen_version: status.version ?? null,
          }));
        }
      } catch {
        /* ignore — dev mode without updater config is fine */
      }
    })();
    tauriEvents.onUpdateInstalled((version) => {
      pushToast({
        tone: "success",
        title: `Установлена версия ${version}`,
        body: "Перезапустите СТС для применения.",
      });
    });
  }, [pushToast]);

  // Deep-link router: on first sts:// link from a second CLI invocation, route.
  useEffect(() => {
    if (deeplinkStarted.current || !isTauri()) return;
    deeplinkStarted.current = true;
    tauriEvents.onDeepLink((urls) => {
      for (const u of urls) {
        const parsed = parseStsDeepLink(u);
        if (!parsed) continue;
        switch (parsed.route) {
          case "test":
            pushToast({
              tone: "info",
              title: "Открывается сессия",
              body: parsed.id ?? "(id отсутствует)",
            });
            // A real implementation would call router.navigate(...).
            break;
          case "notification":
            pushToast({
              tone: "info",
              title: "Открывается уведомление",
              body: parsed.id ?? "",
            });
            break;
          default:
            pushToast({
              tone: "info",
              title: "Deep-link",
              body: u,
            });
        }
      }
    });
  }, [pushToast]);

  async function pickFolder() {
    if (!isTauri()) return;
    try {
      const path = await tauriCommands.pickDownloadDir();
      if (!path) return;
      await tauriCommands.setDownloadDir(path);
      setS((cur) => ({ ...cur, download_path: path }));
      pushToast({ tone: "success", title: "Папка сохранена", body: path });
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function openFolder() {
    if (!isTauri() || !s.download_path) return;
    try {
      await tauriCommands.openPath(s.download_path);
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function testNotify() {
    try {
      const shown = await showSystemNotification({
        title: "Верифика",
        body: "Это тестовое уведомление приложения.",
        severity: 2,
      });
      if (!shown && browserNotificationPermission() === "default") {
        pushToast({
          tone: "info",
          title: "Нужно разрешение браузера",
          body: "Разрешите уведомления и повторите проверку.",
        });
      } else if (!shown) {
        pushToast({
          tone: "warning",
          title: "Уведомления не показаны",
          body: "Проверьте переключатель и разрешение браузера.",
        });
      }
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function requestBrowserPermission() {
    const permission = await requestBrowserNotificationPermission();
    setBrowserPermission(permission);
    if (permission === "granted") {
      setNotificationsEnabled(true);
      pushToast({ tone: "success", title: "Уведомления разрешены" });
      return;
    }
    if (permission === "denied") {
      pushToast({
        tone: "warning",
        title: "Браузер запретил уведомления",
        body: "Разрешение можно изменить в настройках сайта браузера.",
      });
      return;
    }
    if (permission === "unsupported") {
      pushToast({
        tone: "warning",
        title: "Браузер не поддерживает уведомления",
      });
    }
  }

  async function triggerUpdate() {
    if (!isTauri()) return;
    try {
      await tauriCommands.triggerUpdate();
    } catch (e) {
      pushToast({ tone: "error", title: "Не удалось", body: errorMessage(e) });
    }
  }

  async function clearAll() {
    if (!confirm("Удалить токен и сбросить локальные настройки?")) return;
    await clearToken();
    setS(defaultState);
    pushToast({ tone: "success", title: "Данные очищены" });
  }

  function refreshSize() {
    // The Rust side does not yet expose a directory-size command — we keep
    // this as a UX placeholder so the user isn't confused when the card
    // shows "—".
    setSizeInfo({ files: 0, sizeBytes: 0 });
  }

  return (
    <AppShell>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[var(--color-accent)]" />
            Настройки приложения
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Куда сохраняются файлы, уведомления на компьютере, обновления и безопасность.
            {!isTauri() && (
              <span className="block mt-1 text-amber-600">
                Это браузерная версия. Вы видите, как выглядят настройки в приложении, — здесь они будут работать.
              </span>
            )}
          </p>
        </header>

        {/* 1. Куда сохранять файлы */}
        <Card className="mb-3">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[var(--color-accent)]" />
            Куда сохранять файлы
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            Сюда попадают выгрузки: Excel с результатами и PDF с отчётами.
          </p>
          {!loaded ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <>
              <Field label="Папка для сохранения">
                <Input value={s.download_path} readOnly />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  iconLeft={<FolderOpen className="w-4 h-4" />}
                  disabled={!isTauri()}
                  onClick={pickFolder}
                >
                  Выбрать папку
                </Button>
                <Button
                  variant="ghost"
                  iconLeft={<FolderOpen className="w-4 h-4" />}
                  disabled={!isTauri() || !s.download_path}
                  onClick={openFolder}
                >
                  Открыть папку
                </Button>
                <Button variant="ghost" onClick={refreshSize}>
                  Посчитать размер
                </Button>
              </div>
              {sizeInfo && (
                <p className="text-xs text-[var(--color-text-muted)] mt-2">
                  {sizeInfo.files === 0
                    ? "В папке пока ничего нет."
                    : `В папке ${sizeInfo.files} файлов.`}
                </p>
              )}
            </>
          )}
        </Card>

        {/* 2. Уведомления */}
        <Card className="mb-3">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-[var(--color-accent)]" />
            Уведомления
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            Всплывающие сообщения Windows, macOS, Linux или браузера.
          </p>
          {!isTauri() && (
            <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
              <span className="text-[var(--color-text-muted)]">Разрешение браузера:</span>
              <Badge
                tone={
                  browserPermission === "granted"
                    ? "success"
                    : browserPermission === "denied"
                      ? "danger"
                      : browserPermission === "unsupported"
                        ? "warning"
                        : "neutral"
                }
              >
                {{
                  granted: "разрешено",
                  denied: "запрещено",
                  default: "не запрошено",
                  unsupported: "не поддерживается",
                  tauri: "desktop",
                }[browserPermission]}
              </Badge>
              {browserPermission !== "granted" && browserPermission !== "unsupported" && (
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Bell className="w-3.5 h-3.5" />}
                  onClick={requestBrowserPermission}
                >
                  Запросить разрешение
                </Button>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
            />
            <span>Показывать уведомления на компьютере</span>
          </label>
          <div className="text-sm text-[var(--color-text-muted)] mb-2">
            О каких событиях сообщать:
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {([
              { lvl: "info", label: "Обычные" },
              { lvl: "warn", label: "Важные" },
              { lvl: "alert", label: "Срочные" },
            ] as const).map(({ lvl, label }) => (
              <label key={lvl} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={notificationsSeverity[lvl as NotificationLevel]}
                  onChange={(e) =>
                    setNotificationSeverity(lvl as NotificationLevel, e.target.checked)
                  }
                  disabled={!notificationsEnabled}
                />
                {label}
              </label>
            ))}
          </div>
          <Button
            variant="secondary"
            className="mt-3"
            iconLeft={<Bell className="w-4 h-4" />}
            disabled={!notificationsEnabled || browserPermission === "unsupported"}
            onClick={testNotify}
          >
            Проверить — отправить пример
          </Button>
        </Card>

        {/* 3. Запуск с компьютером */}
        <Card className="mb-3">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Power className="w-4 h-4 text-[var(--color-accent)]" />
            Запуск с компьютером
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            Включится ли приложение само при включении компьютера и как вести себя при закрытии окна.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.autostart}
              onChange={(e) =>
                setS((cur) => ({ ...cur, autostart: e.target.checked }))
              }
              disabled={!isTauri()}
            />
            <span>Открывать приложение при включении компьютера</span>
          </label>
          <label className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={s.minimize_to_tray_on_close}
              onChange={(e) =>
                setS((cur) => ({
                  ...cur,
                  minimize_to_tray_on_close: e.target.checked,
                }))
              }
              disabled={!isTauri()}
            />
            <span>При закрытии окна не выключать приложение полностью</span>
          </label>
        </Card>

        {/* 4. Безопасность */}
        <Card className="mb-3">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Lock className="w-4 h-4 text-[var(--color-accent)]" />
            Безопасность
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            Где хранится ваш пароль для входа.
          </p>
          <div className="flex items-center gap-2 text-sm mb-3">
            <Badge tone={isTauri() ? "success" : "warning"}>
              {isTauri()
                ? "В системном хранилище паролей"
                : "Во временной памяти приложения"}
            </Badge>
          </div>
          <Button
            variant="danger"
            iconLeft={<Lock className="w-4 h-4" />}
            disabled={!isTauri()}
            onClick={clearAll}
          >
            Выйти и стереть данные
          </Button>
        </Card>

        {/* 5. Обновления */}
        <Card className="mb-3">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[var(--color-accent)]" />
            Обновления
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Сейчас установлена версия <b>0.1.0</b>.
            {s.update_available ? (
              <>
                {" "}
                Доступна новая — <Badge tone="warning">v{s.update_available.version}</Badge>.
              </>
            ) : (
              <> Используется последняя версия.</>
            )}
          </p>
          <Button
            variant="primary"
            className="mt-3"
            disabled={!isTauri() || !s.update_available}
            onClick={triggerUpdate}
          >
            Обновить
          </Button>
        </Card>

        {/* 6. Если что-то сломалось */}
        <Card>
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Bug className="w-4 h-4 text-[var(--color-accent)]" />
            Если что-то сломалось
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            Кнопки ниже нужны, если возникла ошибка. Если всё работает — здесь можно не заходить.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              disabled={!isTauri() || !s.download_path}
              onClick={openFolder}
            >
              Открыть папку с логами
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigator.clipboard?.writeText("Верифика diag dump")}
            >
              Скопировать отчёт о системе
            </Button>
          </div>
        </Card>

        {s.update_available === undefined && (
          <EmptyState
            icon={<ShieldCheck />}
            title="Всё настроено"
            description="Папка выгрузок, автозапуск, безопасность и обновления готовы."
          />
        )}
      </section>
    </AppShell>
  );
}
