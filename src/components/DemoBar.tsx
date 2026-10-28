"use client";
import { useCallback, useEffect, useState } from "react";
import type { GameFamily, Snapshot } from "@/shared/types";
import { FAMILY } from "./Brand";
import { Icon } from "./Icon";

const GAMES: GameFamily[] = ["calavera", "line", "loteria", "room", "closest", "case"];

function stepLabel(s: Snapshot): string {
  const k = s.phase.kind;
  const fam = s.phase.family ? FAMILY[s.phase.family].title : "";
  if (s.status !== "running") return s.status === "paused" ? "Paused" : "Not started";
  if (k === "question") return `${fam} · Q${(s.phase.qIndex ?? 0) + 1}${s.phase.stage ? ` · ${s.phase.stage}` : ""}`;
  if (k === "reveal") return `${fam} · Q${(s.phase.qIndex ?? 0) + 1} · reveal`;
  if (k === "intro") return `${fam} · intro`;
  if (k === "results") return `${fam} · results`;
  if (k === "interval") return s.phase.tribute ? "Break · tribute" : s.phase.slide ? "Break · party photo" : "Break";
  return "Waiting for teams";
}

/**
 * Demo-only host bar on /tv?party=demo. Appears only when this browser is signed in to admin.
 * Lets the host click through every screen instead of waiting for timers. Shortcut: → or N = next step.
 */
export function DemoBar({ s }: { s: Snapshot }) {
  const [admin, setAdmin] = useState(false);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" }).then((r) => setAdmin(r.ok)).catch(() => setAdmin(false));
  }, []);

  const act = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/party", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ party: "demo", ...body }) });
      if (!r.ok) setMsg(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "That didn't work.");
    } catch {
      setMsg("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!admin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "n") act({ action: "demo_next" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [admin, act]);

  if (!admin) return null;
  const running = s.status === "running";
  const paused = s.status === "paused";

  if (!open) return <button className="demobar-tab" onClick={() => setOpen(true)}>Demo controls</button>;
  return (
    <div className="demobar" role="region" aria-label="Demo controls">
      <div className="demobar-row">
        <strong className="demobar-title">Demo</strong>
        <span className="demobar-step">{stepLabel(s)}</span>
        <button className="demobar-x" onClick={() => setOpen(false)} aria-label="Hide demo controls"><Icon name="x" /></button>
      </div>
      <div className="demobar-row">
        {!running && !paused && <button className="demobar-btn primary" disabled={busy} onClick={() => act({ action: "start" })}><Icon name="play" /> Start</button>}
        {running && <button className="demobar-btn primary" disabled={busy} onClick={() => act({ action: "demo_next" })} title="Shortcut: → or N"><Icon name="arrow" /> Next step</button>}
        {running && <button className="demobar-btn" disabled={busy} onClick={() => act({ action: "pause" })}><Icon name="pause" /> Pause</button>}
        {paused && <button className="demobar-btn primary" disabled={busy} onClick={() => act({ action: "resume" })}><Icon name="play" /> Resume</button>}
      </div>
      <div className="demobar-row demobar-games">
        <span className="demobar-lbl">Play next</span>
        <button className="demobar-chip" disabled={busy || !running} onClick={() => act({ action: "demo_game", family: null })}>Mix</button>
        {GAMES.map((g) => (
          <button key={g} className={`demobar-chip ${s.phase.family === g ? "on" : ""}`} disabled={busy || !running} onClick={() => act({ action: "demo_game", family: g })}>
            {FAMILY[g].title}
          </button>
        ))}
      </div>
      {msg && <p className="demobar-msg" role="alert">{msg}</p>}
      <p className="demobar-hint">Only you see this (signed in to admin). Join a few teams from your phone or private windows first.</p>
    </div>
  );
}
