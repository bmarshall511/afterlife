"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MeView, PartyId, PublicQuestion, Snapshot, Stage } from "@/shared/types";
import { useSnapshot } from "@/client/store";
import { useMe } from "@/client/useMe";
import { api, ApiFailure, newRequestId } from "@/client/api";
import { cue, cuesEnabled, setCues, canVibrate } from "@/client/cues";
import { Backdrop } from "@/components/Backdrop";
import { Wordmark, FAMILY } from "@/components/Brand";
import { Countdown } from "@/components/Countdown";
import { Icon } from "@/components/Icon";
import { JoinQR } from "@/components/JoinQR";
import { Avatar } from "@/components/Avatar";

type SubmitState = { key: string; choice: number; requestId: string; status: "pending" | "saved" | "failed"; message?: string };
type Sheet = null | "invite" | "history" | "captain";

export function PlayScreen({ party, mock }: { party: PartyId; mock: string | null }) {
  const { snapshot: s, online, offsetMs } = useSnapshot(party, { intervalMs: 1500, mock });
  const { me, status, refresh, setMe } = useMe(party, s?.version, mock);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sub, setSub] = useState<SubmitState | null>(null);
  const [sound, setSound] = useState(false);
  const [busy, setBusy] = useState(false);
  const partyQs = party === "demo" ? "?party=demo" : "";

  useEffect(() => { setSound(cuesEnabled()); }, []);

  const stageKey = s?.phase.kind === "question" && s.question ? `${s.question.id}:${s.phase.stage ?? "answer"}` : null;
  // drop local pressed state when the stage/question changes (stale controls disabled)
  useEffect(() => { setSub((x) => (x && x.key !== stageKey ? null : x)); }, [stageKey]);

  // cues on phase changes (opt-in)
  const lastKind = useRef<string | null>(null);
  useEffect(() => {
    if (!s) return;
    const k = s.phase.kind + (stageKey ?? "");
    if (lastKind.current && lastKind.current !== k) {
      if (s.phase.kind === "question") cue("open");
      if (s.phase.kind === "reveal" && me?.current.result) cue(me.current.result.correct ? "correct" : "incorrect");
    }
    lastKind.current = k;
  }, [s, stageKey, me]);

  const submit = useCallback(async (choice: number) => {
    if (!s?.question || !stageKey) return;
    const stage = (s.phase.stage ?? "answer") as Stage;
    const requestId = newRequestId();
    const key = stageKey;
    setSub({ key, choice, requestId, status: "pending" });
    cue("tap");
    if (mock) { setTimeout(() => setSub((x) => x && x.requestId === requestId ? { ...x, status: "saved" } : x), 700); return; }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await api.answer(party, s.question.id, stage, choice, requestId);
        setSub((x) => x && x.requestId === requestId ? { ...x, status: "saved" } : x);
        cue("saved");
        refresh();
        return;
      } catch (e) {
        const err = e as ApiFailure;
        if (err.status === 0 && attempt < 4) { await new Promise((r) => setTimeout(r, 600 * 2 ** attempt)); continue; }
        const msg = err.code === "closed" ? "Time was up — not saved." : err.code === "already" ? "Your team already locked in an answer." :
          err.code === "not_captain" ? "Only your captain’s phone can submit." : err.code === "need_preference" ? "Your team needs a saved favorite first." : err.code === "rate_limited" ? "Too fast — try again in a moment." : err.code === "no_session" ? "This phone lost its team — rejoin from the TV QR." : err.code === "late_join" ? "You joined mid-question — play from the next one." :
          err.status === 0 ? "No connection — not saved." : "Not saved. Try again.";
        setSub((x) => x && x.requestId === requestId ? { ...x, status: "failed", message: msg } : x);
        refresh();
        return;
      }
    }
  }, [s, stageKey, party, mock, refresh]);

  const teamAction = async (action: "away" | "resume" | "claim_captain") => {
    if (mock) return;
    setBusy(true);
    try { setMe(await api.team(party, action)); } catch { /* surfaced by next refresh */ } finally { setBusy(false); refresh(); }
  };

  if (status === "anonymous") {
    return (
      <main className="phone">
        <Backdrop state="amber" variant="phone" dim="heavy" />
        <div className="ph-body ph-center">
          <Wordmark size="sm" />
          <h1 className="ph-h1">Join the game</h1>
          <p className="ph-p">This phone isn’t on a team yet.</p>
          <Link className="btn btn-primary" href={`/join${partyQs}`}>Join <Icon name="arrow" /></Link>
        </div>
      </main>
    );
  }

  const kind = s?.phase.kind;
  return (
    <main className="phone">
      <Backdrop state={s?.backdrop ?? "amber"} variant="phone" dim="heavy" petals={kind === "results"} />
      {!online && <div className="ph-banner" role="status"><Icon name="wifi" /> Reconnecting… your answers are safe.</div>}
      <header className="ph-top">
        <Wordmark size="sm" tagline={false} />
        {me && <TeamChip me={me} />}
      </header>

      <div className="ph-body">
        {me && s && !me.current.ranked && (kind === "question" || kind === "reveal") && (
          <div className="ph-practice"><Icon name="clock" /> Practice set — your ranked play starts next set</div>
        )}
        {!s || !me ? <Loading /> : <Stateful s={s} me={me} offsetMs={offsetMs} sub={sub && sub.key === stageKey ? sub : null}
          submit={submit} openCaptain={() => setSheet("captain")} />}
      </div>

      {me && (
        <nav className="ph-actions" aria-label="Team options">
          {me.team.status === "away"
            ? <button className="chip-btn on" disabled={busy} onClick={() => teamAction("resume")}><Icon name="play" /> We’re back</button>
            : <button className="chip-btn" disabled={busy} onClick={() => teamAction("away")}><Icon name="pause" /> Taking a break</button>}
          <button className="chip-btn" onClick={() => setSheet("invite")}><Icon name="share" /> Invite</button>
          <button className="chip-btn" onClick={() => setSheet("history")}><Icon name="history" /> Scores</button>
          <button className="chip-btn" aria-pressed={sound} onClick={() => { const v = !sound; setCues(v); setSound(v); }}>
            <Icon name={sound ? "sound" : "mute"} /> {sound ? (canVibrate() ? "Sound & buzz on" : "Sound on") : "Sound off"}
          </button>
        </nav>
      )}

      {sheet && me && (
        <div className="sheet-scrim" onClick={() => setSheet(null)}>
          <section className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {sheet === "invite" && <InviteSheet me={me} party={party} />}
            {sheet === "history" && <HistorySheet me={me} />}
            {sheet === "captain" && (
              <>
                <h2 className="ph-h2">Make this phone the captain?</h2>
                <p className="ph-p">{me.team.captainName ?? "The current captain"} will no longer be able to submit. Only do this if you’re sitting together.</p>
                <button className="btn btn-primary" disabled={busy} onClick={async () => { await teamAction("claim_captain"); setSheet(null); }}><Icon name="crown" /> Yes, make me captain</button>
              </>
            )}
            <button className="btn btn-ghost" onClick={() => setSheet(null)}>Close</button>
          </section>
        </div>
      )}
    </main>
  );
}

