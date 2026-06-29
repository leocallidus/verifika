import { create } from "zustand";
import axios from "axios";
import { api, getToken, setToken, API_URL } from "../api/client";
import { mediaUrl } from "../lib/media-url";
import { isTauri, tauriCommands } from "../lib/tauri";
import type { LoginResponse, Role, UserOut } from "../types/api";

interface AuthState {
  user: UserOut | null;
  loading: boolean;
  backendError: boolean;
  backendErrorDetail: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<UserOut>;
  logout: () => void;
  resetBackendError: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  backendError: false,
  backendErrorDetail: null,

  resetBackendError() {
    set({ backendError: false, backendErrorDetail: null, loading: true });
  },

  async hydrate() {
    try {
      await axios.get(`${API_URL}/api/health`, { timeout: 5000 });
      set({ backendError: false, backendErrorDetail: null });
    } catch (err: any) {
      console.error("Backend health check failed:", err);
      const detail = err.message || String(err);
      set({
        backendError: true,
        backendErrorDetail: `Could not connect to ${API_URL.replace(/^https?:\/\//, "")}: ${detail}`,
        loading: false,
      });
      return;
    }

    const t = getToken();
    if (!t) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const { data } = await api.get<UserOut>("/api/auth/me");
      set({ user: normalizeUser(data), loading: false });
    } catch {
      setToken(null);
      set({ user: null, loading: false });
    }
  },
  async login(email, password) {
    const trimmed = (email ?? "").trim();

    const client_info: any = {
      client_kind: isTauri() ? "tauri" : "web",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    };
    if (isTauri()) {
      try {
        const info = await tauriCommands.deviceInfo();
        client_info.device_name = info.device_name;
        client_info.os_name = info.os_name;
        client_info.os_version = info.os_version;
        client_info.app_version = info.app_version;
      } catch (e) {
        console.warn("Failed to fetch device info:", e);
      }
    }

    const payload: any = {
      password,
      client_info,
    };
    if (trimmed.includes("@")) {
      payload.email = trimmed.toLowerCase();
    } else {
      // Логин сравнивается на сервере в нижнем регистре — нормализуем на клиенте,
      // чтобы `Sidorov` и `sidorov` работали одинаково.
      payload.identifier = trimmed.toLowerCase();
    }
    const { data } = await api.post<LoginResponse>("/api/auth/login", payload);
    setToken(data.access_token);
    const user = normalizeUser(data.user);
    set({ user, loading: false });
    return user;
  },
  async logout() {
    try {
      await api.post("/api/auth/logout");
    } catch (e) {
      console.warn("Backend logout failed:", e);
    }
    setToken(null);
    set({ user: null });
    location.href = "/login";
  },
}));

function normalizeUser(user: UserOut): UserOut {
  return {
    ...user,
    avatar_url: mediaUrl(user.avatar_url) ?? null,
  };
}

export function roleHome(role: Role): string {
  if (role === "admin") return "/admin";
  if (role === "teacher") return "/teacher";
  return "/student";
}
