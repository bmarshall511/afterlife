"use client";

import { useEffect, useState } from "react";
import TributePreview from "../../TributePreview";
import { forgetTribute, saveTribute } from "../../store";

interface T {
  id: string; personName: string; remembrance: string; attribution: string; fit: "contain" | "cover";
  focalX: number; focalY: number; rotation: number; photoUrl: string; createdAt: string;
}
const MAX = 300;

export default function EditTribute({ id }: { id: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [t, setT] = useState<T | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "removed">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    const tok = decodeURIComponent(location.hash.slice(1));
    setToken(tok || null);
    if (!tok) return setState("missing");
    fetch(`/api/tributes/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${tok}` }, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return setState("missing");
        const d = await r.json();
        setT(d.tribute);
        setState("ready");
        saveTribute({ id, token: tok, name: d.tribute.personName, createdAt: d.tribute.createdAt });
      })
      .catch(() => setState("missing"));
  }, [id]);

  async function send(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/tributes/${encodeURIComponent(id)}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "That didn't save. Please try again.");
      return d;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "That didn't save." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <p className="rm-muted">Loading…</p>;
  if (state === "removed")
    return (
      <div>
        <h1 className="rm-h1">Tribute removed</h1>
        <p className="rm-lede">The photo and words have been deleted and won&apos;t appear on the TV again.</p>
      </div>
    );
  if (state === "missing" || !t)
    return (
      <div>
        <p className="rm-eyebrow">Digital ofrenda</p>
        <h1 className="rm-h1">We couldn&apos;t open this tribute</h1>
        <p className="rm-lede">The edit link may be incomplete, or the tribute was removed. Make sure you copied the whole link, including everything after the #.</p>
      </div>
    );

  const set = (p: Partial<T>) => setT({ ...t, ...p });
  const over = t.remembrance.length > MAX;

  return (
    <div>
      <p className="rm-eyebrow">Edit tribute</p>
      <h1 className="rm-h1">{t.personName}</h1>
      <TributePreview
        photoUrl={t.photoUrl}
        personName={t.personName.trim()}
        remembrance={t.remembrance.trim()}
        attribution={t.attribution.trim()}
        fit={t.fit}
        focalX={t.focalX}
        focalY={t.focalY}
        onPhotoTap={t.fit === "cover" ? (x, y) => set({ focalX: x, focalY: y }) : undefined}
      />
      <div className="rm-seg" role="group" aria-label="Photo fit" style={{ marginTop: 10 }}>
        <button type="button" aria-pressed={t.fit === "contain"} onClick={() => set({ fit: "contain" })}>Show whole photo</button>
        <button type="button" aria-pressed={t.fit === "cover"} onClick={() => set({ fit: "cover" })}>Fill the frame</button>
      </div>
      {t.fit === "cover" ? (
        <div style={{ marginTop: 10 }}>
          <label className="rm-muted">Left ↔ right<input className="rm-range" type="range" min={0} max={1} step={0.01} value={t.focalX} onChange={(e) => set({ focalX: Number(e.target.value) })} /></label>
          <label className="rm-muted">Top ↕ bottom<input className="rm-range" type="range" min={0} max={1} step={0.01} value={t.focalY} onChange={(e) => set({ focalY: Number(e.target.value) })} /></label>
        </div>
      ) : null}
      <div className="rm-row" style={{ marginTop: 10 }}>
        {[["Rotate left", 270], ["Rotate right", 90]].map(([label, d]) => (
          <button key={label} type="button" className="rm-btn2" disabled={busy} onClick={async () => {
            const r = await send("PATCH", { rotation: (t.rotation + (d as number)) % 360 });
            if (r) set({ rotation: r.tribute.rotation, photoUrl: r.tribute.photoUrl });
          }}>{label}</button>
        ))}
      </div>

      <label className="rm-field">
        <span className="rm-label">Their name</span>
        <input className="rm-input" value={t.personName} maxLength={80} onChange={(e) => set({ personName: e.target.value })} />
      </label>
      <label className="rm-field">
        <span className="rm-label">Remembrance <small>optional</small></span>
        <textarea className="rm-textarea" value={t.remembrance} onChange={(e) => set({ remembrance: e.target.value })} placeholder="Share a memory, something they loved, or what you want us to remember." />
        <div className={`rm-counter${over ? " over" : ""}`} aria-live="polite">{t.remembrance.length} / {MAX}</div>
      </label>
      <label className="rm-field">
        <span className="rm-label">From <small>optional</small></span>
        <input className="rm-input" value={t.attribution} maxLength={80} onChange={(e) => set({ attribution: e.target.value })} />
      </label>

      {msg ? <div className={msg.ok ? "rm-ok" : "rm-error"} role="status">{msg.text}</div> : null}
      <button className="rm-btn" disabled={busy || over || !t.personName.trim()} onClick={async () => {
        const r = await send("PATCH", { personName: t.personName, remembrance: t.remembrance, attribution: t.attribution, fit: t.fit, focalX: t.focalX, focalY: t.focalY });
        if (r) { setT({ ...t, ...r.tribute }); setMsg({ ok: true, text: "Saved. The TV will show the updated version." }); }
      }}>{busy ? "Saving…" : "Save changes"}</button>

      <div style={{ marginTop: 32 }}>
        {!confirmRemove ? (
          <button className="rm-btn2 danger" onClick={() => setConfirmRemove(true)}>Remove this tribute</button>
        ) : (
          <div className="rm-notice">
            <p style={{ marginTop: 0 }}>Remove {t.personName}&apos;s tribute? The photo and words will be deleted and can&apos;t be recovered.</p>
            <div className="rm-row">
              <button className="rm-btn2 danger" disabled={busy} onClick={async () => {
                if (await send("DELETE")) { forgetTribute(id); setState("removed"); }
              }}>Yes, remove it</button>
              <button className="rm-btn2" onClick={() => setConfirmRemove(false)}>Keep it</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
