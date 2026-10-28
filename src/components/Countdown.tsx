"use client";
import { useServerNow } from "@/client/store";

export function remaining(endsAt: number | null | undefined, now: number): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function Countdown({ endsAt, offsetMs, className, paused }: { endsAt: number | null | undefined; offsetMs: number; className?: string; paused?: boolean }) {
  const now = useServerNow(offsetMs);
  if (paused) return <div className={`countdown ${className ?? ""}`} aria-label="Paused">‖</div>;
  if (!endsAt) return null;
  const s = remaining(endsAt, now);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <div className={`countdown ${s <= 5 ? "urgent" : ""} ${className ?? ""}`} role="timer" aria-label={`${s} seconds left`}>
      {mm}:{ss}
    </div>
  );
}
