import { useEffect } from "react";
import { isTauri, tauriCommands } from "./tauri";

/**
 * Calls `block_sleep` on enter, `unblock_sleep` on unmount or beforeunload.
 * Web-mode is a no-op so the same code runs in `bun run dev`.
 */
export function useSleepBlocker(active: boolean = true): void {
  useEffect(() => {
    if (!active || !isTauri()) return;
    let cancelled = false;
    (async () => {
      try {
        await tauriCommands.blockSleep();
      } catch {
        /* permissions / OS not supporting it — ignore */
      }
    })();
    return () => {
      if (cancelled) return;
      cancelled = true;
      (async () => {
        try {
          await tauriCommands.unblockSleep();
        } catch {
          /* ignore */
        }
      })();
    };
  }, [active]);
}
