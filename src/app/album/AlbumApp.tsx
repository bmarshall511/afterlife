"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./album.css";
import { finalize, prepare, uploadRaw, UploadError, type UploadMode } from "./upload";
import { downloadAllAsZip, zipName, type ZipProgress } from "./zip";

export interface Photo {
  id: string;
  width: number;
  height: number;
  caption: string;
  takenBy: string;
  createdAt: string;
  thumbUrl: string;
  displayUrl: string;
  fullUrl: string;
}

type ItemState = "ready" | "preparing" | "uploading" | "processing" | "done" | "failed";
interface Item {
  key: string;
  file: File;
  preview: string;
  caption: string;
  state: ItemState;
  progress: number;
  error?: string;
  retryable?: boolean;
  pathname?: string;
}

interface Props {
  token: string;
  party: "live" | "demo";
  initialPhotos: Photo[];
  defaultTakenBy: string;
  mode: UploadMode;
  maxCaption: number;
  /** Rendered inside the controller's Party photos sheet: no page header, no back link. */
  embedded?: boolean;
}

const CONCURRENCY = 2;

export default function AlbumApp({ token, party, initialPhotos, defaultTakenBy, mode, maxCaption, embedded = false }: Props) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [open, setOpen] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [takenBy, setTakenBy] = useState(defaultTakenBy);
  const [zip, setZip] = useState<(ZipProgress & { running: boolean; error?: string }) | null>(null);
  const zipAbort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const fullUrl = useCallback((p: Photo, dl = false) => `${p.fullUrl}&t=${encodeURIComponent(token)}${dl ? "&dl=1" : ""}`, [token]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/album/photos?token=${encodeURIComponent(token)}&party=${party}`, { cache: "no-store" });
      if (r.ok) setPhotos((await r.json()).photos);
    } catch { /* offline: keep current */ }
  }, [token, party]);

  useEffect(() => {
    if (embedded) refresh(); // the in-app sheet starts empty; load straight away
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 20000);
    return () => clearInterval(t);
  }, [refresh, embedded]);

  // Keep the lightbox index valid if the list changes underneath it.
  useEffect(() => {
    if (open !== null && open >= photos.length) setOpen(photos.length ? photos.length - 1 : null);
  }, [photos.length, open]);

  /* ---------------- uploads ---------------- */
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next: Item[] = Array.from(list).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
      caption: "",
      state: "ready",
      progress: 0,
    }));
    setItems((xs) => [...xs.filter((x) => x.state !== "done"), ...next]);
  }

  async function processOne(it: Item) {
    let pathname = it.pathname;
    try {
      if (pathname) {
        patch(it.key, { state: "processing", error: undefined });
        try {
          const photo = await finalize({ pathname, caption: it.caption, takenBy, party, token });
          return success(it, photo);
        } catch (e) {
          if (!(e instanceof UploadError && e.status === 404)) throw e;
          pathname = undefined; // raw upload expired/missing: upload again
        }
      }
      patch(it.key, { state: "preparing", progress: 0, error: undefined });
      const prepared = await prepare(it.file);
      patch(it.key, { state: "uploading" });
      pathname = await uploadRaw(mode, prepared, token, party, (f) => patch(it.key, { progress: f }));
      patch(it.key, { state: "processing", progress: 1, pathname });
      const photo = await finalize({ pathname, caption: it.caption, takenBy, party, token });
      success(it, photo);
    } catch (e) {
      const err = e instanceof UploadError ? e : new UploadError("Something went wrong. Please try again.");
      patch(it.key, { state: "failed", error: err.message, retryable: err.retryable, pathname });
    }
  }

  function success(it: Item, photo: Photo) {
    patch(it.key, { state: "done", progress: 1 });
    setPhotos((ps) => (ps.some((p) => p.id === photo.id) ? ps : [photo, ...ps]));
  }

  async function runQueue(keys: string[]) {
    const queue = [...keys];
    const worker = async () => {
      for (let k = queue.shift(); k; k = queue.shift()) {
        const it = itemsRef.current.find((x) => x.key === k);
        if (it) await processOne(it);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  const ready = items.filter((x) => x.state === "ready");
  const busy = items.some((x) => ["preparing", "uploading", "processing"].includes(x.state));
  const doneCount = items.filter((x) => x.state === "done").length;
  const failedCount = items.filter((x) => x.state === "failed").length;

  function clearFinished() {
    setItems((xs) => {
      xs.filter((x) => x.state === "done").forEach((x) => URL.revokeObjectURL(x.preview));
      return xs.filter((x) => x.state !== "done");
    });
  }
  function removeItem(key: string) {
    setItems((xs) => {
      const x = xs.find((i) => i.key === key);
      if (x) URL.revokeObjectURL(x.preview);
      return xs.filter((i) => i.key !== key);
    });
  }

  /* ---------------- download all ---------------- */
  async function downloadAll() {
    if (!photos.length) return;
    const ac = new AbortController();
    zipAbort.current = ac;
    setZip({ done: 0, total: photos.length, failed: 0, running: true });
    try {
      const res = await downloadAllAsZip(
        photos.map((p, i) => ({ url: fullUrl(p), name: zipName(p.createdAt, p.id, i), lastModified: p.createdAt })),
        `afterlife-album${party === "demo" ? "-demo" : ""}.zip`,
        (p) => setZip((z) => ({ ...(z ?? { running: true }), ...p, running: true })),
        ac.signal,
      );
      setZip({ ...res, running: false, error: res.failed ? `${res.failed} photo${res.failed === 1 ? "" : "s"} couldn't be included.` : undefined });
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      setZip((z) => ({ ...(z ?? { done: 0, total: 0, failed: 0 }), running: false, error: aborted ? "Download cancelled." : "The download didn't finish. Try again, or save photos one at a time." }));
    } finally {
      zipAbort.current = null;
    }
  }

  // Opened from the game controller (same tab, so a home-screen app stays in the app): offer a way back.
  const [fromPlay, setFromPlay] = useState(false);
  useEffect(() => { setFromPlay(new URLSearchParams(location.search).get("from") === "play"); }, []);

  return (
    <main className={`al-wrap${embedded ? " al-embedded" : ""}`}>
      {fromPlay && !embedded && (
        <a className="al-back" href={party === "demo" ? "/play?party=demo" : "/play"}>
          <span aria-hidden="true">←</span> Back to the game
        </a>
      )}
      <header className="al-head">
        {!embedded && <p className="al-eyebrow">AFTERLIFE · Party album{party === "demo" ? " · demo" : ""}</p>}
        {!embedded && <h1 className="al-h1">Tonight, in pictures</h1>}
        <p className="al-lede">{embedded ? "Add the photos you take tonight — everyone at the party can see and save them." : "Add the photos you take at the party — during and after. Everyone with this link can see and download them."}</p>
        <div className="al-actions">
          <button className="al-btn" onClick={() => fileInput.current?.click()}>
            <span aria-hidden="true">＋</span> Add photos
          </button>
          <button className="al-btn2" onClick={downloadAll} disabled={!photos.length || !!zip?.running}>
            Download all{photos.length ? ` (${photos.length})` : ""}
          </button>
          <input ref={fileInput} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {zip ? (
          <div className="al-zip" role="status" aria-live="polite">
            {zip.running ? (
              <>
                <span>Preparing ZIP… {zip.done + zip.failed} of {zip.total}</span>
                <progress max={zip.total || 1} value={zip.done + zip.failed} />
                <button className="al-link" onClick={() => zipAbort.current?.abort()}>Cancel</button>
              </>
            ) : (
              <>
                <span>{zip.error ?? `Saved ${zip.done} photo${zip.done === 1 ? "" : "s"}.`}</span>
                <button className="al-link" onClick={() => setZip(null)}>Dismiss</button>
              </>
            )}
          </div>
        ) : null}
      </header>

      {items.length ? (
        <section className="al-uploads" aria-label="Your uploads">
          <label className="al-field">
            <span className="al-label">Taken by <small>shown with your photos</small></span>
            <input className="al-input" value={takenBy} maxLength={60} onChange={(e) => setTakenBy(e.target.value)} placeholder="Your name or team" autoComplete="nickname" disabled={busy} />
          </label>
          <ul className="al-queue">
            {items.map((it) => (
              <li key={it.key} className={`al-qi is-${it.state}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="al-qthumb" src={it.preview} alt="" />
                <div className="al-qbody">
                  {it.state === "ready" ? (
                    <input className="al-input sm" value={it.caption} maxLength={maxCaption} placeholder="Caption (optional)" aria-label={`Caption for ${it.file.name}`} onChange={(e) => patch(it.key, { caption: e.target.value })} />
                  ) : it.caption ? <p className="al-qcap">{it.caption}</p> : null}
                  <p className="al-qstatus" role={it.state === "failed" ? "alert" : undefined}>
                    {it.state === "ready" && "Ready"}
                    {it.state === "preparing" && "Preparing…"}
                    {it.state === "uploading" && `Uploading ${Math.round(it.progress * 100)}%`}
                    {it.state === "processing" && "Adding to the album…"}
                    {it.state === "done" && "Added ✓"}
                    {it.state === "failed" && (it.error ?? "Failed")}
                  </p>
                  {it.state === "uploading" || it.state === "processing" || it.state === "preparing" ? (
                    <div className="al-bar" aria-hidden="true"><span style={{ width: `${Math.max(4, it.progress * 100)}%` }} /></div>
                  ) : null}
                </div>
                <div className="al-qact">
                  {it.state === "failed" && it.retryable !== false ? <button className="al-btn2 sm" onClick={() => runQueue([it.key])}>Retry</button> : null}
                  {it.state === "ready" || it.state === "failed" ? <button className="al-link" onClick={() => removeItem(it.key)} aria-label={`Remove ${it.file.name}`}>Remove</button> : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="al-actions">
            {ready.length ? (
              <button className="al-btn" disabled={busy} onClick={() => runQueue(ready.map((x) => x.key))}>
                Upload {ready.length} photo{ready.length === 1 ? "" : "s"}
              </button>
            ) : null}
            {failedCount && !busy ? (
              <button className="al-btn2" onClick={() => runQueue(items.filter((x) => x.state === "failed" && x.retryable !== false).map((x) => x.key))}>Retry failed</button>
            ) : null}
            {doneCount && !busy ? <button className="al-link" onClick={clearFinished}>Clear finished</button> : null}
          </div>
          {busy ? <p className="al-muted">Keep this page open until your photos are added.</p> : null}
        </section>
      ) : null}

      {photos.length ? (
        <ul className="al-grid" aria-label={`${photos.length} photos`}>
          {photos.map((p, i) => (
            <li key={p.id} className="al-cell">
              <button className="al-tile" onClick={() => setOpen(i)} aria-label={`Open photo${p.caption ? `: ${p.caption}` : ""}${p.takenBy ? `, taken by ${p.takenBy}` : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl} alt="" width={p.width} height={p.height} loading={i < 8 ? "eager" : "lazy"} decoding="async" />
                {p.caption ? <span className="al-tcap">{p.caption}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="al-empty">
          <p className="al-empty-big">No photos yet.</p>
          <p className="al-muted">Be the first — tap “Add photos” to share from your camera roll.</p>
        </div>
      )}

      {open !== null && photos[open] ? (
        <Lightbox
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          downloadHref={(p) => fullUrl(p, true)}
        />
      ) : null}
    </main>
  );
}

function Lightbox({ photos, index, onIndex, onClose, downloadHref }: { photos: Photo[]; index: number; onIndex: (i: number) => void; onClose: () => void; downloadHref: (p: Photo) => string }) {
  const p = photos[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  const prev = useCallback(() => index > 0 && onIndex(index - 1), [index, onIndex]);
  const next = useCallback(() => index < photos.length - 1 && onIndex(index + 1), [index, photos.length, onIndex]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; before?.focus?.(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  // Preload neighbours for snappy swiping.
  useEffect(() => {
    for (const j of [index - 1, index + 1]) if (photos[j]) { const im = new Image(); im.src = photos[j].displayUrl; }
  }, [index, photos]);

  return (
    <div className="al-lb" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div className="al-lb-top">
        <span className="al-lb-count">{index + 1} / {photos.length}</span>
        <div className="al-lb-tools">
          <a className="al-btn2 sm" href={downloadHref(p)} download>Download</a>
          <button ref={closeRef} className="al-btn2 sm" onClick={onClose} aria-label="Close">Close</button>
        </div>
      </div>
      <div
        className="al-lb-stage"
        onPointerDown={(e) => { if (e.pointerType !== "mouse") start.current = { x: e.clientX, y: e.clientY }; }}
        onPointerMove={(e) => { if (start.current) setDx(e.clientX - start.current.x); }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          setDx(0);
          if (!s) return;
          const ddx = e.clientX - s.x, ddy = e.clientY - s.y;
          if (Math.abs(ddx) > 50 && Math.abs(ddx) > Math.abs(ddy)) (ddx < 0 ? next : prev)();
          else if (ddy > 90 && Math.abs(ddy) > Math.abs(ddx)) onClose();
        }}
        onPointerCancel={() => { start.current = null; setDx(0); }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={p.id} className="al-lb-img" src={p.displayUrl} alt={p.caption || "Party photo"} width={p.width} height={p.height} style={dx ? { transform: `translateX(${dx}px)` } : undefined} draggable={false} />
        <button className="al-lb-nav prev" onClick={prev} disabled={index === 0} aria-label="Previous photo">‹</button>
        <button className="al-lb-nav next" onClick={next} disabled={index === photos.length - 1} aria-label="Next photo">›</button>
      </div>
      {p.caption || p.takenBy ? (
        <div className="al-lb-meta">
          {p.caption ? <p className="al-lb-cap">{p.caption}</p> : null}
          {p.takenBy ? <p className="al-lb-by">Taken by {p.takenBy}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
