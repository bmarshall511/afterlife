"use client";
/**
 * Phone-only opt-in cues. Off by default; sound only after an explicit tap (unlocks AudioContext).
 * Vibration is feature-detected (iOS Safari has no navigator.vibrate → silent no-op).
 * The TV never imports this.
 */
const KEY = "afterlife.cues";
let ctx: AudioContext | null = null;

export function cuesEnabled(): boolean {
  try { return localStorage.getItem(KEY) === "on"; } catch { return false; }
}
export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}
/** Must be called from a user gesture handler. */
export function setCues(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
  if (on) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC && !ctx) ctx = new AC();
      void ctx?.resume();
      cue("tap");
    } catch { ctx = null; }
  }
}
export type CueKind = "tap" | "open" | "saved" | "correct" | "incorrect";
const TONES: Record<CueKind, [number, number][]> = {
  tap: [[660, 0.05]], open: [[523, 0.09], [784, 0.12]], saved: [[880, 0.07]],
  correct: [[523, 0.08], [659, 0.08], [784, 0.16]], incorrect: [[330, 0.16]],
};
export function cue(kind: CueKind): void {
  if (!cuesEnabled()) return;
  try { if (canVibrate()) navigator.vibrate(kind === "incorrect" ? [60, 40, 60] : kind === "tap" ? 15 : 35); } catch { /* ignore */ }
  if (!ctx || ctx.state !== "running") return;
  let t = ctx.currentTime;
  for (const [f, d] of TONES[kind]) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + 0.02); t += d;
  }
}
