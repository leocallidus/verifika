import { create } from "zustand";
import { isTauri, tauriCommands } from "./tauri";

export type NotificationLevel = "info" | "warn" | "alert";

export interface SystemNotificationSettings {
  enabled: boolean;
  severity: Record<NotificationLevel, boolean>;
}

interface SystemNotificationStore extends SystemNotificationSettings {
  setEnabled: (enabled: boolean) => void;
  setSeverity: (level: NotificationLevel, enabled: boolean) => void;
  hydrate: () => void;
}

export type BrowserPermissionState =
  | NotificationPermission
  | "unsupported"
  | "tauri";

export interface SystemNotificationInput {
  title: string;
  body?: string;
  link?: string;
  severity?: number;
}

const STORAGE_KEY = "verifika:system-notifications";

const defaultSettings: SystemNotificationSettings = {
  enabled: true,
  severity: { info: false, warn: true, alert: true },
};

function normalizeSettings(value: unknown): SystemNotificationSettings {
  if (!value || typeof value !== "object") return defaultSettings;
  const raw = value as Partial<SystemNotificationSettings>;
  return {
    enabled: raw.enabled ?? defaultSettings.enabled,
    severity: {
      info: raw.severity?.info ?? defaultSettings.severity.info,
      warn: raw.severity?.warn ?? defaultSettings.severity.warn,
      alert: raw.severity?.alert ?? defaultSettings.severity.alert,
    },
  };
}

function readSettings(): SystemNotificationSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    return normalizeSettings(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"));
  } catch {
    return defaultSettings;
  }
}

function writeSettings(settings: SystemNotificationSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useSystemNotificationSettings = create<SystemNotificationStore>((set, get) => ({
  ...readSettings(),
  setEnabled(enabled) {
    const next = { enabled, severity: get().severity };
    writeSettings(next);
    set({ enabled });
  },
  setSeverity(level, enabled) {
    const next = {
      enabled: get().enabled,
      severity: { ...get().severity, [level]: enabled },
    };
    writeSettings(next);
    set({ severity: next.severity });
  },
  hydrate() {
    set(readSettings());
  },
}));

export function notificationLevel(severity?: number): NotificationLevel {
  if ((severity ?? 0) >= 2) return "alert";
  if ((severity ?? 0) >= 1) return "warn";
  return "info";
}

export function browserNotificationPermission(): BrowserPermissionState {
  if (isTauri()) return "tauri";
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserPermissionState> {
  if (isTauri()) return "tauri";
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return "unsupported";
  }
}

export function canShowSystemNotification(severity?: number): boolean {
  const { enabled, severity: severitySettings } = useSystemNotificationSettings.getState();
  if (!enabled) return false;
  return severitySettings[notificationLevel(severity)];
}

export async function showSystemNotification(input: SystemNotificationInput): Promise<boolean> {
  if (!canShowSystemNotification(input.severity)) return false;

  const title = input.title || "Верифика";
  const body = input.body || "";

  try {
    if (isTauri()) {
      await tauriCommands.notify(title, body, input.link);
      return true;
    }

    if (browserNotificationPermission() !== "granted") return false;

    const notification = new Notification(title, {
      body,
      tag: input.link || `${title}:${body}`,
    });

    if (input.link) {
      notification.onclick = () => {
        window.focus();
        window.location.href = input.link!;
        notification.close();
      };
    }

    return true;
  } catch {
    return false;
  }
}
