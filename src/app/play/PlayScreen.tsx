"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AnswerValue, InputSpec, MeView, PartyId, PublicQuestion, RevealInfo, Snapshot, Stage } from "@/shared/types";
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
import { AnswerInput, ValueSummary, incompleteReason, initialDraft, type Draft } from "./inputs";
import { CASE_MAX, inputOf, lines, rememberInput, valueText } from "@/app/tv/families";

type SubmitState = { key: string; value: AnswerValue; requestId: string; status: "pending" | "saved" | "failed"; message?: string; code?: string };

const ERR: Record<string, string> = {
  closed: "Time was up — not saved.",
  already: "Your team already locked in an answer.",
  already_locked: "Your family already locked this case — it’s final.",
  not_captain: "Only your captain’s phone can submit.",
  need_answer: "Your family needs an answer from step 1 first.",
  filtered: "Keep it family-friendly — try different words.",
  invalid: "That answer isn’t complete. Check it and try again.",
  rate_limited: "Too fast — try again in a moment.",
  no_session: "This phone lost its team — rejoin from the TV QR.",
  late_join: "You joined mid-question — play from the next one.",
};
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
  // dev mocks: simulate a server rejection (e.g. filtered) on load
  useEffect(() => {
    if (!mock || process.env.NODE_ENV === "production") return;
    import("@/client/mocks").then((m) => {
      const e = m.mockSubmitError(mock);
      const snap = m.mockSnapshot(mock);
      if (e && snap.question) setSub({ key: `${snap.question.id}:${snap.phase.stage ?? "answer"}`, value: e.value, requestId: "mock", status: "failed", code: e.code, message: ERR[e.code] });
    });
  }, [mock]);

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
      if (s.phase.kind === "reveal" && me?.current.result) cue(me.current.result.points > 0 ? "correct" : "incorrect");
    }
    lastKind.current = k;
  }, [s, stageKey, me]);

  const submit = useCallback(async (value: AnswerValue) => {
    if (!s?.question || !stageKey) return;
    const stage = (s.phase.stage ?? "answer") as Stage;
    const requestId = newRequestId();
    const key = stageKey;
    setSub({ key, value, requestId, status: "pending" });
    cue("tap");
    if (mock) { setTimeout(() => setSub((x) => x && x.requestId === requestId ? { ...x, status: "saved" } : x), 700); return; }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await api.answer(party, s.question.id, stage, value, requestId);
        setSub((x) => x && x.requestId === requestId ? { ...x, status: "saved" } : x);
        cue("saved");
        refresh();
        return;
      } catch (e) {
        const err = e as ApiFailure;
        if (err.status === 0 && attempt < 4) { await new Promise((r) => setTimeout(r, 600 * 2 ** attempt)); continue; }
        const msg = ERR[err.code] ?? (err.status === 0 ? "No connection — not saved." : "Not saved. Try again.");
        setSub((x) => x && x.requestId === requestId ? { ...x, status: "failed", message: msg, code: err.code } : x);
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
          {me.albumUrl && <a className="chip-btn" href={me.albumUrl} target="_blank" rel="noopener noreferrer"><Icon name="share" /> Party photos</a>}
          <Link className="chip-btn" href={`/install${partyQs}`}><Icon name="arrow" /> Add to home screen</Link>
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
  s: Snapshot; me: MeView; offsetMs: number; sub: SubmitState | null; submit: (v: AnswerValue) => void; openCaptain: () => void;
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
    const f = FAMILY[s.phase.family ?? "line"];
    return (
      <div className="ph-state">
        {s.phase.doubled && <div className="ph-double big"><Icon name="flame" /> Last chance — double points</div>}
        <div className="ph-eyebrow">Next up · Look at the TV</div>
        <h1 className="ph-h1 caps">{f.title}</h1>
        <p className="ph-p">{f.how}</p>
        <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} className="ph-count" />
      </div>
    );
  }
  if (kind === "question" && s.question) return <QuestionState s={s} q={s.question} me={me} offsetMs={offsetMs} sub={sub} submit={submit} openCaptain={openCaptain} />;
  if (kind === "reveal" && s.question) return <RevealState s={s} q={s.question} me={me} />;
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

