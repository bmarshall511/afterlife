"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadAllAsZip, zipName } from "./zip";

type Any = Record<string, any>;
interface Props {
  party: "live" | "demo";
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  api: (path: string, init?: RequestInit & { json?: unknown }) => Promise<any>;
  copy: (text: string) => void;
}

/** Admin › Album: moderation grid (hide/unhide/delete/edit caption), link + QR, counts, download-all. */
export default function AlbumSection({ party, run, api, copy }: Props) {
  const [data, setData] = useState<Any | null>(null);
  const [editing, setEditing] = useState<{ id: string; caption: string; takenBy: string } | null>(null);
  const [zip, setZip] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const reload = useCallback(() => api(`/api/admin/album?party=${party}`).then(setData, () => {}), [api, party]);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 10000);
    return () => clearInterval(t);
  }, [reload]);

  const patch = (id: string, body: Any, ok: string) => run(async () => { await api(`/api/admin/album/${id}`, { method: "PATCH", json: body }); await reload(); }, ok);
  const photos: Any[] = data?.photos ?? [];
  const c = data?.counts ?? { published: 0, hidden: 0, bytes: 0 };

  async function downloadAll() {
    const ac = new AbortController();
    abort.current = ac;
    try {
      const r = await downloadAllAsZip(
        photos.map((p, i) => ({ url: `/api/admin/album/${p.id}/download`, name: `${p.status === "hidden" ? "hidden-" : ""}${zipName(p.createdAt, p.id, i)}`, lastModified: p.createdAt })),
        `afterlife-album-${party}-all.zip`,
        (p) => setZip(`Preparing ZIP… ${p.done + p.failed}/${p.total}`),
        ac.signal,
      );
      setZip(r.failed ? `Done — ${r.failed} photo(s) failed.` : `Saved ${r.done} photos.`);
    } catch (e: any) {
      setZip(e?.name === "AbortError" ? "Cancelled." : "Download failed.");
    } finally {
      abort.current = null;
    }
  }

  return (
    <>
      <div className="ad-card">
        <h2>Party album</h2>
        <div className="ad-row" style={{ alignItems: "flex-start" }}>
          {data?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ad-qr" src={`/api/admin/album/qr?party=${party}&format=svg`} alt="QR code for the album link" />
          ) : null}
          <div style={{ flex: 1, minWidth: 220 }}>
            {data?.url ? (
              <>
                <p className="ad-muted" style={{ wordBreak: "break-all", margin: "0 0 8px" }}>{data.url}</p>
                <div className="ad-row">
                  <button className="ad-btn" onClick={() => copy(data.url)}>Copy album link</button>
                  <a className="ad-btn" href={data.url} target="_blank" rel="noreferrer">Open</a>
                  <a className="ad-btn" href={`/api/admin/album/qr?party=${party}&format=png&download=1`}>QR PNG</a>
                </div>
              </>
            ) : <p className="ad-muted">ALBUM_INVITE_TOKEN is not set — the album is switched off.</p>}
            <div className="ad-row" style={{ marginTop: 10 }}>
              <span className="ad-pill ok">{c.published} live</span>
              <span className="ad-pill warn">{c.hidden} hidden</span>
              <span className="ad-pill">{(c.bytes / 1048576).toFixed(1)} MB</span>
              <button className="ad-btn" disabled={!photos.length || !!abort.current} onClick={downloadAll}>Download all (incl. hidden)</button>
              {abort.current ? <button className="ad-btn" onClick={() => abort.current?.abort()}>Cancel</button> : null}
              {zip ? <span className="ad-muted" role="status">{zip}</span> : null}
            </div>
          </div>
        </div>
      </div>
      {editing ? (
        <div className="ad-card">
          <h2>Edit photo details</h2>
          <label className="ad-muted">Caption (140 max)</label>
          <input className="ad-in" style={{ width: "100%" }} maxLength={140} value={editing.caption} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} />
          <label className="ad-muted">Taken by</label>
          <input className="ad-in" style={{ width: "100%" }} maxLength={60} value={editing.takenBy} onChange={(e) => setEditing({ ...editing, takenBy: e.target.value })} />
          <div className="ad-row" style={{ marginTop: 8 }}>
            <button className="ad-btn primary" onClick={async () => { if (await patch(editing.id, { caption: editing.caption, takenBy: editing.takenBy }, "Saved")) setEditing(null); }}>Save</button>
            <button className="ad-btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
      {!photos.length ? <p className="ad-muted">No photos yet. Share the album link or QR with guests.</p> : null}
      <div className="ad-album">
        {photos.map((p) => (
          <div key={p.id} className={`ad-card ${p.status}`}>
            <a href={p.displayUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl} alt={p.caption || "Album photo"} loading="lazy" />
            </a>
            <div className="ad-muted" style={{ margin: "6px 0 2px", overflowWrap: "anywhere" }}>{p.caption || <em>No caption</em>}</div>
            <div className="ad-muted" style={{ fontSize: 12 }}>{p.takenBy ? `by ${p.takenBy} · ` : ""}{new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · shown {p.displayCount}×</div>
            <div className="ad-row" style={{ marginTop: 6 }}>
              {p.status === "published"
                ? <button className="ad-btn" onClick={() => patch(p.id, { status: "hidden" }, "Hidden")}>Hide</button>
                : <button className="ad-btn" onClick={() => patch(p.id, { status: "published" }, "Visible")}>Unhide</button>}
              <button className="ad-btn" onClick={() => setEditing({ id: p.id, caption: p.caption, takenBy: p.takenBy })}>Edit</button>
              <a className="ad-btn" href={`/api/admin/album/${p.id}/download`}>Save</a>
              <button className="ad-btn danger" onClick={() => confirm("Permanently delete this photo? All copies are removed from storage.") && run(async () => { await api(`/api/admin/album/${p.id}?confirm=1`, { method: "DELETE" }); await reload(); }, "Deleted")}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
