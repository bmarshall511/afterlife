"use client";
/**
 * TV views for the six v2 families (question stages + reveals).
 *
 * Reveal `detail` shapes read here (all optional; views degrade gracefully):
 *  calavera: { entries: [{id, text, teamName|null, votes, winner?, house?}], house: string[] }
 *  line:     { items: [{id,text,display}] } or { values: {itemId: display} }   correct = item ids, true order
 *  loteria:  { card: {es, en} } or { nameEs, nameEn }                        correct = option index
 *  room:     { options: [{label,text}], counts: number[], guesses: [{teamId,name,option,guess|null,actual}] }
 *  closest:  { unit, min, max }                                              correct = number; guesses = outcomes[].value
 *  case:     q1/q2 { locked, thinking }; q3 { final: true, people?, slots? }; correct = {personId: slotId} (only on q3)
 * Case scene data (q.scene.data): { people:[{id,name,bio,offering,icon}], slots:[{id,label}], clues?:[{text,round}] }
 * The case board is drawn here in HTML (not via SceneView) so names/bios/clues stay legible at TV distance.
 */
import type { CSSProperties } from "react";
import type { AnswerValue, InputSpec, PublicQuestion, QuestionOption, RevealInfo, Snapshot } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { OptionIcon } from "@/games/scenes/SceneView";

type Rec = Record<string, unknown>;
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Remember inputs seen earlier for a question (e.g. room options during the guess stage, line items during reveal). */
const seen = new Map<string, InputSpec[]>();
export function rememberInput(q: PublicQuestion | null | undefined) {
  if (!q?.input) return;
  const list = seen.get(q.id) ?? [];
  if (!list.some((x) => x.kind === q.input!.kind)) seen.set(q.id, [...list, q.input]);
}
export function inputOf<K extends InputSpec["kind"]>(q: PublicQuestion, kind: K): Extract<InputSpec, { kind: K }> | null {
  if (q.input?.kind === kind) return q.input as Extract<InputSpec, { kind: K }>;
  return (seen.get(q.id)?.find((x) => x.kind === kind) as Extract<InputSpec, { kind: K }>) ?? null;
}

