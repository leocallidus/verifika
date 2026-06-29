import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "../lib/cn";

function fmt(seconds: number): string {
  const m = Math.max(0, Math.floor(seconds / 60));
  const s = Math.max(0, seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function Timer({
  expiresAtIso,
  onExpire,
  onFiveMinutesLeft,
  onOneMinuteLeft,
  size = "md",
}: {
  expiresAtIso: string;
  onExpire?: () => void;
  onFiveMinutesLeft?: () => void;
  onOneMinuteLeft?: () => void;
  size?: "sm" | "md";
}) {
  const target = new Date(expiresAtIso).getTime();
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(false);
  const fired5Min = useRef(false);
  const fired1Min = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remain = Math.max(0, Math.floor((target - now) / 1000));

  useEffect(() => {
    if (remain === 0 && !firedRef.current && onExpireRef.current) {
      firedRef.current = true;
      onExpireRef.current();
    }
    if (remain <= 300 && remain > 0 && !fired5Min.current) {
      fired5Min.current = true;
      if (onFiveMinutesLeft) onFiveMinutesLeft();
    }
    if (remain <= 60 && remain > 0 && !fired1Min.current) {
      fired1Min.current = true;
      if (onOneMinuteLeft) onOneMinuteLeft();
    }
  }, [remain, onFiveMinutesLeft, onOneMinuteLeft]);

  const danger = remain <= 60;
  const warning = remain <= 300;
  const sizeCls = size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";

  return (
    <div
      role="timer"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 font-mono font-semibold rounded-md border tabular-nums transition-colors duration-300",
        sizeCls,
        danger
          ? "bg-[var(--color-danger-bg)] border-[var(--color-danger)]/30 text-[var(--color-danger)] animate-pulse"
          : warning
          ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-500 animate-[pulse_1.5s_infinite]"
          : "bg-[var(--color-bg-muted)] border-[var(--color-border)] text-[var(--color-text-primary)]",
      )}
    >
      <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
      <span>{fmt(remain)}</span>
    </div>
  );
}

