"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PartyId, Snapshot } from "@/shared/types";

export interface SnapshotState {
  snapshot: Snapshot | null;
  online: boolean;        // false after a failed poll until the next success
  offsetMs: number;       // serverNow - local now (display only)
  error: string | null;
}

/**
 * Resilient polling of GET /api/state. Sends ?v=<version>; 204 = unchanged.
 * Backoff doubles on failure (cap 15s). Pauses fetch cadence while hidden, refreshes on focus/visibility.
 */
export function useSnapshot(party: PartyId, opts: { intervalMs: number; mock?: string | null; audience?: "tv" | "phone" }): SnapshotState {
  const [state, setState] = useState<SnapshotState>({ snapshot: null, online: true, offsetMs: 0, error: null });
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    // Dev-only fixtures. The NODE_ENV check is compiled out in production, so the mocks chunk is never emitted.
    if (opts.mock && process.env.NODE_ENV !== "production") {
      const name = opts.mock;
      import("./mocks").then((m) => setState({ snapshot: m.mockSnapshot(name), online: name !== "offline", offsetMs: 0, error: null }));
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let ctrl: AbortController | null = null;

    const schedule = (ms: number) => { if (!stopped) { if (timer) clearTimeout(timer); timer = setTimeout(poll, ms); } };

    async function poll() {
      ctrl?.abort();
      ctrl = new AbortController();
      const v = ref.current.snapshot?.version;
      const t0 = Date.now();
      try {
        const res = await fetch(`/api/state?party=${party}&audience=${opts.audience ?? "phone"}${v != null ? `&v=${v}` : ""}`, { cache: "no-store", signal: ctrl.signal });
        if (res.status === 204) {
          failures = 0;
          if (!ref.current.online) setState((s) => ({ ...s, online: true, error: null }));
        } else if (res.ok) {
          const snap = (await res.json()) as Snapshot;
          const rtt = Date.now() - t0;
          const offsetMs = snap.serverNow - (t0 + rtt / 2);
          failures = 0;
          setState({ snapshot: snap, online: true, offsetMs, error: null });
        } else {
          throw new Error("HTTP " + res.status);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError" && stopped) return;
        failures++;
        setState((s) => ({ ...s, online: false, error: (e as Error).message }));
      }
      const base = document.visibilityState === "hidden" ? Math.max(opts.intervalMs, 5000) : opts.intervalMs;
      schedule(failures ? Math.min(15000, base * 2 ** Math.min(failures, 4)) : base);
    }
    const wake = () => { if (document.visibilityState === "visible") schedule(0); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    poll();
    return () => {
      stopped = true; ctrl?.abort(); if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    };
  }, [party, opts.intervalMs, opts.mock, opts.audience]);

  return state;
}

/* ---------- shared clock: one ticking source for all countdowns ---------- */
let listeners = new Set<() => void>();
let nowValue = typeof window === "undefined" ? 0 : Date.now();
let clockTimer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!clockTimer) clockTimer = setInterval(() => { nowValue = Date.now(); listeners.forEach((l) => l()); }, 250);
  return () => { listeners.delete(cb); if (!listeners.size && clockTimer) { clearInterval(clockTimer); clockTimer = null; } };
}
/** Local wall clock, refreshed 4×/s. Combine with offsetMs to get server time. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => nowValue, () => 0);
}
export function useServerNow(offsetMs: number): number {
  return useNow() + offsetMs;
}
