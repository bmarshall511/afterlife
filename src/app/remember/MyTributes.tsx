"use client";

import { useCallback, useEffect, useState } from "react";
import EditTribute from "./edit/[id]/EditTribute";
import { forgetTribute, loadSaved, saveTribute } from "./store";

export interface MyTribute {
  id: string;
  personName: string;
  remembrance: string;
  attribution: string;
  status: "published" | "hidden";
  thumbUrl: string;
  createdAt: string;
  canEdit: boolean;
  via: "team" | "token";
}

/** Extracts {id, token} from a pasted private edit link like https://…/remember/edit/<id>#<token>. */
export function parseEditLink(text: string): { id: string; token: string } | null {
  const m = /\/remember\/edit\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?#([A-Za-z0-9_%-]{20,200})/i.exec(text.trim());
  if (!m) return null;
  try {
    return { id: m[1].toLowerCase(), token: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

async function fetchMine(party: string, items: { id: string; token: string }[]) {
  const r = await fetch("/api/tributes/mine", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ party, items }),
    cache: "no-store",
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Couldn't load your tributes.");
  return d as { tributes: MyTribute[]; unknown: string[]; hasSession: boolean };
}

/**
 * "Your tributes": tributes this family submitted (guest team session) or that this device holds edit links for.
 * Edit opens inline (no navigation); Remove confirms, then removes the card.
 */
export default function MyTributes({
  party,
  refreshKey,
  hideWhenEmpty,
  onAdd,
  onEditingChange,
}: {
  party: "live" | "demo";
  refreshKey?: unknown;
  hideWhenEmpty?: boolean;
  onAdd?: () => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [list, setList] = useState<MyTribute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPaste, setShowPaste] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchMine(party, loadSaved().map(({ id, token }) => ({ id, token })));
      setList(d.tributes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your tributes.");
      setList((l) => l ?? []);
    }
  }, [party]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { onEditingChange?.(!!editing); }, [editing, onEditingChange]);

  const tokenFor = (id: string) => loadSaved().find((s) => s.id === id)?.token ?? null;

  async function remove(t: MyTribute) {
    setBusy(true);
    try {
      const tok = tokenFor(t.id);
      const r = await fetch(`/api/tributes/${t.id}`, { method: "DELETE", headers: tok ? { authorization: `Bearer ${tok}` } : {} });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't remove it. Please try again.");
      forgetTribute(t.id);
      setList((l) => (l ?? []).filter((x) => x.id !== t.id));
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove it.");
    } finally {
      setBusy(false);
    }
  }

  async function importLink() {
    setPasteMsg(null);
    const p = parseEditLink(paste);
    if (!p) return setPasteMsg({ ok: false, text: "That doesn't look like a private edit link. It should include /remember/edit/ and a # part." });
    try {
      const d = await fetchMine(party, [p]);
      const found = d.tributes.find((t) => t.id === p.id && t.via === "token");
      if (!found) return setPasteMsg({ ok: false, text: "We couldn't open that link. It may be incomplete, for a different party, or the tribute was removed." });
      saveTribute({ id: p.id, token: p.token, name: found.personName, createdAt: found.createdAt });
      setPaste("");
      setPasteMsg({ ok: true, text: `Added ${found.personName} to this device.` });
      await load();
    } catch (e) {
      setPasteMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't check that link." });
    }
  }

  if (editing) {
    return (
      <div className="mt-section">
        <EditTribute
          id={editing}
          token={tokenFor(editing)}
          embedded
          onClose={() => { setEditing(null); load(); }}
          onSaved={(t) => setList((l) => (l ?? []).map((x) => (x.id === t.id ? { ...x, personName: t.personName, remembrance: t.remembrance, attribution: t.attribution } : x)))}
          onRemoved={(id) => { setList((l) => (l ?? []).filter((x) => x.id !== id)); setEditing(null); }}
        />
      </div>
    );
  }

  if (list === null) return hideWhenEmpty ? null : <p className="rm-muted">Loading your tributes…</p>;

  const pasteBox = (
    <div style={{ marginTop: 8 }}>
      {!showPaste ? (
        <button type="button" className="rm-btn2" style={{ fontSize: 14 }} onClick={() => setShowPaste(true)}>Have a private edit link? Paste it</button>
      ) : (
        <>
          <label className="rm-muted" htmlFor="mt-paste">Paste a private edit link to manage that tribute here</label>
          <div className="mt-paste">
            <input id="mt-paste" className="rm-input" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://…/remember/edit/…#…" autoComplete="off" autoCapitalize="off" spellCheck={false} />
            <button type="button" className="rm-btn2" onClick={importLink} disabled={!paste.trim()}>Add</button>
          </div>
        </>
      )}
      {pasteMsg ? <div className={pasteMsg.ok ? "rm-ok" : "rm-error"} role="status">{pasteMsg.text}</div> : null}
    </div>
  );

  if (!list.length && hideWhenEmpty) return <div className="mt-section">{pasteBox}</div>;

  return (
    <section className="mt-section" aria-label="Your tributes">
      <div className="mt-head">
        <h2>Your tributes{list.length ? ` · ${list.length}` : ""}</h2>
        {onAdd && list.length ? <button type="button" className="rm-btn2" onClick={onAdd}>Add another</button> : null}
      </div>
      {error ? <div className="rm-error" role="alert">{error}</div> : null}
      {!list.length ? (
        <div className="mt-empty">Nothing here yet. When you add someone, they&apos;ll appear here so you can edit or remove them anytime.</div>
      ) : (
        <ul className="mt-list">
          {list.map((t) => (
            <li key={t.id} className="mt-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="mt-thumb" src={t.thumbUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
              <div style={{ minWidth: 0 }}>
                <div className="mt-name">{t.personName}</div>
                <span className={`mt-badge${t.status === "hidden" ? " hidden" : ""}`}>{t.status === "hidden" ? "Hidden by host" : "On the TV"}</span>
                {t.remembrance ? <div className="mt-rem">{t.remembrance}</div> : null}
                {confirmId === t.id ? (
                  <div className="rm-notice" style={{ margin: "8px 0 0", padding: 10 }}>
                    <p style={{ margin: "0 0 8px" }}>Remove {t.personName}? The photo and words are deleted for good.</p>
                    <div className="mt-actions" style={{ marginTop: 0 }}>
                      <button type="button" className="rm-btn2 danger" disabled={busy} onClick={() => remove(t)}>Yes, remove</button>
                      <button type="button" className="rm-btn2" onClick={() => setConfirmId(null)}>Keep</button>
                    </div>
                  </div>
                ) : t.canEdit ? (
                  <div className="mt-actions">
                    <button type="button" className="rm-btn2" onClick={() => setEditing(t.id)} aria-label={`Edit ${t.personName}`}>Edit</button>
                    <button type="button" className="rm-btn2 danger" onClick={() => setConfirmId(t.id)} aria-label={`Remove ${t.personName}`}>Remove</button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {pasteBox}
    </section>
  );
}
