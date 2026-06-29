import { useEffect, useRef } from "react";
import { isTauri, tauriCommands, tauriEvents } from "./tauri";

/**
 * Maintains a numbered badge on the system tray icon based on the count of
 * "unread" notifications (severity >= 1) currently held in the React
 * notifications store. We don't read the store directly; the caller passes
 * the latest count whenever it changes.
 */
export function useTrayCount(count: number): void {
  const lastSentRef = useRef<number>(-1);

  useEffect(() => {
    if (!isTauri()) return;
    if (lastSentRef.current === count) return;
    lastSentRef.current = count;
    (async () => {
      try {
        await tauriCommands.setTrayCount(count);
      } catch {
        /* tray feature missing on platform — ignore */
      }
    })();
  }, [count]);

  // React to upstream count changes (e.g. tray icon runtime resets to 0).
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      const off = await tauriEvents.onTrayCountChanged((c) => {
        if (!cancelled) lastSentRef.current = c;
      });
      if (cancelled) off();
      return off;
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
