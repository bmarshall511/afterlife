"use client";
import { useCallback, useEffect, useState } from "react";
import type { GameFamily, Snapshot } from "@/shared/types";
import { FAMILY } from "./Brand";
import { Icon } from "./Icon";

const GAMES: GameFamily[] = ["calavera", "line", "loteria", "room", "closest", "dichos", "price", "fib"];

function stepLabel(s: Snapshot): string {
  const k = s.phase.kind;
  const fam = s.phase.family ? FAMILY[s.phase.family].title : "";
  if (s.status !== "running") return s.status === "paused" ? "Paused" : "Not started";
  if (k === "question") return `${fam} · Q${(s.phase.qIndex ?? 0) + 1}${s.phase.stage ? ` · ${s.phase.stage}` : ""}`;
  if (k === "reveal") return `${fam} · Q${(s.phase.qIndex ?? 0) + 1} · reveal`;
  if (k === "intro") return `${new Set(s.phase.setFamilies ?? []).size > 1 ? "Ronda Sorpresa" : fam} · intro`;
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
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [afterDark, setAfterDark] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" }).then((r) => setAdmin(r.ok)).catch(() => setAdmin(false));
  }, []);
  useEffect(() => {
    if (!admin) return;
    fetch("/api/admin/party?party=demo", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => setAfterDark(!!d?.party?.settings?.afterDark)).catch(() => {});
  }, [admin]);

  const act = useCallback(async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/party", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ party: "demo", ...body }) });
      if (r.status === 401) setMsg({ ok: false, text: "Your admin sign-in expired — sign in again at /admin." });
      else if (!r.ok) setMsg({ ok: false, text: ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "That didn't work." });
      else setMsg({ ok: true, text: done });
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }, []);
  // confirmations fade after a few seconds; errors stay until the next tap
  useEffect(() => {
    if (!msg?.ok) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  useEffect(() => {
    if (!admin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "n") act({ action: "demo_next" }, "Moved to the next step");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [admin, act]);

  if (!admin) return null;
  const running = s.status === "running";
  const bots = s.teams.filter((t) => t.bot).length;
  const active = s.teams.filter((t) => t.status === "active").length;
  const waiting = running && s.phase.kind === "ambient" && active === 0;
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
        {!running && !paused && <button className="demobar-btn primary" disabled={busy} onClick={() => act({ action: "start" }, "Demo started")}><Icon name="play" /> Start</button>}
        {running && <button className="demobar-btn primary" disabled={busy || waiting} onClick={() => act({ action: "demo_next" }, "Moved to the next step")} title={waiting ? "Add families first" : "Shortcut: → or N"}><Icon name="arrow" /> Next step</button>}
        {running && <button className="demobar-btn" disabled={busy} onClick={() => act({ action: "pause" }, "Paused")}><Icon name="pause" /> Pause</button>}
        {paused && <button className="demobar-btn primary" disabled={busy} onClick={() => act({ action: "resume" }, "Resumed")}><Icon name="play" /> Resume</button>}
        <button className="demobar-btn" disabled={busy} onClick={() => act({ action: "demo_photos" }, "Added 6 sample party photos to the demo album")}>
          <Icon name="share" /> Add sample party photos
        </button>
        <button className="demobar-btn" disabled={busy || !running} onClick={() => act({ action: "demo_break" }, "Showing party photos")}>
          <Icon name="play" /> Show party photos
        </button>
        <button className="demobar-btn" disabled={busy} onClick={() => act({ action: "demo_bots" }, "Added 3 bot families — a game starts in a moment")} title="Stand-in families that answer by themselves">
          <Icon name="people" /> Add 3 bot families{bots ? ` (${bots})` : ""}
        </button>
      </div>
      <div className="demobar-row demobar-games">
        <span className="demobar-lbl">Play next</span>
        <button className="demobar-chip" disabled={busy || paused} onClick={() => act({ action: "demo_game", family: null }, "Back to the normal mix")}>Mix</button>
        {GAMES.map((g) => (
          <button key={g} className={`demobar-chip ${s.phase.family === g ? "on" : ""}`} disabled={busy || paused} onClick={() => act({ action: "demo_game", family: g }, `Starting ${FAMILY[g].title}…`)}>
            {FAMILY[g].title}
          </button>
        ))}
      </div>
      <div className="demobar-row">
        <span className="demobar-lbl">After Dark</span>
        <button className={`demobar-chip ${afterDark ? "on" : ""}`} aria-pressed={!!afterDark} disabled={busy}
          onClick={async () => { const on = !afterDark; await act({ action: "after_dark", on }, on ? "After Dark on — adults-only questions from the next one" : "After Dark off — family-friendly only"); setAfterDark(on); }}>
          {afterDark ? "On · adults only" : "Off · family-friendly"}
        </button>
      </div>
      {waiting && !msg && <p className="demobar-wait">No families yet. Tap <b>Add 3 bot families</b>, join from your phone, or just pick a game below — it adds bots for you.</p>}
      {msg && <p className={`demobar-msg ${msg.ok ? "ok" : ""}`} role={msg.ok ? "status" : "alert"}>{msg.ok ? "✓ " : ""}{msg.text}</p>}
      <p className="demobar-hint">Only you see this (signed in to admin). Join from your phone, then add bot families so Calavera and Read the Room have enough players.</p>
    </div>
  );
}