function useDraft(key: string, spec: InputSpec | null, failed: SubmitState | null) {
  const [st, setSt] = useState<{ key: string; v: Draft }>({ key, v: spec ? initialDraft(spec) : null });
  // new stage → fresh draft; a rejected submission → restore what was sent so it can be fixed
  if (st.key !== key) { const v = spec ? initialDraft(spec) : null; setSt({ key, v }); return [v, (v: Draft) => setSt({ key, v })] as const; }
  const v = failed && failed.status === "failed" && st.v === (spec ? initialDraft(spec) : null) ? failed.value : st.v;
  return [v, (nv: Draft) => setSt({ key, v: nv })] as const;
}

const REASON: Record<string, { icon: string; text: string }> = {
  late_join: { icon: "eye", text: "Watching this one — you play from the next question." },
  away: { icon: "pause", text: "You’re on a break. Tap “We’re back” to rejoin next set." },
  closed: { icon: "clock", text: "Answers are closed." },
  watching: { icon: "tv", text: "Read the clues on the TV. Answers open in a moment." },
  need_answer: { icon: "alert", text: "Your family didn’t pick an answer in step 1, so there’s nothing to guess this time." },
  already_locked: { icon: "lock", text: "Your case is locked — it’s final for this set." },
};

function QuestionState({ s, q, me, offsetMs, sub, submit, openCaptain }: {
  s: Snapshot; q: PublicQuestion; me: MeView; offsetMs: number; sub: SubmitState | null; submit: (v: AnswerValue) => void; openCaptain: () => void;
}) {
  rememberInput(q);
  const stage = (s.phase.stage ?? "answer") as Stage;
  const f = FAMILY[q.family];
  const c = me.current;
  const spec = q.input;
  const key = `${q.id}:${stage}`;
  const [draft, setDraft] = useDraft(key, spec, sub);
  const [confirm, setConfirm] = useState(false);
  const serverSaved = c.saved && c.questionId === q.id && c.saved.stage === stage ? c.saved.value : null;
  const st: "idle" | "pending" | "saved" | "failed" = serverSaved != null ? "saved" : sub?.status ?? "idle";
  const savedValue = serverSaved ?? (st !== "idle" && st !== "failed" ? sub?.value ?? null : null);
  const notCaptain = c.reasonCannot === "not_captain" || !me.member.isCaptain;
  const blocked = c.reasonCannot && c.reasonCannot !== "not_captain" ? c.reasonCannot : me.team.status === "away" ? "away" : null;
  const round = (s.phase.qIndex ?? q.index) + 1;
  const isCase = q.family === "case";
  const priorSpec = c.prior ? (isCase ? inputOf(q, "assign") : inputOf(q, "choice")) : null;
  const priorRoomText = q.family === "room" && c.prior ? (inputOf(q, "choice")?.options[c.prior.value as number]?.text ?? (spec?.kind === "percent" ? spec.options?.[c.prior.value as number]?.text ?? spec.optionText : null)) : null;

  const head = (
    <>
      <div className="ph-qhead">
        <div className="ph-eyebrow">{f.title} · {isCase ? `Round ${round}/3` : `Q${q.index + 1}/3`}</div>
        <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} className="ph-count xs" />
      </div>
      {s.phase.doubled && <div className="ph-double"><Icon name="flame" /> Double points</div>}
    </>
  );

  const prompt = q.family === "calavera" || q.family === "loteria"
    ? <blockquote className={`ph-verse ${q.family}`}>{lines(q.prompt).map((l, i) => <span key={i}>{l}</span>)}{q.family === "calavera" && stage === "write" && <span className="ph-verse-blank" aria-hidden="true" />}</blockquote>
    : <h1 className={`ph-prompt ${q.prompt.length > 110 ? "long" : ""}`}>
        {q.family === "room" && stage === "guess" ? "What % of families picked the same answer as you?" : q.prompt}
      </h1>;

  const stepLabel = q.family === "calavera" ? (stage === "write" ? "Write your last line" : "Vote for the best — not your own")
    : q.family === "room" ? (stage === "answer" ? "Step 1 · Your honest answer" : "Step 2 · Guess the room")
    : isCase ? (stage === "clue" ? `Clue round ${round} · Read the TV` : `Lock now for up to ${CASE_MAX[round - 1] ?? 150}`) : null;

  // ---- read-only stage (case clue) or blocked
  const priorBlock = c.prior && (isCase || q.family === "room") ? (
    <div className="ph-prior">
      <div className="ph-prior-h">{isCase ? <><Icon name="lock" /> Your locked case</> : "Your answer"}</div>
      {q.family === "room" ? <b>{priorRoomText ?? "Saved"}</b> : <ValueSummary spec={priorSpec} value={c.prior.value} />}
    </div>
  ) : null;

  const lockLabel = isCase ? "Lock our case" : q.family === "calavera" && stage === "write" ? "Submit our line" : q.family === "calavera" ? "Cast our vote" : "Lock it in";
  const missing = spec ? incompleteReason(spec, draft) : "—";
  const editable = !!spec && !notCaptain && !blocked && st !== "saved" && st !== "pending";

  return (
    <div className={`ph-q ph-q-${q.family}`}>
      {head}
      {stepLabel && <div className="ph-step-label">{stepLabel}</div>}
      {prompt}
      {q.family === "room" && stage === "guess" && priorBlock}

      {savedValue != null && spec ? (
        <div className={`ph-locked ${st}`}>
          <div className="ph-locked-h">{st === "pending" ? <><Icon name="spinner" className="spin" /> Sending…</> : <><Icon name="check" /> Locked in for {me.team.name}</>}</div>
          <ValueSummary spec={spec} value={savedValue} />
          {st === "saved" && <p className="ph-fine left">{q.family === "calavera" && stage === "write" ? "Voting starts when the timer ends." : isCase ? "Final for the whole set. The solution comes after round 3." : "Watch the TV for the reveal."}</p>}
        </div>
      ) : !spec || blocked ? (
        <>
          {isCase && q.family === "case" && priorBlock}
          {blocked ? <div className="ph-note"><Icon name={REASON[blocked]?.icon ?? "alert"} /> {REASON[blocked]?.text ?? "You can’t answer this one."}</div>
            : <div className="ph-look-card"><Icon name="tv" size="2rem" /><span>{isCase ? "Clues are on the TV. Answers open next." : "Watch the TV."}</span></div>}
        </>
      ) : (
        <>
          {isCase && priorBlock}
          <AnswerInput spec={spec} value={draft} onChange={setDraft} disabled={!editable} ownEntryId={c.ownEntryId} />
          {notCaptain ? (
            <div className="ph-note"><Icon name="crown" /> <span>Your captain{me.team.captainName ? ` (${me.team.captainName})` : ""} submits for the team.{" "}
              <button className="link-btn" onClick={openCaptain}>Make this phone the captain</button></span></div>
          ) : (
            <div className="ph-submit">
              {st === "failed" && <div className="ph-note failed" role="alert"><Icon name="alert" /> {sub?.message ?? "Not saved."}</div>}
              <button className="btn btn-primary ph-lock" disabled={!!missing || !editable}
                onClick={() => (isCase ? setConfirm(true) : submit(draft as AnswerValue))}>
                {missing ?? <><Icon name="lock" /> {lockLabel}</>}
              </button>
              {!missing && <p className="ph-fine">No changes after you lock — decide together.</p>}
            </div>
          )}
        </>
      )}

      {confirm && spec && (
        <div className="sheet-scrim" onClick={() => setConfirm(false)}>
          <section className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="lock-h" onClick={(e) => e.stopPropagation()}>
            <h2 className="ph-h2" id="lock-h">Lock this case?</h2>
            <p className="ph-p">This is <strong>final for the whole set</strong> — you can’t change it in later rounds. Locking in round {round} is worth up to <strong>{CASE_MAX[round - 1] ?? 150}</strong> if every altar is right.</p>
            <ValueSummary spec={spec} value={draft as AnswerValue} />
            <button className="btn btn-primary" onClick={() => { setConfirm(false); submit(draft as AnswerValue); }}><Icon name="lock" /> Yes, lock it</button>
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Keep thinking</button>
          </section>
        </div>
      )}
    </div>
  );
}

