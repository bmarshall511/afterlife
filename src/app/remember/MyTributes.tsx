"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import EditTribute from "./edit/[id]/EditTribute";
import { loadSaved, saveTribute } from "./store";
import { fetchMine, type MyTribute } from "./useMine";

export type { MyTribute } from "./useMine";

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

/**
 * MANAGE state: list of the family's / this device's tributes. Tapping a card opens its detail/edit view in place.
 */
export default function MyTributes({
  party, list, setList, reload, error, onAdd, openId, onOpenChange,
}: {
  party: "live" | "demo";
  list: MyTribute[] | null;
  setList: (fn: (l: MyTribute[] | null) => MyTribute[] | null) => void;
  reload: () => Promise<void>;
  error?: string | null;
  onAdd: () => void;
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
}) {
  const [open, setOpenState] = useState<string | null>(openId ?? null);
  const [showPaste, setShowPaste] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (openId !== undefined) setOpenState(openId); }, [openId]);
  const setOpen = (id: string | null) => { setOpenState(id); onOpenChange?.(id); };
  const tokenFor = (id: string) => loadSaved().find((s) => s.id === id)?.token ?? null;

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
      await reload();
    } catch (e) {
      setPasteMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't check that link." });
    }
  }

  if (open) {
    return (
      <div className="rv-pane">
        <EditTribute
          id={open}
          token={tokenFor(open)}
          embedded
          onClose={() => { setOpen(null); reload(); }}
          onSaved={(t) => setList((l) => (l ?? []).map((x) => (x.id === t.id ? { ...x, personName: t.personName, remembrance: t.remembrance, attribution: t.attribution } : x)))}
          onRemoved={(id) => { setList((l) => (l ?? []).filter((x) => x.id !== id)); setOpen(null); }}
        />
      </div>
    );
  }

  return (
    <section className="rv-pane" aria-label="Your tributes">
      {error ? <div className="rm-error" role="alert">{error}</div> : null}
      {list === null ? (
        <p className="rm-muted">Loading…</p>
      ) : !list.length ? (
        <div className="rv-empty">
          <span className="rv-empty-icon" aria-hidden="true"><Icon name="candle" size={28} /></span>
          <p>No tributes yet. Add someone you love and they&apos;ll appear here, ready to edit anytime.</p>
          <button type="button" className="rm-btn" onClick={onAdd}>Add someone</button>
        </div>
      ) : (
        <ul className="rv-list">
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" className="rv-card" onClick={() => setOpen(t.id)} aria-label={`Open ${t.personName}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="rv-thumb" src={t.thumbUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                <span className="rv-card-body">
                  <span className="rv-card-name">{t.personName}</span>
                  {t.remembrance ? <span className="rv-card-rem">{t.remembrance}</span> : null}
                  <span className={`rv-pill${t.status === "hidden" ? " hidden" : ""}`}>{t.status === "hidden" ? "Hidden by host" : "On the TV"}</span>
                </span>
                <span className="rv-chev" aria-hidden="true"><Icon name="chev" size={20} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rv-paste">
        {!showPaste ? (
          <button type="button" className="rv-link-btn" onClick={() => setShowPaste(true)}>Have a private edit link? Paste it</button>
        ) : (
          <>
            <label className="rm-muted" htmlFor="rv-paste">Paste a private edit link to manage that tribute here</label>
            <div className="rv-paste-row">
              <input id="rv-paste" className="rm-input" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://…/remember/edit/…#…" autoComplete="off" autoCapitalize="off" spellCheck={false} />
              <button type="button" className="rm-btn2" onClick={importLink} disabled={!paste.trim()}>Add</button>
            </div>
          </>
        )}
        {pasteMsg ? <div className={pasteMsg.ok ? "rm-ok" : "rm-error"} role="status">{pasteMsg.text}</div> : null}
      </div>
    </section>
  );
}