function Loading() {
  return <div className="ph-state"><div className="ph-spinner" aria-hidden="true" /><p className="ph-p">Connecting to the party…</p></div>;
}

function TeamChip({ me }: { me: MeView }) {
  return (
    <div className="team-chip">
      <Avatar className="team-avatar" id={me.team.avatar} color={me.team.color} name={me.team.name} />
      <span className="team-name">{me.team.name}</span>
      {me.member.isCaptain && <span className="cap-badge"><Icon name="crown" /> Captain</span>}
    </div>
  );
}

function Stateful({ s, me, offsetMs, sub, submit, openCaptain }: {
  s: Snapshot; me: MeView; offsetMs: number; sub: SubmitState | null; submit: (c: number) => void; openCaptain: () => void;
}) {
  const kind = s.phase.kind;
  if (s.status === "paused") return <Card icon="pause" title="Paused" text="The host paused the game. Hang tight." />;
  if (me.team.status === "away" && kind !== "question" && kind !== "reveal") {
    return <Card icon="pause" title="Taking a break" text="Your family sits out upcoming sets. Tap “We’re back” when you’re ready — you rejoin at the next set." />;
  }
  if (kind === "ambient" || s.status === "idle") {
    return <Card icon="clock" title="Starting soon" text="You’re in. When the first set begins, watch the TV — your choices appear here." />;
  }
  if (kind === "intro") {
    const f = FAMILY[s.phase.family ?? "memory"];
    return (
      <div className="ph-state">
        <div className="ph-eyebrow">Next up · Look at the TV</div>
        <h1 className="ph-h1 caps">{f.title}</h1>
        <p className="ph-p">{f.how}</p>
        <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} className="ph-count" />
      </div>
    );
  }
  if (kind === "question" && s.question) return <QuestionState s={s} q={s.question} me={me} offsetMs={offsetMs} sub={sub} submit={submit} openCaptain={openCaptain} />;
  if (kind === "reveal") {
    const r = me.current.result;
    const q = s.question;
    const corr = s.reveal ? (Array.isArray(s.reveal.correct) ? s.reveal.correct : s.reveal.correct == null ? [] : [s.reveal.correct]) : [];
    return (
      <div className="ph-state">
        {r ? (
          <div className={`ph-result ${r.correct ? "good" : "bad"}`}>
            <Icon name={r.correct ? "check" : "x"} size="2.2rem" />
            <div><strong>{r.correct ? "Correct!" : "Not this time"}</strong><span>{r.points > 0 ? `+${r.points} points` : "0 points"}</span></div>
          </div>
        ) : <div className="ph-eyebrow">The answer</div>}
        {q && corr.length > 0 && <p className="ph-p">Answer: <strong>{corr.map((i) => `${q.options[i]?.label === q.options[i]?.text ? "" : q.options[i]?.label + " · "}${q.options[i]?.text}`).join(", ")}</strong></p>}
        {s.reveal?.explanation && <p className="ph-p dim">{s.reveal.explanation}</p>}
      </div>
    );
  }
  if (kind === "results") {
    const mine = s.lastSet?.scores.find((x) => x.teamId === me.team.id);
    const won = s.lastSet?.winners.includes(me.team.id);
    const row = s.standings.find((x) => x.teamId === me.team.id);
    return (
      <div className="ph-state">
        <div className="ph-eyebrow">Set results</div>
        <h1 className="ph-h1">{won ? "You won the set!" : "Set complete"}</h1>
        {mine && <div className="ph-bigscore">{mine.score}<span>points this set{mine.perfect ? " · Perfect" : ""}{!mine.ranked ? " · Practice" : ""}</span></div>}
        {row && <p className="ph-p">{row.qualified ? `Party rank #${row.rank} · ${row.total.toLocaleString("en-US")}` : `Qualifying: ${row.setsCounted}/5 sets · ${row.total.toLocaleString("en-US")}`}</p>}
      </div>
    );
  }
  // interval
  const t = s.phase.tribute;
  return (
    <div className="ph-state">
      <div className="ph-eyebrow">Break · Un descanso</div>
      <h1 className="ph-h1">{t ? "Look at the TV" : "Stretch, refill, mingle"}</h1>
      <p className="ph-p">{t ? `Remembering ${t.personName}.` : "The next set starts on its own."}</p>
      {s.mode !== "tribute_only" && <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} className="ph-count sm" />}
      <p className="ph-p dim">Want to remember someone on the TV? Ask your host for the upload link.</p>
    </div>
  );
}

