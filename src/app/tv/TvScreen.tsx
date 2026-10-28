"use client";
import { useEffect, useState } from "react";
import type { PartyId, PublicQuestion, PublicTribute, RevealInfo, Snapshot } from "@/shared/types";
import { useSnapshot, useServerNow } from "@/client/store";
import { Backdrop, type Dim } from "@/components/Backdrop";
import { Wordmark, FAMILY } from "@/components/Brand";
import { Countdown } from "@/components/Countdown";
import { JoinQR, shortUrl } from "@/components/JoinQR";
import { Standings } from "@/components/Standings";
import { Icon } from "@/components/Icon";
import { SceneView } from "@/games/scenes/SceneView";

export function TvScreen({ party, mock }: { party: PartyId; mock: string | null }) {
  const { snapshot: s, online, offsetMs } = useSnapshot(party, { intervalMs: 1000, mock, audience: "tv" });

  if (!s) {
    return (
      <main className="tv">
        <Backdrop state="amber" drift />
        <div className="tv-safe tv-center-left"><Wordmark size="lg" />{!online && <p className="tv-muted">Connecting…</p>}</div>
      </main>
    );
  }

  const kind = s.phase.kind;
  const tribute = (kind === "interval" || kind === "ambient") ? s.phase.tribute ?? null : null;
  const dim: Dim = tribute ? "heavy" : kind === "question" ? "normal" : kind === "ambient" || kind === "intro" ? "light" : "normal";
  const paused = s.status === "paused";

  return (
    <main className={`tv tv-${kind} ${tribute ? "tv-tribute" : ""}`} data-phase={kind}>
      <Backdrop
        state={s.backdrop} dim={dim}
        drift={!tribute && (kind === "ambient" || kind === "interval" || kind === "intro")}
        petals={kind === "results"}
        accentKey={kind === "reveal" ? s.question?.id ?? null : null}
      />
      <div className="tv-safe" key={kind + (s.question?.id ?? "") + (s.phase.stage ?? "")}>
        {tribute ? <TributeView s={s} tribute={tribute} /> :
          kind === "ambient" ? <AmbientView s={s} /> :
          kind === "intro" ? <IntroView s={s} offsetMs={offsetMs} paused={paused} /> :
          kind === "question" && s.question ? <QuestionView s={s} q={s.question} offsetMs={offsetMs} paused={paused} /> :
          kind === "reveal" && s.question ? <RevealView s={s} q={s.question} reveal={s.reveal} offsetMs={offsetMs} /> :
          kind === "results" ? <ResultsView s={s} offsetMs={offsetMs} /> :
          <IntervalView s={s} offsetMs={offsetMs} paused={paused} />}
      </div>
      {paused && <div className="tv-paused" role="status"><Icon name="pause" /><div><strong>Paused</strong><span>Back in a moment</span></div></div>}
      {!online && <div className="tv-offline" role="status"><Icon name="wifi" /> Reconnecting…</div>}
    </main>
  );
}

/* ----------------------------- pieces ----------------------------- */

function JoinBlock({ s, size = "lg" }: { s: Snapshot; size?: "lg" | "md" }) {
  return (
    <div className={`tv-join tv-join-${size}`}>
      <JoinQR url={s.joinUrl} className="tv-qr" />
      <div className="tv-join-text">
        <div className="tv-join-h">{size === "lg" ? "Scan to join" : "Join anytime"}</div>
        <div className="tv-join-url">{shortUrl(s.joinUrl)}</div>
      </div>
    </div>
  );
}

function SetLabel({ s }: { s: Snapshot }) {
  const q = s.phase.qIndex;
  return (
    <div className="tv-eyebrow">
      {s.phase.setSeq ? `Set ${s.phase.setSeq}` : "Next set"}
      {q != null && s.phase.kind !== "intro" && <> · Question {q + 1} of 3</>}
    </div>
  );
}

