import { saveAs } from "file-saver";
import { api } from "./client";
import {
  isTauri,
  tauriCommands,
  tauriEvents,
} from "../lib/tauri";
import { createElement } from "react";
import { ExternalLink } from "lucide-react";
import { useToasts } from "../components/ui/Toast";

/**
 * Save a Blob to disk.
 *   — In Tauri: persists the bytes through the native `save_download` Rust
 *     command (unscoped `std::fs`) into the user-configured download dir, fires
 *     an OS notification, and shows a toast whose "Open" action invokes the
 *     native file handler via `open_path` on the real returned path.
 *   — In a plain web browser: falls back to `file-saver`'s `saveAs()`, with an
 *     "Open" action that streams the blob into a new tab.
 */
export async function downloadBlob(path: string, fallbackName: string) {
  const res = await api.get(path, { responseType: "blob" });
  const cd = res.headers["content-disposition"] as string | undefined;
  let name = fallbackName;
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i.exec(cd);
    if (m) name = decodeURIComponent(m[1]);
  }

  const fileExt = name.split(".").pop()?.toLowerCase() || "";
  const isTargetType = ["pdf", "csv", "xls", "xlsx"].includes(fileExt);

  // Browser-style toast whose "Open" action streams the blob into a new tab.
  // This only works in a real browser — inside a Tauri webview `window.open`
  // on a blob URL is a no-op, so we never use it on the Tauri path.
  const pushBrowserToast = () => {
    if (!isTargetType) return;
    useToasts.getState().push("success", `Файл «${name}» сохранен`, 8000, {
      label: "Открыть",
      icon: createElement(ExternalLink, { className: "w-3.5 h-3.5" }),
      onClick: () => {
        const url = URL.createObjectURL(res.data as Blob);
        window.open(url, "_blank");
      },
    });
  };

  if (isTauri()) {
    try {
      // Persist natively via a Rust command (std::fs, unscoped) so we always
      // get back a real on-disk path the OS file handler can open. Passing a
      // plain number[] keeps the IPC payload JSON-serialisable.
      const bytes = Array.from(new Uint8Array(await (res.data as Blob).arrayBuffer()));
      const fullPath = await tauriCommands.saveDownload(name, bytes);
      await tauriCommands.notify("Файл сохранён", name, fullPath);
      if (isTargetType) {
        useToasts.getState().push(
          "success",
          `Файл «${name}» сохранен в папку Загрузки`,
          8000,
          {
            label: "Открыть",
            icon: createElement(ExternalLink, { className: "w-3.5 h-3.5" }),
            onClick: async () => {
              await tauriCommands.openPath(fullPath);
            },
          },
        );
      }
      return { ok: true, mode: "tauri" as const, name, path: fullPath };
    } catch (e) {
      // Last-ditch fallback: let the webview save it the browser way. The
      // "Open" button is omitted because the native path is unavailable.
      console.warn("save_download failed, falling back to saveAs", e);
      saveAs(res.data as Blob, name);
      return { ok: true, mode: "browser" as const, name };
    }
  }

  saveAs(res.data as Blob, name);
  pushBrowserToast();
  return { ok: true, mode: "browser" as const, name };
}

/**
 * Subscribe to backend broadcasts about download path changes — used by the
 * Settings page and by the live-stronghold login (when the user picks a new
 * download dir at runtime).
 */
export function onDownloadPathChanged(cb: (path: string) => void) {
  return tauriEvents.onDownloadChanged(cb);
}
