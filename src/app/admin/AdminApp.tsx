"use client";

import { useCallback, useEffect, useState } from "react";
import TributePreview from "../remember/TributePreview";
import AlbumSection from "../album/AdminAlbumSection";

type Party = "live" | "demo";
type Any = Record<string, any>;
const TABS = ["Party", "Tributes", "Album", "Teams", "Content", "Diagnostics"] as const;
type Tab = (typeof TABS)[number];

async function api(path: string, init?: RequestInit & { json?: unknown }) {
  const r = await fetch(path, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw Object.assign(new Error("Signed out"), { status: 401 });
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}

export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("Party");
  const [party, setParty] = useState<Party>("live");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  useEffect(() => {
    api("/api/admin/session").then(() => setAuthed(true), () => setAuthed(false));
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) setMsg({ text: ok });
      return true;
    } catch (e: any) {
      if (e?.status === 401) setAuthed(false);
      setMsg({ text: e?.message ?? "Failed", err: true });
      return false;
    }
  }, []);

  if (authed === null) return <p className="ad-main ad-muted">Loading…</p>;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  const ctx = { party, run, setMsg };
  return (
    <>
      <header className="ad-top">
        <span className="ad-brand">AFTERLIFE</span>
        <nav className="ad-tabs" aria-label="Admin sections">
          {TABS.map((t) => (
            <button key={t} aria-current={tab === t} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        <select className="ad-in" value={party} onChange={(e) => setParty(e.target.value as Party)} aria-label="Party">
          <option value="live">Live party</option>
          <option value="demo">Demo / preview</option>
        </select>
        <button className="ad-btn" onClick={() => run(async () => { await api("/api/admin/logout", { method: "POST" }); setAuthed(false); })}>Sign out</button>
      </header>
      <main className="ad-main">
        {party === "demo" ? <p className="ad-pill warn" style={{ marginBottom: 12 }}>Demo party: isolated test data</p> : null}
        {tab === "Party" && <PartySection {...ctx} />}
        {tab === "Tributes" && <TributesSection {...ctx} />}
        {tab === "Album" && <AlbumSection {...ctx} api={api} copy={(t: string) => copy(t, setMsg)} />}
        {tab === "Teams" && <TeamsSection {...ctx} />}
        {tab === "Content" && <ContentSection {...ctx} />}
        {tab === "Diagnostics" && <DiagnosticsSection {...ctx} />}
      </main>
      {msg ? <div className={`ad-msg${msg.err ? " err" : ""}`} role="status">{msg.text}</div> : null}
    </>
  );
}

type Ctx = { party: Party; run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>; setMsg: (m: { text: string; err?: boolean }) => void };

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="ad-login ad-card" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setErr(null);
      try {
        await api("/api/admin/login", { method: "POST", json: { password: pw } });
        setPw("");
        onDone();
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setBusy(false);
      }
    }}>
      <h2>Host sign-in</h2>
      <input className="ad-in" style={{ width: "100%" }} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Admin password" placeholder="Password" />
      {err ? <p className="ad-muted" style={{ color: "#ffb3a8" }} role="alert">{err}</p> : null}
      <button className="ad-btn primary" style={{ marginTop: 10, width: "100%" }} disabled={busy || !pw}>Sign in</button>
    </form>
  );
}

function usePoll<T>(fn: () => Promise<T>, deps: unknown[], ms = 0) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => fn().then((d) => { setData(d); setErr(null); }, (e) => setErr(e.message)), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    reload();
    if (!ms) return;
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
  }, [reload, ms]);
  return { data, err, reload };
}

function copy(text: string, setMsg: Ctx["setMsg"]) {
  navigator.clipboard?.writeText(text).then(() => setMsg({ text: "Copied" }), () => setMsg({ text: "Copy failed", err: true }));
}