function RevealState({ s, q, me }: { s: Snapshot; q: PublicQuestion; me: MeView }) {
  const r = me.current.result;
  const rv: RevealInfo | null = s.reveal;
  const answer = revealAnswer(q, rv);
  const caseMid = q.family === "case" && !(rv?.correct && typeof rv.correct === "object");
  return (
    <div className="ph-state">
      {s.phase.doubled && <div className="ph-double"><Icon name="flame" /> Double points</div>}
      {r ? (
        <div className={`ph-result ${r.points >= r.max ? "good" : r.points > 0 ? "part" : "bad"}`}>
          <div className="ph-result-pts"><strong>{r.points > 0 ? `+${r.points}` : "0"}</strong><span>of {r.max}</span></div>
          <div className="ph-result-txt"><b>{r.points >= r.max ? "Perfect!" : r.points > 0 ? "Points on the board" : "Not this time"}</b>{r.note && <span>{r.note}</span>}</div>
        </div>
      ) : caseMid ? (
        <div className="ph-result part">
          <Icon name="search" size="2rem" />
          <div className="ph-result-txt"><b>Case still open</b><span>{me.current.prior || me.current.saved ? "Your lock is in. Points arrive after round 3." : "More clues next round — locking later is worth less."}</span></div>
        </div>
      ) : <div className="ph-eyebrow">The answer</div>}
      {rv?.void && <p className="ph-p">{rv.voidReason ?? "Not enough families answered, so this one doesn’t count."}</p>}
      {answer && <div className="ph-answer"><span>{q.family === "calavera" ? "Winning line" : q.family === "room" ? "The room picked" : "Answer"}</span>{answer}</div>}
      {rv?.explanation && !caseMid && <p className="ph-p dim">{rv.explanation}</p>}
    </div>
  );
}