function QuestionState({ s, q, me, offsetMs, sub, submit, openCaptain }: {
  s: Snapshot; q: PublicQuestion; me: MeView; offsetMs: number; sub: SubmitState | null; submit: (c: number) => void; openCaptain: () => void;
}) {
  const stage = s.phase.stage ?? "answer";
  const f = FAMILY[q.family];
  if (stage === "expose") {
    return (
      <div className="ph-state">
        <div className="ph-eyebrow">{f.title}</div>
        <div className="ph-look"><Icon name="tv" size="3rem" /></div>
        <h1 className="ph-h1">Look at the TV</h1>
        <p className="ph-p">Remember everything — the scene won’t be on your phone.</p>
        <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} className="ph-count sm" />
      </div>
    );
  }
  const c = me.current;
  const serverSaved = c.saved && c.questionId === q.id && c.stage === stage ? c.saved.choice : null;
  const selected = serverSaved ?? sub?.choice ?? null;
  const st: "idle" | "pending" | "saved" | "failed" = serverSaved != null ? "saved" : sub?.status ?? "idle";
  const notCaptain = c.reasonCannot === "not_captain" || !me.member.isCaptain;
  const blocked = c.reasonCannot && c.reasonCannot !== "not_captain" ? c.reasonCannot : null;
  const locked = st === "saved" || st === "pending";
  const disabled = notCaptain || !!blocked || locked || me.team.status === "away";

  return (
    <div className="ph-q">
      <div className="ph-qhead">
        <div className="ph-eyebrow">{f.title} · Q{q.index + 1}/3{q.family === "family" ? (stage === "prefer" ? " · Your favorite" : " · Guess the crowd") : ""}</div>
        <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} className="ph-count xs" />
      </div>
      <h1 className={`ph-prompt ${q.prompt.length > 110 ? "long" : ""}`}>
        {q.family === "family" && stage === "predict" ? `What did most families pick? — ${q.prompt}` : q.prompt}
      </h1>
      {q.family === "family" && stage === "predict" && c.savedPrefer != null && (
        <p className="ph-p dim">Your favorite: {q.options[c.savedPrefer]?.text}</p>
      )}
      <div className={`ph-options n${q.options.length}`} role="group" aria-label="Answer choices">
        {q.options.map((o, i) => {
          const isSel = selected === i;
          const isTF = o.label === o.text;
          return (
            <button key={i} className={`ph-opt ${isSel ? "sel " + st : ""}`} disabled={disabled && !(st === "failed" && isSel)}
              aria-pressed={isSel} onClick={() => submit(i)}>
              <span className="ph-opt-label">{isTF ? <Icon name={o.icon ?? (i === 0 ? "check" : "x")} /> : o.label}</span>
              <span className="ph-opt-text">{o.text}</span>
              {isSel && <span className="ph-opt-state"><Icon name={st === "saved" ? "check" : st === "failed" ? "alert" : "spinner"} className={st === "pending" ? "spin" : ""} /></span>}
            </button>
          );
        })}
      </div>
      <div className="ph-status" aria-live="polite">
        {notCaptain ? (
          <div className="ph-note"><Icon name="crown" /> <span>Your captain{me.team.captainName ? ` (${me.team.captainName})` : ""} submits for the team.{" "}
            <button className="link-btn" onClick={openCaptain}>Make this phone the captain</button></span></div>
        ) : blocked === "late_join" ? <div className="ph-note"><Icon name="eye" /> Watching this one — you play from the next question.</div>
          : blocked === "away" || me.team.status === "away" ? <div className="ph-note"><Icon name="pause" /> You’re on a break. Tap “We’re back” to rejoin next set.</div>
          : blocked === "closed" ? <div className="ph-note"><Icon name="clock" /> Answers are closed.</div>
          : blocked === "need_preference" ? <div className="ph-note"><Icon name="alert" /> No favorite saved — you can still watch.</div>
          : st === "pending" ? <div className="ph-note pending"><Icon name="spinner" className="spin" /> Sending…</div>
          : st === "saved" ? <div className="ph-note saved"><Icon name="check" /> Saved — locked in for {me.team.name}</div>
          : st === "failed" ? <div className="ph-note failed"><Icon name="alert" /> {sub?.message ?? "Not saved."} Tap your choice to retry.</div>
          : <div className="ph-note"><Icon name="people" /> Decide together, then tap.</div>}
      </div>
    </div>
  );
}

