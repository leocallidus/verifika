/**
 * Tauri-2 capability adapter. Exposes a strictly typed surface for invoking
 * the Rust commands defined in `src-tauri/src/lib.rs`. Code outside `lib/tauri.ts`
 * MUST NOT touch `window.__TAURI__` directly; instead import helpers here and
 * fall back to web-mode behaviour when running outside Tauri (e.g. `bun run dev`).
 */

declare global {
  interface Window {
    __TAURI__?: {
      core: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
      event: { listen: <T>(event: string, handler: (e: { payload: T }) => void) => Promise<() => void> };
    };
    isTauri?: boolean;
  }
}

export const isTauri = (): boolean =>
  typeof window !== "undefined" && Boolean(window.__TAURI__);

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error(`tauri cmd '${cmd}' called outside Tauri runtime`);
  }
  return window.__TAURI__!.core.invoke<T>(cmd, args);
}

async function listen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const off = await window.__TAURI__!.event.listen<T>(event, (e) => handler(e.payload));
  return off;
}

// --- commands -------------------------------------------------------------

export interface UpdateStatus {
  available: boolean;
  version?: string;
}

export interface DeviceInfo {
  device_name?: string;
  os_name?: string;
  os_version?: string;
  arch?: string;
  app_version?: string;
}

export const tauriCommands = {
  pickDownloadDir: () => invoke<string | null>("pick_download_dir"),
  currentDownloadDir: () => invoke<string>("current_download_dir"),
  setDownloadDir: (path: string) => invoke<void>("set_download_dir", { payload: { path } }),
  openPath: (path: string) => invoke<void>("open_path", { payload: { path } }),
  /** Persist exported bytes natively and return the absolute path written. */
  saveDownload: (name: string, bytes: number[]) =>
    invoke<string>("save_download", { payload: { name, bytes } }),
  notify: (title: string, body: string, url?: string) =>
    invoke<void>("notify_event", { payload: { title, body, url } }),
  setTrayCount: (count: number) => invoke<void>("set_tray_count", { payload: { count } }),
  blockSleep: () => invoke<void>("block_sleep"),
  unblockSleep: () => invoke<void>("unblock_sleep"),
  setWindowTitle: (title: string) =>
    invoke<void>("set_window_title", { payload: { title } }),
  quitApp: () => invoke<void>("quit_app"),
  updateStatus: () => invoke<UpdateStatus>("update_status"),
  triggerUpdate: () => invoke<void>("trigger_update"),
  setAntiScreenshot: (enabled: boolean) => invoke<void>("set_anti_screenshot", { enabled }),
  detectScreenshotTools: () => invoke<boolean>("detect_screenshot_tools"),
  deviceInfo: () => invoke<DeviceInfo>("device_info").catch(() => ({} as DeviceInfo)),
};

// --- events (webview ← Rust) ---------------------------------------------

export interface DeepLinkPayload {
  urls: string[];
}

export interface CliArgsPayload {
  argv: string[];
}

export interface TrayCountChanged {
  count: number;
}

export const tauriEvents = {
  onDownloadChanged: (cb: (path: string) => void) =>
    tauriListen<string>("verifika://download/changed", cb),
  onSleepBlocked: (cb: (n: number) => void) =>
    tauriListen<number>("verifika://sleep/blocked", cb),
  onSleepCleared: (cb: (n: number) => void) =>
    tauriListen<number>("verifika://sleep/cleared", cb),
  onUpdateInstalled: (cb: (version: string) => void) =>
    tauriListen<string>("verifika://update/installed", cb),
  onTrayAction: (cb: (action: string) => void) =>
    tauriListen<string>("verifika://tray/action", cb),
  onTrayCountChanged: (cb: (count: number) => void) =>
    tauriListen<TrayCountChanged>("verifika://tray/count-changed", (p) =>
      cb(typeof p === "number" ? p : (p as { count: number }).count),
    ),
  onDeepLink: (cb: (urls: string[]) => void) =>
    tauriListen<DeepLinkPayload>("verifika://deep-link", (p) =>
      cb(Array.isArray(p) ? (p as string[]) : (p as { urls: string[] }).urls ?? []),
    ),
  onCliArgs: (cb: (argv: string[]) => void) =>
    tauriListen<CliArgsPayload>("verifika://cli-args", (p) =>
      cb(Array.isArray(p) ? (p as string[]) : (p as { argv: string[] }).argv ?? []),
    ),
  onFocusLost: (cb: () => void) =>
    tauriListen<void>("verifika://tauri/focus-lost", cb),
  onFocusGained: (cb: () => void) =>
    tauriListen<void>("verifika://tauri/focus-gained", cb),
};


async function tauriListen<T>(
  event: string,
  cb: (payload: T) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  return listen<T>(event, cb);
}

/**
 * Parse a deep-link URL of the form `verifika://<route>/<id>?query` into a tuple.
 * Returns null for non-verifika-scheme URLs.
 */
export function parseStsDeepLink(url: string): { route: string; id?: string; query: URLSearchParams } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "verifika:") return null;
    const parts = u.host ? [`${u.host}${u.pathname}`] : [];
    const [route, id] = parts.join("/").split("/").filter(Boolean);
    return { route: route || "", id, query: u.searchParams };
  } catch {
    return null;
  }
}