function Locked({ s }: { s: Snapshot }) {
  if (!s.eligibleCount) return null;
  const n = Math.min(s.answeredCount, s.eligibleCount);
  return (
    <div className="tv-locked" aria-live="polite">
      <span className="tv-locked-dots" aria-hidden="true">
        {Array.from({ length: Math.min(s.eligibleCount, 12) }, (_, i) => <i key={i} className={i < n ? "on" : ""} />)}
      </span>
      {n} of {s.eligibleCount} {s.eligibleCount === 1 ? "family" : "families"} locked in
    </div>
  );
}

function Options({ q, reveal, cols = 2 }: { q: PublicQuestion; reveal?: RevealInfo | null; cols?: 1 | 2 | 4 }) {
  const correct = reveal ? (Array.isArray(reveal.correct) ? reveal.correct : reveal.correct == null ? [] : [reveal.correct]) : null;
  return (
    <ol className={`tv-options cols-${cols} ${correct ? "revealed" : ""}`}>
      {q.options.map((o, i) => {
        const ok = correct?.includes(i);
        return (
          <li key={i} className={`tv-opt ${ok ? "correct" : correct ? "dim" : ""}`}>
            <span className="tv-opt-label">{o.label === o.text ? <Icon name={o.icon ?? (i === 0 ? "check" : "x")} /> : o.label}</span>
            <span className="tv-opt-text">{o.text}</span>
            {ok && <span className="tv-opt-badge"><Icon name="check" /> Correct</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ----------------------------- views ----------------------------- */

function AmbientView({ s }: { s: Snapshot }) {
  return (
    <div className="tv-col tv-ambient">
      <Wordmark size="lg" />
      <h1 className="tv-hero">Bring your<br />family.</h1>
      <p className="tv-sub">One phone per family. Play together between remembrances.</p>
      <div className="tv-bottom-row">
        <JoinBlock s={s} />
        <Standings rows={s.standings} max={4} />
      </div>
    </div>
  );
}

function IntroView({ s, offsetMs, paused }: { s: Snapshot; offsetMs: number; paused: boolean }) {
  const f = FAMILY[s.phase.family ?? "memory"];
  return (
    <div className="tv-col tv-intro">
      <Wordmark size="md" />
      <SetLabel s={s} />
      {s.phase.encore && <div className="tv-eyebrow accent">Encore round</div>}
      <h1 className="tv-title">{f.title}</h1>
      <p className="tv-sub">{f.sub}</p>
      <p className="tv-how"><Icon name={f.icon} /> {f.how}</p>
      <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} paused={paused} className="tv-count" />
      <div className="tv-bottom-row"><JoinBlock s={s} size="md" /><Standings rows={s.standings} max={2} showProvisional={false} compact /></div>
    </div>
  );
}

function QHeader({ s, offsetMs, paused, title }: { s: Snapshot; offsetMs: number; paused: boolean; title?: string }) {
  const f = FAMILY[s.question?.family ?? "memory"];
  return (
    <header className="tv-qhead">
      <div>
        <div className="tv-fam">{title ?? f.title}</div>
        <SetLabel s={s} />
      </div>
      <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} paused={paused} className="tv-count-sm" />
    </header>
  );
}

function useElapsed(s: Snapshot, offsetMs: number) {
  const now = useServerNow(offsetMs);
  return Math.max(0, now - s.phase.startsAt);
}

function Scene({ s, q, offsetMs, reveal, spec }: { s: Snapshot; q: PublicQuestion; offsetMs: number; reveal?: RevealInfo | null; spec?: PublicQuestion["scene"] }) {
  const elapsedMs = useElapsed(s, offsetMs);
  const sc = spec ?? q.scene ?? null;
  if (!sc && !reveal?.highlight?.scene) return null;
  return (
    <div className="tv-scene">
      <SceneView spec={sc} audience="tv" stage={s.phase.stage ?? "answer"} elapsedMs={elapsedMs} reveal={reveal ?? null} />
    </div>
  );
}

function QuestionView({ s, q, offsetMs, paused }: { s: Snapshot; q: PublicQuestion; offsetMs: number; paused: boolean }) {
  const stage = s.phase.stage ?? "answer";
  const common = { s, offsetMs, paused };

  if (q.family === "memory" && stage === "expose") {
    return (
      <div className="tv-q tv-q-expose">
        <QHeader {...common} />
        <h2 className="tv-statement sm">Remember everything.</h2>
        <Scene s={s} q={q} offsetMs={offsetMs} />
        <p className="tv-caption">The scene disappears when the timer ends — it won’t be on your phones.</p>
      </div>
    );
  }
  if (q.family === "truth") {
    return (
      <div className="tv-q tv-q-truth">
        <QHeader {...common} />
        <h2 className="tv-statement">{q.prompt}</h2>
        <Options q={q} cols={2} />
        <Locked s={s} />
      </div>
    );
  }
  if (q.family === "difference") {
    return (
      <div className="tv-q tv-q-diff">
        <QHeader {...common} />
        <h2 className="tv-prompt">{q.prompt}</h2>
        <Scene s={s} q={q} offsetMs={offsetMs} />
        <Options q={q} cols={4} />
        <Locked s={s} />
      </div>
    );
  }
  if (q.family === "family") {
    const prefer = stage === "prefer";
    return (
      <div className="tv-q tv-q-family">
        <QHeader {...common} />
        <div className="tv-eyebrow accent">{prefer ? "Step 1 · Each family: pick your favorite" : "Step 2 · What did most families pick?"}</div>
        <h2 className="tv-statement md">{q.prompt}</h2>
        <Options q={q} cols={2} />
        <Locked s={s} />
      </div>
    );
  }
  // memory answer, reveal, altar
  const hasScene = !!q.scene && q.family !== "memory";
  return (
    <div className={`tv-q tv-q-${q.family}`}>
      <QHeader {...common} />
      {hasScene ? (
        <div className="tv-split">
          <Scene s={s} q={q} offsetMs={offsetMs} />
          <div className="tv-side">
            <h2 className="tv-prompt">{q.prompt}</h2>
            <Options q={q} cols={1} />
            <Locked s={s} />
          </div>
        </div>
      ) : (
        <>
          <h2 className="tv-statement md">{q.prompt}</h2>
          <Options q={q} cols={2} />
          <Locked s={s} />
        </>
      )}
    </div>
  );
}

function RevealView({ s, q, reveal, offsetMs }: { s: Snapshot; q: PublicQuestion; reveal: RevealInfo | null; offsetMs: number }) {
  const hiScene = reveal?.highlight?.scene ? true : false;
  const showScene = (!!q.scene || hiScene) && q.family !== "truth" && q.family !== "family";
  return (
    <div className="tv-q tv-reveal">
      <QHeader s={s} offsetMs={offsetMs} paused={false} title="The answer" />
      <div className={showScene ? "tv-split" : ""}>
        {showScene && <Scene s={s} q={q} offsetMs={offsetMs} reveal={reveal} />}
        <div className="tv-side wide">
          <h2 className="tv-prompt muted">{q.prompt}</h2>
          {reveal?.void ? <p className="tv-sub">This question doesn’t count — {reveal.voidReason ?? "not enough votes"}.</p> : <Options q={q} reveal={reveal} cols={showScene ? 1 : 2} />}
          {reveal?.tallies && <Tallies q={q} t={reveal.tallies} />}
          {reveal?.explanation && <p className="tv-explain">{reveal.explanation}</p>}
          {reveal?.source?.title && <p className="tv-source">Source · {reveal.source.title}</p>}
        </div>
      </div>
    </div>
  );
}

function Tallies({ q, t }: { q: PublicQuestion; t: { prefer: number[]; predict: number[] } }) {
  const max = Math.max(1, ...t.prefer);
  return (
    <div className="tv-tallies">
      {q.options.map((o, i) => (
        <div key={i} className="tv-tally"><span>{o.label}</span><div><i style={{ width: `${(t.prefer[i] ?? 0) / max * 100}%` }} /></div><b>{t.prefer[i] ?? 0}</b></div>
      ))}
    </div>
  );
}

function ResultsView({ s, offsetMs }: { s: Snapshot; offsetMs: number }) {
  const set = s.lastSet;
  const winners = set ? set.scores.filter((x) => set.winners.includes(x.teamId)) : [];
  const names = winners.map((w) => w.name);
  const headline = names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0] ?? "No winner this set";
  return (
    <div className="tv-col tv-results">
      <div className="tv-qhead"><div><div className="tv-fam">{set ? FAMILY[set.family].title : "Results"}</div><div className="tv-eyebrow">Set {s.phase.setSeq ?? ""} results</div></div>
        <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} className="tv-count-sm" /></div>
      <div className="tv-eyebrow accent">{names.length > 1 ? "Shared win" : "Set winner"}</div>
      <h1 className="tv-title sm">{headline}</h1>
      <div className="tv-results-grid">
        {set && (
          <ol className="tv-setscores">
            {set.scores.slice().sort((a, b) => b.score - a.score).map((x, i) => (
              <li key={x.teamId} style={{ animationDelay: `${0.15 * i}s` }}>
                <span className="n">{x.name}</span>
                {x.perfect && <span className="perfect"><Icon name="sparkle" /> Perfect</span>}
                {!x.ranked && <span className="practice">Practice</span>}
                <b>{x.score}</b>
              </li>
            ))}
          </ol>
        )}
        <div className="tv-board">
          <div className="tv-eyebrow">Party standings</div>
          <Standings rows={s.standings} max={5} />
        </div>
      </div>
    </div>
  );
}

function IntervalView({ s, offsetMs, paused }: { s: Snapshot; offsetMs: number; paused: boolean }) {
  return (
    <div className="tv-col tv-interval">
      <Wordmark size="md" />
      <div className="tv-eyebrow accent">Intermission · Un descanso</div>
      <h1 className="tv-title sm">Next set soon</h1>
      <Countdown endsAt={s.status === "running" && s.mode !== "tribute_only" ? s.phase.endsAt : null} offsetMs={offsetMs} paused={paused} className="tv-count" />
      <div className="tv-bottom-row"><JoinBlock s={s} size="md" /><Standings rows={s.standings} max={4} /></div>
    </div>
  );
}

/* ----------------------------- tribute ----------------------------- */

function TributeView({ s, tribute }: { s: Snapshot; tribute: PublicTribute }) {
  // keep the previous tribute layered underneath so the change is a crossfade
  const [layers, setLayers] = useState<PublicTribute[]>([tribute]);
  useEffect(() => {
    setLayers((l) => (l[l.length - 1]?.id === tribute.id ? l : [...l.slice(-1), tribute]));
  }, [tribute]);
  return (
    <div className="tv-tribute-wrap">
      {layers.map((t, i) => <TributeCard key={t.id} t={t} leaving={i < layers.length - 1} />)}
      <div className="tv-quiet-join"><JoinQR url={s.joinUrl} className="tv-qr-xs" label="Join the game" /><span>Join anytime<br />{shortUrl(s.joinUrl)}</span></div>
    </div>
  );
}

function TributeCard({ t, leaving }: { t: PublicTribute; leaving: boolean }) {
  const ar = t.width && t.height ? t.width / t.height : 0.8;
  const portrait = ar < 1.05;
  return (
    <article className={`tribute ${leaving ? "leaving" : ""} ${portrait ? "portrait" : "landscape"}`} aria-live="polite">
      <div className="tribute-photo" style={{ ["--ar" as string]: String(ar) }}>
        <img src={t.photoUrl} alt={`Photo of ${t.personName}`}
          style={{ objectFit: t.fit === "cover" ? "cover" : "contain", objectPosition: `${t.focalX * 100}% ${t.focalY * 100}%` }} />
      </div>
      <div className="tribute-text">
        <div className="tribute-eyebrow">Siempre presentes <span>· Always remembered</span></div>
        <h1 className={`tribute-name ${t.personName.length > 22 ? "long" : ""}`}>{t.personName}</h1>
        {t.remembrance && <blockquote className={`tribute-words ${t.remembrance.length > 160 ? "long" : ""}`}>“{t.remembrance}”</blockquote>}
        <div className="tribute-rule" aria-hidden="true" />
        {t.attribution && <p className="tribute-by">{t.attribution}</p>}
      </div>
    </article>
  );
}
