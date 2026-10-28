"use client";

import { useEffect, useRef, useState } from "react";
import TributePreview from "../TributePreview";
import { canvasToJpeg, decodeToCanvas, rotateCanvas, type Source } from "../image";
import { editPath, loadSaved, saveTribute, type SavedTribute } from "../store";

const MAX = 300;

export default function RememberForm({ token, party }: { token: string; party: "live" | "demo" }) {
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
  const [done, setDone] = useState<SavedTribute | null>(null);
  const [saved, setSaved] = useState<SavedTribute[]>([]);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setSaved(loadSaved()), [done]);

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
      setDone(t);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't publish this yet. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function addAnother() {
    setDone(null);
    setBase(null);
    setBlob(null);
    setUrl(null);
    setName("");
    setRem("");
    setConsent(false);
    setFit("contain");
    setCopied(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (done) {
    const link = `${location.origin}${editPath(done.id, done.token)}`;
    return (
      <div>
        <p className="rm-eyebrow">Published</p>
        <h1 className="rm-h1">Thank you. {done.name} is on the ofrenda.</h1>
        <p className="rm-lede">Their photo and words will appear on the party TV during the breaks between games.</p>
        <div className="rm-notice">
          <strong>Your private edit link</strong>
          <p className="rm-muted" style={{ margin: "4px 0 10px" }}>
            Keep this if you want to change or remove this tribute later. It&apos;s saved on this device too. Anyone with this link can edit it, so only share it with family.
          </p>
          <div className="rm-link">{link}</div>
          <div className="rm-row" style={{ marginTop: 10 }}>
            <button className="rm-btn2" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {})}>
              {copied ? "Copied" : "Copy edit link"}
            </button>
            <a className="rm-btn2" href={editPath(done.id, done.token)} style={{ textDecoration: "none" }}>Edit now</a>
          </div>
        </div>
        <button className="rm-btn" onClick={addAnother}>Add another</button>
      </div>
    );
  }

  return (
    <div>
      <p className="rm-eyebrow">Digital ofrenda</p>
      <h1 className="rm-h1">Remember someone with us</h1>
      <p className="rm-lede">Add a photo of someone you love and miss. No account needed.</p>
      <div className="rm-notice">
        Anyone with this link can add a tribute. Photos, names and words you share here are shown on the TV at the family party.
      </div>

      {!url ? (
        <label className="rm-pick">
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" onChange={(e) => onFile(e.target.files?.[0])} />
          <strong style={{ fontSize: 17 }}>{decoding ? "Opening photo…" : "Choose a photo"}</strong>
          <span className="rm-muted">One photo per tribute. You can add more afterward.</span>
        </label>
      ) : (
        <div>
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
          <p className="rm-muted" style={{ margin: "8px 0" }}>This is how it will look on the TV.</p>
          <div className="rm-seg" role="group" aria-label="Photo fit">
            <button type="button" aria-pressed={fit === "contain"} onClick={() => setFit("contain")}>Show whole photo</button>
            <button type="button" aria-pressed={fit === "cover"} onClick={() => setFit("cover")}>Fill the frame</button>
          </div>
          {fit === "cover" ? (
            <div style={{ marginTop: 10 }}>
              <p className="rm-muted" style={{ margin: "0 0 4px" }}>Fill may trim the edges. Tap the photo or use the sliders to keep faces in view.</p>
              <label className="rm-muted">Left ↔ right<input className="rm-range" type="range" min={0} max={1} step={0.01} value={fx} onChange={(e) => setFx(Number(e.target.value))} /></label>
              <label className="rm-muted">Top ↕ bottom<input className="rm-range" type="range" min={0} max={1} step={0.01} value={fy} onChange={(e) => setFy(Number(e.target.value))} /></label>
            </div>
          ) : null}
          <div className="rm-row" style={{ marginTop: 10 }}>
            <button type="button" className="rm-btn2" onClick={() => setRotation((r) => (r + 270) % 360)}>Rotate left</button>
            <button type="button" className="rm-btn2" onClick={() => setRotation((r) => (r + 90) % 360)}>Rotate right</button>
            <label className="rm-btn2" style={{ position: "relative" }}>
              Change photo
              <input ref={fileRef} type="file" accept="image/*,.heic,.heif" style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        </div>
      )}

      {error ? <div className="rm-error" role="alert">{error}</div> : null}

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

      <label className="rm-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>It&apos;s okay to show this photo and text on the TV at the party.</span>
      </label>

      <button className="rm-btn" disabled={!canPublish} onClick={publish}>{busy ? "Publishing…" : "Publish tribute"}</button>
      {!blob || !name.trim() || !consent ? (
        <p className="rm-muted" style={{ marginTop: 8 }}>
          {!blob ? "Choose a photo to continue." : !name.trim() ? "Add their name to continue." : "Tick the box above to publish."}
        </p>
      ) : null}

      {saved.length ? (
        <div style={{ marginTop: 32 }}>
          <p className="rm-label">Tributes you added on this device</p>
          <ul className="rm-list">
            {saved.map((s) => (
              <li key={s.id}><span>{s.name}</span><a href={editPath(s.id, s.token)}>Edit</a></li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