function revealAnswer(q: PublicQuestion, r: RevealInfo | null) {
  if (!r) return null;
  const d = (r.detail ?? {}) as Record<string, unknown>;
  switch (q.family) {
    case "loteria": return <b>{String(d.nameEs ?? valueText(q, r.correct))}<small>{String(d.nameEn ?? "")}</small></b>;
    case "closest": return <b>{valueText(q, r.correct)}</b>;
    case "line": {
      const spec = inputOf(q, "order"); const by = new Map(spec?.items.map((i) => [i.id, i.text]));
      const vals = (d.values ?? {}) as Record<string, unknown>;
      return Array.isArray(r.correct) ? <ol className="ph-sum-list">{(r.correct as string[]).map((id) => <li key={id}>{by.get(id) ?? id}{vals[id] != null && <em> · {String(vals[id])}</em>}</li>)}</ol> : null;
    }
    case "calavera": {
      const e = (Array.isArray(d.entries) ? d.entries : []) as { text: string; teamName?: string; votes?: number }[];
      const w = e.slice().sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))[0];
      return w ? <b className="ital">“{w.text}”<small>{w.teamName}</small></b> : null;
    }
    case "room": {
      const counts = (Array.isArray(d.counts) ? d.counts : []) as number[];
      const opts = (Array.isArray(d.options) ? d.options : inputOf(q, "choice")?.options ?? []) as { text: string }[];
      const i = counts.indexOf(Math.max(...counts));
      return i >= 0 && opts[i] ? <b>{opts[i].text}</b> : null;
    }
    case "case": {
      if (!r.correct || typeof r.correct !== "object" || Array.isArray(r.correct)) return null;
      const people = (Array.isArray(d.people) ? d.people : inputOf(q, "assign")?.people ?? []) as { id: string; name: string }[];
      const slots = (Array.isArray(d.slots) ? d.slots : inputOf(q, "assign")?.slots ?? []) as { id: string; label: string }[];
      return <ValueSummary spec={{ kind: "assign", people, slots }} value={r.correct} />;
    }
  }
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
            <span>Set {h.seq} · {FAMILY[h.family]?.title ?? h.family}</span>
            <span className="tags">{h.invalidated ? "Not scored" : !h.ranked ? "Practice" : h.counted ? <><Icon name="check" /> Counts</> : "Not in best 5"}{h.doubled && <span className="x2"><Icon name="flame" /> ×2</span>}</span>
            <b>{h.invalidated ? "—" : <>{h.score}<small>/{h.max}</small></>}</b>
          </li>
        ))}
        {!me.history.length && <li className="empty">No sets yet.</li>}
      </ul>
    </>
  );
}