/* ---------------- Party ---------------- */
function PartySection({ party, run, setMsg }: Ctx) {
  const { data, reload } = usePoll(() => api(`/api/admin/party?party=${party}`), [party], 3000);
  const [extend, setExtend] = useState(60);
  const [settings, setSettings] = useState<string>("");
  const act = (action: string, extra: Any = {}, ok = "Done") => run(async () => { await api("/api/admin/party", { method: "POST", json: { party, action, ...extra } }); reload(); }, ok);
  const p = data?.party;
  const s = p?.settings ?? {};
  const PACING = ["introMs", "questionMs", "revealMs", "resultsMs", "intervalMs", "tributeDwellMinMs", "tributeDwellMaxMs"];
  return (
    <>
      <div className="ad-card">
        <h2>Status</h2>
        {p ? (
          <dl className="ad-kv">
            <dt>Status</dt><dd>{p.status}</dd>
            <dt>Mode</dt><dd>{p.mode}</dd>
            <dt>Phase</dt><dd>{p.phase?.kind}{p.phase?.stage ? ` / ${p.phase.stage}` : ""}{p.phase?.endsAt ? ` (ends ${new Date(p.phase.endsAt).toLocaleTimeString()})` : ""}</dd>
            <dt>Sets played</dt><dd>{p.set_seq}</dd>
          </dl>
        ) : <p className="ad-muted">Loading…</p>}
        <div className="ad-row" style={{ marginTop: 12 }}>
          <button className="ad-btn primary" onClick={() => act("start", {}, "Started")}>Start</button>
          {p?.status === "paused"
            ? <button className="ad-btn" onClick={() => act("resume", {}, "Resumed")}>Resume</button>
            : <button className="ad-btn" onClick={() => act("pause", {}, "Paused")}>Pause</button>}
          <button className="ad-btn" onClick={() => act("skip", {}, "Skipped")}>Skip question</button>
          <button className="ad-btn danger" onClick={() => confirm("Invalidate the current set? Its scores won't count for anyone.") && act("invalidate", { confirm: true, reason: "host" }, "Set invalidated")}>Invalidate set</button>
        </div>
        <div className="ad-row" style={{ marginTop: 10 }}>
          <input className="ad-in" type="number" min={10} max={3600} value={extend} onChange={(e) => setExtend(Number(e.target.value))} style={{ width: 90 }} aria-label="Seconds to extend" />
          <button className="ad-btn" onClick={() => act("extend", { ms: extend * 1000 }, "Break extended")}>Extend break (s)</button>
          <button className="ad-btn" onClick={() => act("mode", { mode: p?.mode === "tribute_only" ? "normal" : "tribute_only" }, "Mode changed")}>
            {p?.mode === "tribute_only" ? "Back to games" : "Tribute-only mode"}
          </button>
          <button className="ad-btn danger" onClick={() => confirm("End the party? The TV will stop starting new sets.") && act("end", { confirm: true }, "Party ended")}>End party</button>
        </div>
      </div>

      <div className="ad-card">
        <h2>Pacing (seconds)</h2>
        <div className="ad-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
          {PACING.map((k) => (
            <label key={k} className="ad-muted">{k.replace(/Ms$/, "")}
              <input className="ad-in" style={{ width: "100%" }} type="number" min={1} defaultValue={s[k] ? Math.round(s[k] / 1000) : ""} placeholder="default"
                key={`${party}-${k}-${s[k]}`}
                onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v * 1000 !== s[k]) act("settings", { patch: { [k]: v * 1000 } }, "Saved"); }} />
            </label>
          ))}
        </div>
        <details style={{ marginTop: 10 }}>
          <summary className="ad-muted">Advanced: raw settings JSON patch</summary>
          <textarea className="ad-in" value={settings} onChange={(e) => setSettings(e.target.value)} placeholder='{"socialEvery":5}' />
          <button className="ad-btn" onClick={() => { try { act("settings", { patch: JSON.parse(settings) }, "Saved"); } catch { setMsg({ text: "Invalid JSON", err: true }); } }}>Apply</button>
          <pre className="ad-muted" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(s, null, 2)}</pre>
        </details>
      </div>

      <div className="ad-card">
        <h2>Public links & QR codes</h2>
        {data && !data.publicBaseUrlConfigured ? <p className="ad-pill warn">PUBLIC_BASE_URL not set — links use this browser&apos;s origin. Set it before printing QR codes.</p> : null}
        {data?.urls ? (["join", "tv", "remember"] as const).map((k) => data.urls[k] ? (
          <div key={k} style={{ margin: "10px 0" }}>
            <div className="ad-muted">{k === "join" ? "Guest join" : k === "tv" ? "TV display" : "Tribute upload link (send before the party)"}</div>
            <div style={{ wordBreak: "break-all" }}>{data.urls[k]}</div>
            <div className="ad-row" style={{ marginTop: 4 }}>
              <button className="ad-btn" onClick={() => copy(data.urls[k], setMsg)}>Copy</button>
              <a className="ad-btn" href={`/api/admin/qr?target=${k}&party=${party}&format=png&download=1`}>QR PNG</a>
              <a className="ad-btn" href={`/api/admin/qr?target=${k}&party=${party}&format=svg&download=1`}>QR SVG</a>
            </div>
          </div>
        ) : <p key={k} className="ad-pill warn">TRIBUTE_INVITE_TOKEN not configured.</p>) : null}
      </div>

      {party === "demo" ? (
        <div className="ad-card">
          <h2>Demo data</h2>
          <p className="ad-muted">Deletes demo teams, scores and demo tributes only. Real party data and real tributes are untouched.</p>
          <button className="ad-btn danger" onClick={() => confirm("Reset ALL demo data? This cannot be undone.") && act("reset", { confirm: true }, "Demo reset")}>Reset demo data</button>
        </div>
      ) : null}
    </>
  );
}

