import { create } from "zustand";
import type { NotificationOut } from "../types/api";

interface NotificationsState {
  items: NotificationOut[];
  connected: boolean;
  setConnected: (v: boolean) => void;
  push: (n: NotificationOut) => void;
  markRead: (id: number) => void;
  clear: () => void;
}

export const useNotifications = create<NotificationsState>((set) => ({
  items: [],
  connected: false,
  setConnected: (v) => set({ connected: v }),
  push: (n) => set((s) => ({ items: [n, ...s.items].slice(0, 100) })),
  markRead: (id) =>
    set((s) => {
      const target = s.items.find((it) => it.notification_id === id);
      if (!target || target.read_at) return s;
      return {
        items: s.items.map((it) => (it.notification_id === id ? { ...it, read_at: new Date().toISOString() } : it)),
      };
    }),
  clear: () => set({ items: [], connected: false }),
}));