function Card({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="ph-state"><div className="ph-look"><Icon name={icon} size="2.6rem" /></div><h1 className="ph-h1">{title}</h1><p className="ph-p">{text}</p></div>;
}

function InviteSheet({ me, party }: { me: MeView; party: PartyId }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const u = new URL("/join", window.location.origin);
    u.searchParams.set("code", me.team.inviteCode);
    if (party === "demo") u.searchParams.set("party", "demo");
    setUrl(u.toString());
  }, [me.team.inviteCode, party]);
  return (
    <>
      <h2 className="ph-h2">Invite to {me.team.name}</h2>
      <p className="ph-p">Others can follow along on their own phone. Only the captain submits.</p>
      {url && <JoinQR url={url} className="ph-qr" label="QR code to join your team" />}
      <p className="ph-code">Team code <strong>{me.team.inviteCode}</strong></p>
      <button className="btn btn-secondary" onClick={async () => {
        try { if (navigator.share) await navigator.share({ title: "Join our AFTERLIFE team", url }); else { await navigator.clipboard.writeText(url); setCopied(true); } }
        catch { /* dismissed */ }
      }}><Icon name="share" /> {copied ? "Link copied" : "Share link"}</button>
    </>
  );
}

function HistorySheet({ me }: { me: MeView }) {
  return (
    <>
      <h2 className="ph-h2">Your sets</h2>
      <p className="ph-p dim">Your best five ranked sets make your party score — a slow start won’t hurt. Practice sets don’t count.</p>
      <div className="ph-total">{me.total.toLocaleString("en-US")}<span>{me.setsCounted}/5 best sets counted</span></div>
      <ul className="ph-history">
        {me.history.slice().reverse().map((h) => (
          <li key={h.setId} className={h.counted ? "counted" : ""}>
            <span>Set {h.seq} · {FAMILY[h.family].title}</span>
            <span className="tags">{h.invalidated ? "Not scored" : !h.ranked ? "Practice" : h.counted ? <><Icon name="check" /> Counts</> : "Not in best 5"}{h.normalized ? " · scaled" : ""}</span>
            <b>{h.invalidated ? "—" : h.score}</b>
          </li>
        ))}
        {!me.history.length && <li className="empty">No sets yet.</li>}
      </ul>
    </>
  );
}