export function lines(text: string | undefined | null): string[] {
  return (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

/* ================================================================ shared */

export function Locked({ s, label }: { s: Snapshot; label: string }) {
  if (!s.eligibleCount) return null;
  const n = Math.min(s.answeredCount, s.eligibleCount);
  return (
    <div className="tv-locked" aria-live="polite">
      <span className="tv-locked-dots" aria-hidden="true">
        {Array.from({ length: Math.min(s.eligibleCount, 12) }, (_, i) => <i key={i} className={i < n ? "on" : ""} />)}
      </span>
      {n} of {s.eligibleCount} {s.eligibleCount === 1 ? "family" : "families"} {label}
    </div>
  );
}

export function Outcomes({ reveal, max = 100, limit = 8 }: { reveal: RevealInfo | null; max?: number; limit?: number }) {
  const o = reveal?.outcomes;
  if (!o?.length) return null;
  const rows = o.slice().sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).slice(0, limit);
  return (
    <ol className="tv-outcomes" aria-label="Points this question">
      {rows.map((r, i) => (
        <li key={r.teamId} style={{ animationDelay: `${0.5 + i * 0.07}s` }} className={r.points >= max ? "top" : r.points === 0 ? "zero" : ""}>
          <span className="n">{r.name}</span>
          <b>{r.points > 0 ? `+${r.points}` : "0"}</b>
        </li>
      ))}
    </ol>
  );
}

function Explain({ reveal }: { reveal: RevealInfo | null }) {
  if (!reveal) return null;
  return (
    <>
      {reveal.explanation && <p className="tv-explain">{reveal.explanation}</p>}
      {reveal.source?.title && <p className="tv-source">Source · {reveal.source.title}</p>}
    </>
  );
}

function Void({ reveal }: { reveal: RevealInfo }) {
  return (
    <div className="tv-void">
      <Icon name="alert" /> <span>This one doesn’t count — {reveal.voidReason ?? "not enough families answered"}.</span>
    </div>
  );
}

/* ============================================================== calavera */

function Verse({ q, size }: { q: PublicQuestion; size: "lg" | "sm" }) {
  return (
    <blockquote className={`cal-verse ${size}`}>
      {lines(q.prompt).map((l, i) => <span key={i} className="cal-line">{l}</span>)}
    </blockquote>
  );
}

export function CalaveraQ({ s, q }: { s: Snapshot; q: PublicQuestion }) {
  const stage = s.phase.stage;
  if (stage === "vote") {
    const entries = inputOf(q, "vote")?.entries ?? [];
    return (
      <div className="tv-body cal-vote">
        <div className="tv-eyebrow accent">Vote for the best epitaph · not your own</div>
        <Verse q={q} size="sm" />
        <ol className={`cal-entries ${entries.length > 5 ? "two" : ""}`}>
          {entries.map((e, i) => (
            <li key={e.id} style={{ animationDelay: `${0.12 * i}s` }}>
              <span className="cal-letter">{String.fromCharCode(65 + i)}</span>
              <span className="cal-text">{e.text}</span>
            </li>
          ))}
        </ol>
        <Locked s={s} label="voted" />
      </div>
    );
  }
  return (
    <div className="tv-body cal-write">
      <div className="tv-eyebrow accent">Write the last line on your phone</div>
      <div className="cal-card">
        <div className="cal-orn" aria-hidden="true">✦ &nbsp;Calavera literaria&nbsp; ✦</div>
        <Verse q={q} size="lg" />
        <div className="cal-blank" aria-label="Your punchline goes here"><span /></div>
        {q.detail && <p className="cal-detail">{q.detail}</p>}
      </div>
      <Locked s={s} label="done writing" />
    </div>
  );
}

interface CalEntry { id: string; text: string; teamName?: string | null; votes?: number; winner?: boolean; house?: boolean }
export function CalaveraR({ q, reveal }: { q: PublicQuestion; reveal: RevealInfo | null }) {
  const d = rec(reveal?.detail);
  const entries = arr<CalEntry>(d.entries).slice().sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  const top = Math.max(1, ...entries.map((e) => e.votes ?? 0));
  const house = arr<string>(d.house);
  return (
    <div className="tv-body cal-reveal">
      <Verse q={q} size="sm" />
      {reveal?.void ? <Void reveal={reveal} /> : (
        <ol className="cal-results">
          {entries.map((e, i) => {
            const win = e.winner ?? (i === 0 && (e.votes ?? 0) > 0);
            return (
              <li key={e.id} className={win ? "win" : ""} style={{ animationDelay: `${0.15 * i}s` }}>
                <div className="cal-r-text">{e.text}</div>
                <div className="cal-r-meta">
                  <span className="cal-r-team">{win && <Icon name="crown" />}{e.house ? "The house" : e.teamName ?? "—"}</span>
                  <span className="cal-r-bar" aria-hidden="true"><i style={{ width: `${((e.votes ?? 0) / top) * 100}%`, animationDelay: `${0.4 + 0.15 * i}s` }} /></span>
                  <b>{e.votes ?? 0} {(e.votes ?? 0) === 1 ? "vote" : "votes"}</b>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {house.length > 0 && (
        <div className="cal-house">
          <span>The house would have said</span>
          {house.slice(0, 2).map((h, i) => <em key={i}>{h}</em>)}
        </div>
      )}
    </div>
  );
}

/* ================================================================== line */

function LineAxis({ low, high }: { low: string; high: string }) {
  return (
    <div className="line-axis" aria-hidden="true">
      <span>{low}</span><i /><span>{high}</span>
    </div>
  );
}

export function LineQ({ s, q }: { s: Snapshot; q: PublicQuestion }) {
  const spec = inputOf(q, "order");
  return (
    <div className="tv-body line-q">
      <h2 className="tv-statement md">{q.prompt}</h2>
      {spec && (
        <>
          <ol className={`line-cards n${spec.items.length}`} style={{ ["--n" as string]: spec.items.length } as CSSProperties}>
            {spec.items.map((it, i) => (
              <li key={it.id} style={{ animationDelay: `${0.1 * i}s` }}>
                {it.icon && <OptionIcon icon={it.icon} size={56} />}
                <span>{it.text}</span>
              </li>
            ))}
          </ol>
          <LineAxis low={spec.lowLabel} high={spec.highLabel} />
        </>
      )}
      <Locked s={s} label="locked in" />
    </div>
  );
}

export function LineR({ q, reveal }: { q: PublicQuestion; reveal: RevealInfo | null }) {
  const spec = inputOf(q, "order");
  const d = rec(reveal?.detail);
  const items = spec?.items ?? arr<{ id: string; text: string }>(d.items);
  const order = Array.isArray(reveal?.correct) ? (reveal!.correct as string[]) : items.map((i) => i.id);
  const values: Rec = { ...rec(d.values) };
  for (const it of arr<{ id: string; display?: string }>(d.items)) if (it.display) values[it.id] = it.display;
  const byId = new Map(items.map((i) => [i.id, i]));
  const from = new Map(items.map((i, k) => [i.id, k]));
  return (
    <div className="tv-body line-r">
      <h2 className="tv-prompt muted">{q.prompt}</h2>
      <ol className={`line-cards revealed n${order.length}`} style={{ ["--n" as string]: order.length } as CSSProperties}>
        {order.map((id, k) => {
          const it = byId.get(id);
          const v = values[id];
          return (
            <li key={id} style={{ ["--d" as string]: (from.get(id) ?? k) - k, animationDelay: `${0.05 * k}s` } as CSSProperties}>
              <em className="line-rank">{k + 1}</em>
              <span>{it?.text ?? id}</span>
              {v != null && <b className="line-val" style={{ animationDelay: `${1.1 + 0.12 * k}s` }}>{String(v)}</b>}
            </li>
          );
        })}
      </ol>
      {spec && <LineAxis low={spec.lowLabel} high={spec.highLabel} />}
      <div className="tv-r-foot"><div><Explain reveal={reveal} /></div><Outcomes reveal={reveal} /></div>
    </div>
  );
}

/* =============================================================== loteria */

function LotCard({ o, i, state, flip }: { o: QuestionOption; i: number; state?: "win" | "dim"; flip?: { es: string; en: string } }) {
  return (
    <li className={`lot-card ${state ?? ""}`} style={{ animationDelay: `${0.05 * i}s` }}>
      <div className="lot-inner">
        <div className="lot-face">
          <span className="lot-n">{i + 1}</span>
          <div className="lot-art" data-n={o.label}><OptionIcon icon={o.icon} size={120} /></div>
          <span className="lot-name">{o.text}</span>
        </div>
        {flip && (
          <div className="lot-back">
            <span className="lot-n">{i + 1}</span>
            <div className="lot-art" data-n={o.label}><OptionIcon icon={o.icon} size={120} /></div>
            <span className="lot-es">{flip.es}</span>
            <span className="lot-en">{flip.en}</span>
          </div>
        )}
      </div>
    </li>
  );
}

export function LoteriaQ({ s, q }: { s: Snapshot; q: PublicQuestion }) {
  const opts = inputOf(q, "choice")?.options ?? [];
  return (
    <div className="tv-body lot">
      <div className="lot-verse">
        <div className="tv-eyebrow accent">¿Quién soy? · Who am I?</div>
        <blockquote className="lot-riddle">{lines(q.prompt).map((l, i) => <span key={i}>{l}</span>)}</blockquote>
        <Locked s={s} label="locked in" />
      </div>
      <ol className={`lot-grid n${opts.length}`}>{opts.map((o, i) => <LotCard key={i} o={o} i={i} />)}</ol>
    </div>
  );
}

export function LoteriaR({ q, reveal }: { q: PublicQuestion; reveal: RevealInfo | null }) {
  const opts = inputOf(q, "choice")?.options ?? [];
  const c = typeof reveal?.correct === "number" ? reveal.correct : -1;
  const d = rec(reveal?.detail);
  const card = rec(d.card);
  const en = str(card.en) ?? str(d.nameEn) ?? opts[c]?.text ?? "";
  const es = str(card.es) ?? str(d.nameEs) ?? en;
  return (
    <div className="tv-body lot">
      <div className="lot-verse">
        <div className="tv-eyebrow accent">La carta</div>
        <h2 className="lot-answer"><span>{es}</span><small>{en}</small></h2>
        <Explain reveal={reveal} />
        <Outcomes reveal={reveal} limit={6} />
      </div>
      <ol className={`lot-grid n${opts.length} revealed`}>
        {opts.map((o, i) => <LotCard key={i} o={o} i={i} state={i === c ? "win" : "dim"} flip={i === c ? { es, en } : undefined} />)}
      </ol>
    </div>
  );
}

/* ================================================================== room */

export function RoomQ({ s, q }: { s: Snapshot; q: PublicQuestion }) {
  const opts = inputOf(q, "choice")?.options ?? [];
  if (s.phase.stage === "guess") {
    return (
      <div className="tv-body room-guess">
        <div className="tv-eyebrow accent">Step 2 · Guess the room</div>
        <h2 className="tv-statement md">What % of families picked the same answer as you?</h2>
        <p className="room-q-small">{q.prompt}</p>
        {opts.length > 0 && <ol className="room-chips">{opts.map((o) => <li key={o.label}><b>{o.label}</b>{o.text}</li>)}</ol>}
        <div className="room-scale" aria-hidden="true"><span>0%</span><i /><span>50%</span><i /><span>100%</span></div>
        <Locked s={s} label="guessed" />
      </div>
    );
  }
  return (
    <div className="tv-body room-q">
      <div className="tv-eyebrow accent">Step 1 · Your family’s honest answer</div>
      <h2 className="tv-statement md">{q.prompt}</h2>
      <ol className="tv-options cols-2">
        {opts.map((o, i) => (
          <li key={i} className="tv-opt"><span className="tv-opt-label">{o.label}</span><span className="tv-opt-text">{o.text}</span></li>
        ))}
      </ol>
      <Locked s={s} label="answered" />
    </div>
  );
}

interface Guess { teamId: string; name: string; option: number; guess: number | null; actual: number }
export function RoomR({ q, reveal }: { q: PublicQuestion; reveal: RevealInfo | null }) {
  const d = rec(reveal?.detail);
  const opts = arr<QuestionOption>(d.options).length ? arr<QuestionOption>(d.options) : inputOf(q, "choice")?.options ?? [];
  const counts = arr<number>(d.counts);
  const total = Math.max(1, counts.reduce((a, b) => a + b, 0));
  const pct = counts.map((c) => Math.round((100 * c) / total));
  const top = Math.max(...pct, 1);
  const guesses = arr<Guess>(d.guesses);
  const pts = new Map((reveal?.outcomes ?? []).map((o) => [o.teamId, o.points]));
  return (
    <div className="tv-body room-r">
      <h2 className="tv-prompt muted">{q.prompt}</h2>
      {reveal?.void && <Void reveal={reveal} />}
      <div className="room-r-grid">
        <ol className="room-bars" aria-label="How the room answered">
          {opts.map((o, i) => (
            <li key={i} className={pct[i] === top ? "top" : ""}>
              <span className="room-bar-label"><b>{o.label}</b>{o.text}</span>
              <span className="room-bar"><i style={{ width: `${pct[i] ?? 0}%`, animationDelay: `${0.15 * i}s` }} /></span>
              <strong>{pct[i] ?? 0}%</strong>
            </li>
          ))}
        </ol>
        {guesses.length > 0 && (
          <table className="room-guesses">
            <thead><tr><th>Family</th><th>Guessed</th><th>Actual</th><th>Pts</th></tr></thead>
            <tbody>
              {guesses.slice().sort((a, b) => (pts.get(b.teamId) ?? 0) - (pts.get(a.teamId) ?? 0)).slice(0, 7).map((g) => (
                <tr key={g.teamId}>
                  <td><span className="n">{g.name}</span> <small>{opts[g.option]?.label ?? ""}</small></td>
                  <td>{g.guess == null ? "—" : `${g.guess}%`}</td>
                  <td>{g.actual}%</td>
                  <td><b>{pts.get(g.teamId) ?? 0}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Explain reveal={reveal} />
    </div>
  );
}

/* =============================================================== closest */

export function ClosestQ({ s, q }: { s: Snapshot; q: PublicQuestion }) {
  const spec = inputOf(q, "number");
  return (
    <div className="tv-body closest-q">
      <h2 className={`tv-statement ${q.prompt.length > 110 ? "sm" : ""}`}>{q.prompt}</h2>
      <div className="closest-tags">
        {(spec?.unit || q.detail) && <span className="closest-unit">{q.detail ?? <>Answer in <b>{spec?.unit}</b></>}</span>}
        <span className="closest-rule"><Icon name="bust" /> Over the real number scores zero</span>
      </div>
      <Locked s={s} label="locked in" />
    </div>
  );
}

export function ClosestR({ q, reveal }: { q: PublicQuestion; reveal: RevealInfo | null }) {
  const spec = inputOf(q, "number");
  const d = rec(reveal?.detail);
  const truth = num(reveal?.correct) ?? num(d.value) ?? 0;
  const unit = str(d.unit) ?? spec?.unit ?? "";
  const guesses = (reveal?.outcomes ?? []).map((o) => ({ ...o, v: num(o.value) })).filter((o) => o.v != null) as { teamId: string; name: string; points: number; v: number; note?: string }[];
  const lo = Math.min(num(d.min) ?? spec?.min ?? 0, truth, ...guesses.map((g) => g.v));
  const hiRaw = Math.max(truth, ...guesses.map((g) => g.v));
  const hi = Math.max(hiRaw * 1.08, truth * 1.25, lo + 1);
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const sorted = guesses.slice().sort((a, b) => a.v - b.v);
  // lay labels into 4 lanes (above/below × near/far) so close guesses never collide
  const laneEnd = [-1e9, -1e9, -1e9, -1e9];
  const lanes = sorted.map((g) => {
    const p = ((g.v - lo) / (hi - lo)) * 100;
    const w = Math.max(9, Math.min(22, g.name.length * 1.15));
    let k = laneEnd.findIndex((e) => e <= p - w / 2);
    if (k < 0) k = laneEnd.indexOf(Math.min(...laneEnd));
    laneEnd[k] = p + w / 2 + 1;
    return k;
  });
  const fmt = (v: number) => `${v.toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`;
  return (
    <div className="tv-body closest-r">
      <h2 className="tv-prompt muted">{q.prompt}</h2>
      <div className="closest-truth"><span>The answer</span><b>{fmt(truth)}</b></div>
      <div className="nl" role="img" aria-label={`Number line: true value ${fmt(truth)}; ${sorted.map((g) => `${g.name} ${fmt(g.v)}${g.v > truth ? " (over)" : ""}`).join("; ")}`}>
        <div className="nl-track" />
        <div className="nl-bust" style={{ left: x(truth) }}><span>Bust zone</span></div>
        <div className="nl-truth" style={{ left: x(truth) }}><i /></div>
        {sorted.map((g, i) => {
          const bust = g.v > truth;
          return (
            <div key={g.teamId} className={`nl-pin ${bust ? "bust" : ""} l${lanes[i]}`} style={{ left: x(g.v), animationDelay: `${0.3 + 0.12 * i}s` }}>
              <span className="nl-dot">{bust && <Icon name="x" />}</span>
              <span className="nl-lab"><b>{g.name}</b><small>{fmt(g.v)}{bust ? " · Over" : ""}</small></span>
            </div>
          );
        })}
        <div className="nl-ends"><span>{fmt(lo)}</span><span>{fmt(Math.round(hi))}</span></div>
      </div>
      <div className="tv-r-foot"><div><Explain reveal={reveal} /></div><Outcomes reveal={reveal} /></div>
    </div>
  );
}

/* ================================================================== case */

interface CasePerson { id: string; name: string; bio?: string; offering?: string; icon?: string }
interface CaseSlot { id: string; label: string }
export function caseData(q: PublicQuestion, reveal?: RevealInfo | null) {
  const sd = rec(q.scene?.data);
  const rd = rec(reveal?.detail);
  const assign = inputOf(q, "assign");
  const people: CasePerson[] = arr<CasePerson>(sd.people).length ? arr<CasePerson>(sd.people) : arr<CasePerson>(rd.people).length ? arr<CasePerson>(rd.people) : assign?.people ?? [];
  const slots = arr<CaseSlot>(sd.slots).length ? arr<CaseSlot>(sd.slots) : arr<CaseSlot>(rd.slots).length ? arr<CaseSlot>(rd.slots) : assign?.slots ?? [];
  const clueObjs = arr<{ text: string; round: number }>(sd.clues);
  const clues = clueObjs.length ? clueObjs : lines(q.detail).map((t) => ({ text: t, round: 0 }));
  return { people, slots, clues };
}

function CaseBoard({ q, solution }: { q: PublicQuestion; solution?: Record<string, string> | null }) {
  const { people, slots } = caseData(q);
  const bySlot = new Map(Object.entries(solution ?? {}).map(([p, sl]) => [sl, people.find((x) => x.id === p)]));
  return (
    <div className="case-board">
      <div className="case-fallback">
        {!solution && (
          <ul className="case-people">
            {people.map((p) => (
              <li key={p.id}>{p.icon && <span className="case-ico"><OptionIcon icon={p.icon} size={48} /></span>}<b>{p.name}</b>{p.bio && <span>{p.bio}</span>}{p.offering && <em>{p.offering}</em>}</li>
            ))}
          </ul>
        )}
        <ol className={`case-altars ${solution ? "solved" : ""}`}>
          {slots.map((sl, i) => {
            const p = bySlot.get(sl.id);
            return (
              <li key={sl.id} style={{ animationDelay: `${0.2 * i}s` }}>
                <span className="case-candle" aria-hidden="true" />
                <span className="case-slot">{sl.label}</span>
                {solution && p?.icon && <span className="case-ico sol"><OptionIcon icon={p.icon} size={64} /></span>}
                {solution && <b>{p?.name ?? "—"}</b>}
                {solution && p?.offering && <em>{p.offering}</em>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function ClueList({ q, round }: { q: PublicQuestion; round: number }) {
  const { clues } = caseData(q);
  const anyRound = clues.some((c) => c.round > 0);
  return (
    <ol className="case-clues">
      {clues.map((c, i) => {
        const fresh = anyRound ? c.round === round : false;
        return (
          <li key={i} className={fresh ? "new" : ""} style={{ animationDelay: fresh ? `${0.25 * i}s` : "0s" }}>
            <span className="case-cn">{i + 1}</span><span>{c.text}</span>{fresh && <em>New</em>}
          </li>
        );
      })}
    </ol>
  );
}

export const CASE_MAX = [300, 225, 150];
export function CaseQ({ s, q }: { s: Snapshot; q: PublicQuestion }) {
  const round = (s.phase.qIndex ?? q.index) + 1;
  const clue = s.phase.stage === "clue";
  return (
    <div className="tv-body case">
      <div className="case-round">
        <span>Clue round {round} of 3</span>
        <b>{clue ? "Read the clues" : `Lock now for up to ${CASE_MAX[round - 1] ?? 150}`}</b>
      </div>
      <div className="case-grid">
        <CaseBoard q={q} />
        <div className="case-side">
          <div className="tv-eyebrow">Clues so far</div>
          <ClueList q={q} round={round} />
        </div>
      </div>
      {!clue && <Locked s={s} label="have locked a case" />}
    </div>
  );
}

export function CaseR({ s, q, reveal }: { s: Snapshot; q: PublicQuestion; reveal: RevealInfo | null }) {
  const round = (s.phase.qIndex ?? q.index) + 1;
  const d = rec(reveal?.detail);
  const sol = reveal?.correct && typeof reveal.correct === "object" && !Array.isArray(reveal.correct) ? (reveal.correct as Record<string, string>) : null;
  if (!sol) {
    const locked = num(d.locked) ?? 0, thinking = num(d.thinking) ?? 0;
    return (
      <div className="tv-body case case-mid">
        <div className="case-round"><span>End of clue round {round} of 3</span><b>The case stays closed</b></div>
        <div className="case-count">
          <div><strong>{locked}</strong><span>{locked === 1 ? "family locked" : "families locked"}</span></div>
          <div><strong>{thinking}</strong><span>still thinking</span></div>
        </div>
        <p className="tv-sub">Next round: more clues — a lock is worth up to {CASE_MAX[round] ?? 150}.</p>
      </div>
    );
  }
  return (
    <div className="tv-body case case-final">
      <div className="case-round"><span>Case closed</span><b>The solution</b></div>
      <CaseBoard q={q} solution={sol} />
      <div className="tv-r-foot"><div><Explain reveal={reveal} /></div><Outcomes reveal={reveal} max={300} /></div>
    </div>
  );
}

export function valueText(q: PublicQuestion, v: AnswerValue | null | undefined): string {
  if (v == null) return "—";
  if (typeof v === "number") {
    const c = inputOf(q, "choice"); if (c?.options[v]) return c.options[v].text;
    const n = inputOf(q, "number"); if (n) return `${v}${n.unit ? ` ${n.unit}` : ""}`;
    return String(v);
  }
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : Object.keys(v).length + " assigned";
}