/* ---------------- Tributes ---------------- */
function TributesSection({ party, run }: Ctx) {
  const [q, setQ] = useState("");
  const { data, reload } = usePoll(() => api(`/api/admin/tributes?party=${party}&q=${encodeURIComponent(q)}`), [party, q], 10000);
  const [editing, setEditing] = useState<Any | null>(null);
  const patch = (id: string, body: Any, ok = "Saved") => run(async () => {
    const d = await api(`/api/admin/tributes/${id}`, { method: "PATCH", json: body });
    if (editing?.id === id) setEditing(d.tribute);
    reload();
  }, ok);
  const list: Any[] = data?.tributes ?? [];
  return (
    <>
      <div className="ad-card ad-row">
        <input className="ad-in" placeholder="Search names or text" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} aria-label="Search tributes" />
        <a className="ad-btn" href={`/api/admin/tributes/export?party=${party}`}>Export JSON</a>
        <span className="ad-muted">{list.length} tributes</span>
      </div>
      {editing ? <TributeEditor t={editing} onClose={() => setEditing(null)} patch={patch} /> : null}
      {!list.length ? <p className="ad-muted">No tributes yet. Share the upload link from the Party tab.</p> : null}
      <div className="ad-grid">
        {list.map((t) => (
          <div key={t.id} className="ad-card" style={{ marginBottom: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ad-thumb" src={t.thumbUrl} alt={`Photo of ${t.personName}`} loading="lazy" />
            <div style={{ margin: "8px 0 4px", fontWeight: 600 }}>{t.personName}</div>
            <div className="ad-muted" style={{ whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{t.remembrance}</div>
            <div className="ad-row" style={{ margin: "6px 0" }}>
              <span className={`ad-pill ${t.status === "published" ? "ok" : "warn"}`}>{t.status}</span>
              <span className="ad-pill">shown {t.displayCount}×</span>
              {t.priority > 0 ? <span className="ad-pill warn">next up</span> : null}
            </div>
            <div className="ad-row">
              <button className="ad-btn" onClick={() => setEditing(t)}>Edit / preview</button>
              {t.status === "published"
                ? <button className="ad-btn" onClick={() => patch(t.id, { status: "hidden" }, "Hidden")}>Hide</button>
                : <button className="ad-btn" onClick={() => patch(t.id, { status: "published" }, "Visible")}>Unhide</button>}
              <button className="ad-btn" onClick={() => patch(t.id, { priority: 100 }, "Will show next")}>Feature next</button>
              <a className="ad-btn" href={`/api/admin/tributes/${t.id}/download`}>Download</a>
              <button className="ad-btn danger" onClick={() => confirm(`Permanently delete the tribute for ${t.personName}? The photo is deleted from storage.`) && run(async () => { await api(`/api/admin/tributes/${t.id}?confirm=1`, { method: "DELETE" }); if (editing?.id === t.id) setEditing(null); reload(); }, "Deleted")}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TributeEditor({ t, onClose, patch }: { t: Any; onClose: () => void; patch: (id: string, b: Any, ok?: string) => Promise<boolean> }) {
  const [d, setD] = useState<Any>(t);
  useEffect(() => setD(t), [t]);
  return (
    <div className="ad-card">
      <div className="ad-row" style={{ justifyContent: "space-between" }}>
        <h2>Edit tribute</h2>
        <button className="ad-btn" onClick={onClose}>Close</button>
      </div>
      <div style={{ maxWidth: 720 }}>
        <TributePreview photoUrl={d.photoUrl} personName={d.personName} remembrance={d.remembrance} attribution={d.attribution} fit={d.fit} focalX={d.focalX} focalY={d.focalY}
          onPhotoTap={d.fit === "cover" ? (x, y) => setD({ ...d, focalX: x, focalY: y }) : undefined} />
      </div>
      <div className="ad-row" style={{ marginTop: 10 }}>
        <select className="ad-in" value={d.fit} onChange={(e) => setD({ ...d, fit: e.target.value })} aria-label="Fit">
          <option value="contain">Show whole photo</option>
          <option value="cover">Fill frame</option>
        </select>
        <button className="ad-btn" onClick={() => patch(t.id, { rotation: (t.rotation + 270) % 360 }, "Rotated")}>Rotate left</button>
        <button className="ad-btn" onClick={() => patch(t.id, { rotation: (t.rotation + 90) % 360 }, "Rotated")}>Rotate right</button>
        {d.fit === "cover" ? (
          <>
            <label className="ad-muted">X <input type="range" min={0} max={1} step={0.01} value={d.focalX} onChange={(e) => setD({ ...d, focalX: Number(e.target.value) })} /></label>
            <label className="ad-muted">Y <input type="range" min={0} max={1} step={0.01} value={d.focalY} onChange={(e) => setD({ ...d, focalY: Number(e.target.value) })} /></label>
          </>
        ) : null}
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <input className="ad-in" value={d.personName} maxLength={80} onChange={(e) => setD({ ...d, personName: e.target.value })} aria-label="Name" />
        <textarea className="ad-in" value={d.remembrance} onChange={(e) => setD({ ...d, remembrance: e.target.value })} aria-label="Remembrance" />
        <span className="ad-muted">{d.remembrance.length} / 300</span>
        <input className="ad-in" value={d.attribution} maxLength={80} onChange={(e) => setD({ ...d, attribution: e.target.value })} aria-label="Attribution" placeholder="From (optional)" />
        <div><button className="ad-btn primary" onClick={() => patch(t.id, { personName: d.personName, remembrance: d.remembrance, attribution: d.attribution, fit: d.fit, focalX: d.focalX, focalY: d.focalY })}>Save</button></div>
      </div>
    </div>
  );
}

/* ---------------- Teams ---------------- */
function TeamsSection({ party, run }: Ctx) {
  const { data, err, reload } = usePoll(() => api(`/api/admin/teams?party=${party}`), [party], 5000);
  const post = (body: Any, ok = "Done") => run(async () => { await api("/api/admin/teams", { method: "POST", json: { party, ...body } }); reload(); }, ok);
  const teams: Any[] = data?.teams ?? [];
  const standings = new Map<string, Any>((data?.standings ?? []).map((s: Any) => [s.teamId, s]));
  if (err) return <p className="ad-muted">{err}</p>;
  return (
    <>
      {!teams.length ? <p className="ad-muted">No teams yet.</p> : null}
      <div className="ad-grid">
        {teams.map((t) => <TeamCard key={t.id} t={t} s={standings.get(t.id)} teams={teams} post={post} />)}
      </div>
      <div className="ad-card" style={{ marginTop: 14 }}>
        <h2>Team & score audit</h2>
        <table className="ad-table"><tbody>
          {(data?.audit ?? []).map((a: Any) => (
            <tr key={a.id}><td className="ad-muted">{new Date(a.at).toLocaleTimeString()}</td><td>{a.action}</td><td className="ad-muted">{JSON.stringify(a.detail)}</td></tr>
          ))}
        </tbody></table>
      </div>
    </>
  );
}

function TeamCard({ t, s, teams, post }: { t: Any; s?: Any; teams: Any[]; post: (b: Any, ok?: string) => Promise<boolean> }) {
  const [name, setName] = useState(t.name);
  const [into, setInto] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="ad-card" style={{ marginBottom: 0, borderLeft: `4px solid ${t.color}` }}>
      <div className="ad-row" style={{ justifyContent: "space-between" }}>
        <strong>{t.avatar} {t.name}</strong>
        <span className={`ad-pill ${t.status === "active" ? "ok" : "warn"}`}>{t.status}</span>
      </div>
      <p className="ad-muted" style={{ margin: "4px 0" }}>
        {t.connected} connected · last seen {t.lastSeen ? new Date(t.lastSeen).toLocaleTimeString() : "never"}
        {s ? ` · ${s.total} pts (${s.setsCounted}/5)` : ""}{t.adjustments ? ` · adj ${t.adjustments}` : ""}
      </p>
      <div className="ad-row">
        <input className="ad-in" value={name} onChange={(e) => setName(e.target.value)} aria-label="Team name" style={{ flex: 1 }} />
        <button className="ad-btn" disabled={!name.trim() || name === t.name} onClick={() => post({ action: "rename", teamId: t.id, name }, "Renamed")}>Rename</button>
      </div>
      <div className="ad-row" style={{ marginTop: 6 }}>
        <select className="ad-in" value={t.captainMemberId ?? ""} onChange={(e) => post({ action: "captain", teamId: t.id, memberId: e.target.value }, "Captain changed")} aria-label="Captain">
          <option value="" disabled>Captain…</option>
          {t.members.map((m: Any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button className="ad-btn" onClick={() => post({ action: "status", teamId: t.id, status: t.status === "active" ? "away" : "active" })}>{t.status === "active" ? "Mark away" : "Mark active"}</button>
      </div>
      <div className="ad-row" style={{ marginTop: 6 }}>
        <select className="ad-in" value={into} onChange={(e) => setInto(e.target.value)} aria-label="Merge into">
          <option value="">Merge into…</option>
          {teams.filter((x) => x.id !== t.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button className="ad-btn danger" disabled={!into} onClick={() => confirm(`Merge "${t.name}" into "${teams.find((x) => x.id === into)?.name}"? Members and scores move; this can't be undone.`) && post({ action: "merge", teamId: t.id, intoId: into, confirm: true }, "Merged")}>Merge</button>
      </div>
      <div className="ad-row" style={{ marginTop: 6 }}>
        <input className="ad-in" type="number" placeholder="± pts" value={points} onChange={(e) => setPoints(e.target.value)} style={{ width: 80 }} aria-label="Points" />
        <input className="ad-in" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }} aria-label="Reason" />
        <button className="ad-btn" disabled={!Number(points) || reason.trim().length < 3} onClick={async () => { if (await post({ action: "adjust", teamId: t.id, points: Number(points), reason }, "Score adjusted")) { setPoints(""); setReason(""); } }}>Adjust</button>
      </div>
      <details style={{ marginTop: 6 }}>
        <summary className="ad-muted">{t.members.length} members</summary>
        <ul className="ad-muted">{t.members.map((m: Any) => <li key={m.id}>{m.name}{m.id === t.captainMemberId ? " (captain)" : ""} · {new Date(m.lastSeen).toLocaleTimeString()}</li>)}</ul>
      </details>
      <button className="ad-btn danger" style={{ marginTop: 6 }} onClick={() => confirm(`Remove team "${t.name}" from the party?`) && post({ action: "remove", teamId: t.id, confirm: true }, "Removed")}>Remove team</button>
    </div>
  );
}

/* ---------------- Content ---------------- */
function ContentSection({ party, run }: Ctx) {
  const { data, err, reload } = usePoll(() => api(`/api/admin/content?party=${party}`), [party]);
  const [family, setFamily] = useState("");
  const post = (b: Any) => run(async () => { await api("/api/admin/content", { method: "POST", json: { party, ...b } }); reload(); }, "Saved");
  if (err) return <p className="ad-muted">{err}</p>;
  if (!data) return <p className="ad-muted">Loading…</p>;
  const items: Any[] = data.items;
  const fams = Array.from(new Set(items.map((i) => i.family)));
  const disabled: string[] = data.disabledFamilies ?? [];
  return (
    <>
      <div className="ad-card">
        <h2>Game families</h2>
        <div className="ad-row">
          {fams.map((f) => {
            const on = !disabled.includes(f);
            const n = items.filter((i) => i.family === f);
            return (
              <button key={f} className={`ad-btn${on ? "" : " danger"}`} onClick={() => post({ family: f, enabled: !on })}>
                {f} · {n.filter((i) => i.enabled).length}/{n.length} {on ? "on" : "off"}
              </button>
            );
          })}
        </div>
        <div className="ad-row" style={{ marginTop: 10 }}>
          <select className="ad-in" value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Filter family">
            <option value="">All families</option>
            {fams.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
      </div>
      {items.filter((i) => !family || i.family === family).map((i) => (
        <details key={i.id} className="ad-card">
          <summary>
            <span className={`ad-pill ${i.enabled ? "ok" : "warn"}`}>{i.enabled ? "on" : "off"}</span> <span className="ad-pill">{i.family}</span> {i.prompt}
          </summary>
          <div style={{ marginTop: 8 }}>
            {i.promptEs ? <p className="ad-muted">{i.promptEs}</p> : null}
            {i.detail ? <p className="ad-muted" style={{ whiteSpace: "pre-line" }}>{i.detail}</p> : null}
            {i.choices?.length ? <ol type="A">{i.choices.map((t: string, k: number) => <li key={k}>{t}</li>)}</ol> : null}
            {i.answerText ? <p><b>Answer:</b> {i.answerText}</p> : <p className="ad-muted">No single correct answer (opinion / written game).</p>}
            <p>{i.explanation}</p>
            {i.source ? <p className="ad-muted">Source: <a href={i.source.url} target="_blank" rel="noreferrer noopener" style={{ color: "#f5a524" }}>{i.source.title}</a> — {i.source.verification}</p> : null}
            <p className="ad-muted">id {i.id} · difficulty {i.difficulty}</p>
            <button className="ad-btn" onClick={() => post({ contentId: i.id, enabled: !i.enabled })}>{i.enabled ? "Disable" : "Enable"}</button>
          </div>
        </details>
      ))}
    </>
  );
}

/* ---------------- Diagnostics ---------------- */
function DiagnosticsSection({ party }: Ctx) {
  const { data, err } = usePoll(() => api(`/api/admin/diagnostics?party=${party}`), [party], 5000);
  if (err) return <p className="ad-muted">{err}</p>;
  if (!data) return <p className="ad-muted">Loading…</p>;
  return (
    <>
      <div className="ad-card">
        <h2>System</h2>
        <dl className="ad-kv">
          <dt>Version</dt><dd>{data.version}</dd>
          <dt>Server time</dt><dd>{data.serverTime} (offset {Math.round((data.serverNow - Date.now()) / 1000)}s)</dd>
          <dt>Database</dt><dd>{data.db}</dd>
          <dt>Photo storage</dt><dd>{data.storage}</dd>
          <dt>Phase</dt><dd>{data.party?.phase?.kind} · {data.party?.status} · v{data.party?.version}</dd>
          <dt>Tributes</dt><dd>{JSON.stringify(data.tributeCounts)}</dd>
          <dt>Config</dt><dd>{Object.entries(data.env).map(([k, v]) => `${k}: ${v ? (typeof v === "string" ? v : "set") : "MISSING"}`).join(" · ")}</dd>
        </dl>
      </div>
      <div className="ad-card">
        <h2>Recent audit</h2>
        <table className="ad-table"><tbody>
          {data.audit.map((a: Any) => (
            <tr key={a.id}><td className="ad-muted">{new Date(a.at).toLocaleTimeString()}</td><td>{a.actor}</td><td>{a.action}</td><td className="ad-muted">{JSON.stringify(a.detail)}</td></tr>
          ))}
        </tbody></table>
      </div>
    </>
  );
}
