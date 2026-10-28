"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import TributePreview from "./TributePreview";
import { canvasToJpeg, decodeToCanvas, rotateCanvas, type Source } from "./image";
import { editPath, saveTribute, type SavedTribute } from "./store";

const MAX = 300;

/**
 * ADD state: 1) photo, 2) words, 3) consent + publish. After publishing shows a short success view.
 * `inApp` (controller): tributes are linked to the family, so the private edit-link box is not shown.
 */
export default function AddTribute({
  token, party, inApp, onPublished, onSeeMine,
}: {
  token: string;
  party: "live" | "demo";
  inApp: boolean;
  onPublished: (t: SavedTribute) => void;
  onSeeMine: () => void;
}) {
  const [base, setBase] = useState<Source | null>(null);
  const [rotation, setRotation] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [name, setName] = useState("");
  const [rem, setRem] = useState("");
  const [attr, setAttr] = useState("");
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [fx, setFx] = useState(0.5);
  const [fy, setFy] = useState(0.5);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(SavedTribute & { thumb: string | null }) | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    const c = rotateCanvas(base, rotation);
    canvasToJpeg(c).then(
      (b) => {
        if (cancelled) return;
        setBlob(b);
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(b);
        });
      },
      () => !cancelled && setError("We couldn't prepare this photo. Please try a different one."),
    );
    return () => { cancelled = true; };
  }, [base, rotation]);

  async function onFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.size > 40 * 1024 * 1024) return setError("That file is very large. Please choose a smaller photo or a screenshot of it.");
    setDecoding(true);
    try {
      const c = await decodeToCanvas(f);
      setRotation(0);
      setFit("contain"); // default: show the whole photo, never crop silently
      setFx(0.5);
      setFy(0.5);
      setBase(c);
    } catch {
      const heic = /\.(heic|heif)$/i.test(f.name) || /hei[cf]/i.test(f.type);
      setError(heic
        ? "This browser can't open iPhone HEIC photos. Try again in Safari on your iPhone, or share the photo as a JPEG (or take a screenshot of it)."
        : "We couldn't open that file as a photo. Please choose a JPEG, PNG or iPhone photo.");
    } finally {
      setDecoding(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const over = rem.length > MAX;
  const canPublish = !!blob && name.trim().length > 0 && !over && consent && !busy;

  async function publish() {
    if (!canPublish || !blob) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("party", party);
      fd.set("photo", blob, "photo.jpg");
      fd.set("personName", name);
      fd.set("remembrance", rem);
      fd.set("attribution", attr);
      fd.set("fit", fit);
      fd.set("focalX", String(fx));
      fd.set("focalY", String(fy));
      fd.set("consent", "true");
      const r = await fetch("/api/tributes", { method: "POST", body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.id) throw new Error(data.error || (r.status === 413 ? "That photo is too large." : "We couldn't publish this yet. Please try again."));
      const t = { id: data.id, token: data.editToken, name: name.trim(), createdAt: new Date().toISOString() };
      saveTribute(t);
      setDone({ ...t, thumb: data.tribute?.thumbUrl ?? null });
      onPublished(t);
      topRef.current?.scrollIntoView({ block: "start" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't publish this yet. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDone(null);
    setBase(null);
    setBlob(null);
    setUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setName("");
    setRem("");
    setConsent(false);
    setFit("contain");
    setRotation(0);
    setCopied(false);
    setError(null);
  }

  if (done) {
    const link = `${location.origin}${editPath(done.id, done.token)}`;
    return (
      <div className="rv-pane rv-success" ref={topRef}>
        {done.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="rv-success-thumb" src={done.thumb} alt="" />
        ) : null}
        <h2 className="rv-success-title">{done.name} is on the ofrenda</h2>
        <p className="rm-muted rv-success-sub">Their photo and words will appear on the party TV between games.</p>
        {!inApp ? (
          <details className="rv-save">
            <summary>Save your edit link</summary>
            <p className="rm-muted">Use it to change or remove this tribute later, from any device. It&apos;s also saved on this one. Only share it with family.</p>
            <div className="rv-save-row">
              <input className="rm-input rm-link-input" readOnly value={link} aria-label="Private edit link" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="rm-btn2" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {})}>{copied ? "Copied" : "Copy"}</button>
            </div>
          </details>
        ) : null}
        <div className="rv-actions">
          <button type="button" className="rm-btn" onClick={onSeeMine}>See your tributes</button>
          <button type="button" className="rm-btn rm-btn-ghost" onClick={reset}>Add another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rv-pane" ref={topRef}>
      <p className="rv-intro">{inApp
        ? "Add a photo of someone you love and miss. It will be shown on the TV during the breaks at the party."
        : "Add a photo of someone you love and miss. Anyone with this link can add a tribute, and what you share is shown on the TV at the family party."}</p>

      <div className="rv-step">
        <div className="rv-step-h"><span className="rv-step-n">1</span>Photo</div>
        <input ref={fileRef} id="rv-file" className="rv-file" type="file" accept="image/*,.heic,.heif" onChange={(e) => onFile(e.target.files?.[0])} />
        {!url ? (
          <label htmlFor="rv-file" className="rv-drop">
            <span className="rv-drop-icon" aria-hidden="true"><Icon name="camera" size={30} /></span>
            <strong>{decoding ? "Opening photo…" : "Choose a photo"}</strong>
            <span className="rm-muted">One photo per tribute</span>
          </label>
        ) : (
          <>
            <TributePreview
              photoUrl={url}
              personName={name.trim()}
              remembrance={rem.trim()}
              attribution={attr.trim()}
              fit={fit}
              focalX={fx}
              focalY={fy}
              onPhotoTap={fit === "cover" ? (x, y) => { setFx(x); setFy(y); } : undefined}
            />
            <p className="rm-muted rv-hint">Preview of the TV</p>
            <div className="rv-tools">
              <div className="rv-seg-sm" role="group" aria-label="Photo fit">
                <button type="button" aria-pressed={fit === "contain"} onClick={() => setFit("contain")}>Show whole photo</button>
                <button type="button" aria-pressed={fit === "cover"} onClick={() => setFit("cover")}>Fill the frame</button>
              </div>
              <div className="rv-icons">
                <button type="button" className="rv-icon-btn" aria-label="Rotate left" title="Rotate left" onClick={() => setRotation((r) => (r + 270) % 360)}><Icon name="reset" size={20} className="rv-flip" /></button>
                <button type="button" className="rv-icon-btn" aria-label="Rotate right" title="Rotate right" onClick={() => setRotation((r) => (r + 90) % 360)}><Icon name="reset" size={20} /></button>
                <label htmlFor="rv-file" className="rv-icon-btn" aria-label="Change photo" title="Change photo"><Icon name="camera" size={20} /></label>
              </div>
            </div>
            {fit === "cover" ? (
              <div className="rv-focal">
                <p className="rm-muted">Fill may trim the edges. Tap the photo or slide to keep faces in view.</p>
                <label className="rm-muted">Left ↔ right<input className="rm-range" type="range" min={0} max={1} step={0.01} value={fx} onChange={(e) => setFx(Number(e.target.value))} /></label>
                <label className="rm-muted">Top ↕ bottom<input className="rm-range" type="range" min={0} max={1} step={0.01} value={fy} onChange={(e) => setFy(Number(e.target.value))} /></label>
              </div>
            ) : null}
          </>
        )}
      </div>

      {error ? <div className="rm-error" role="alert">{error}</div> : null}

      <div className="rv-step">
        <div className="rv-step-h"><span className="rv-step-n">2</span>Their story</div>
        <label className="rm-field">
          <span className="rm-label">Their name</span>
          <input className="rm-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
        </label>
        <label className="rm-field">
          <span className="rm-label">Remembrance <small>optional</small></span>
          <textarea className="rm-textarea" value={rem} onChange={(e) => setRem(e.target.value)} placeholder="Share a memory, something they loved, or what you want us to remember." aria-describedby="rem-count" />
          <div id="rem-count" className={`rm-counter${over ? " over" : ""}`} aria-live="polite">{rem.length} / {MAX}</div>
        </label>
        <label className="rm-field">
          <span className="rm-label">From <small>optional</small></span>
          <input className="rm-input" value={attr} maxLength={80} onChange={(e) => setAttr(e.target.value)} placeholder="e.g. The García family" autoComplete="off" />
        </label>
      </div>

      <div className="rv-step">
        <div className="rv-step-h"><span className="rv-step-n">3</span>Share</div>
        <label className="rm-check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>It&apos;s okay to show this photo and text on the TV at the party.</span>
        </label>
        <button type="button" className="rm-btn" disabled={!canPublish} onClick={publish}>{busy ? "Publishing…" : "Publish tribute"}</button>
        {!blob || !name.trim() || !consent ? (
          <p className="rm-muted rv-hint">
            {!blob ? "Choose a photo to continue." : !name.trim() ? "Add their name to continue." : "Tick the box above to publish."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
