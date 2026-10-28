"use client";
import { useEffect, useRef, useState } from "react";
import type { PartyId, PublicQuestion, PublicSlide, PublicTribute, RevealInfo, Snapshot } from "@/shared/types";
import { useSnapshot } from "@/client/store";
import { Backdrop, type Dim } from "@/components/Backdrop";
import { Wordmark, FAMILY } from "@/components/Brand";
import { Countdown } from "@/components/Countdown";
import { JoinQR, shortUrl } from "@/components/JoinQR";
import { Standings } from "@/components/Standings";
import { DemoBar } from "@/components/DemoBar";
import { Icon } from "@/components/Icon";
import { CalaveraQ, CalaveraR, CaseQ, CaseR, ClosestQ, ClosestR, LineQ, LineR, LoteriaQ, LoteriaR, RoomQ, RoomR, rememberInput } from "./families";

export function TvScreen({ party, mock }: { party: PartyId; mock: string | null }) {
  const { snapshot: s, online, offsetMs } = useSnapshot(party, { intervalMs: 1000, mock, audience: "tv" });
  // a selfie must never pop in right after a remembrance: remember whether a tribute was just on screen
  const prevTribute = useRef(false);
  const hadTribute = !!s?.phase.tribute;
  useEffect(() => { if (hadTribute) prevTribute.current = true; else if (!s?.phase.slide) prevTribute.current = false; }, [hadTribute, s?.phase.slide]);

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
  const slide = !tribute && (kind === "interval" || kind === "ambient") ? s.phase.slide ?? null : null;
  const dim: Dim = tribute || slide ? "heavy" : kind === "question" ? "normal" : kind === "ambient" || kind === "intro" ? "light" : "normal";
  const paused = s.status === "paused";

  return (
    <main className={`tv tv-${kind} ${tribute ? "tv-tribute" : ""}`} data-phase={kind}>
      <Backdrop
        state={slide ? "magenta" : s.backdrop} dim={dim}
        drift={!tribute && !slide && (kind === "ambient" || kind === "interval" || kind === "intro")}
        petals={kind === "results"}
        accentKey={kind === "reveal" ? s.question?.id ?? null : null}
      />
      <div className={`tv-safe ${slide && prevTribute.current ? "slow-in" : ""}`} key={kind + (s.question?.id ?? "") + (s.phase.stage ?? "") + (tribute ? "t" : slide ? "s" : "")}>
        {tribute ? <TributeView s={s} tribute={tribute} /> :
          slide ? <SlideView slide={slide} /> :
          kind === "ambient" ? <AmbientView s={s} /> :
          kind === "intro" ? <IntroView s={s} offsetMs={offsetMs} paused={paused} /> :
          kind === "question" && s.question ? <QuestionView s={s} q={s.question} offsetMs={offsetMs} paused={paused} /> :
          kind === "reveal" && s.question ? <RevealView s={s} q={s.question} reveal={s.reveal} offsetMs={offsetMs} /> :
          kind === "results" ? <ResultsView s={s} offsetMs={offsetMs} /> :
          <IntervalView s={s} offsetMs={offsetMs} paused={paused} />}
      </div>
      {paused && <div className="tv-paused" role="status"><Icon name="pause" /><div><strong>Paused</strong><span>Back in a moment</span></div></div>}
      {!online && <div className="tv-offline" role="status"><Icon name="wifi" /> Reconnecting…</div>}
      {party === "demo" && !mock && <DemoBar s={s} />}
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

function DoubleBadge({ s }: { s: Snapshot }) {
  if (!s.phase.doubled) return null;
  return <span className="tv-double"><Icon name="flame" /> Double points</span>;
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
  const f = FAMILY[s.phase.family ?? "line"];
  const fams = s.phase.setFamilies ?? [];
  if (new Set(fams).size > 1) {
    return (
      <div className={`tv-col tv-intro ${s.phase.doubled ? "doubled" : ""}`}>
        <Wordmark size="md" />
        <SetLabel s={s} />
        {s.phase.doubled && <div className="tv-lastchance"><Icon name="flame" /><span>Last chance</span><b>Double points</b></div>}
        <h1 className="tv-title">Ronda Sorpresa</h1>
        <p className="tv-sub">Three different games this round.</p>
        <ol className="tv-mixlist">
          {fams.map((g, i) => (
            <li key={i}><b>{i + 1}</b><div><strong>{FAMILY[g].title}</strong><span>{FAMILY[g].sub}</span></div></li>
          ))}
        </ol>
        <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} paused={paused} className="tv-count" />
      </div>
    );
  }
  return (
    <div className={`tv-col tv-intro ${s.phase.doubled ? "doubled" : ""}`}>
      <Wordmark size="md" />
      <SetLabel s={s} />
      {s.phase.doubled && <div className="tv-lastchance"><Icon name="flame" /><span>Last chance</span><b>Double points</b></div>}
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
  const f = FAMILY[s.question?.family ?? s.phase.family ?? "line"];
  return (
    <header className="tv-qhead">
      <div>
        <div className="tv-fam">{title ?? f.title} <DoubleBadge s={s} /></div>
        <SetLabel s={s} />
        {!title && s.phase.kind === "question" && <p className="tv-qhow">{f.how}</p>}
      </div>
      <Countdown endsAt={s.phase.endsAt} offsetMs={offsetMs} paused={paused} className="tv-count-sm" />
    </header>
  );
}

function QuestionView({ s, q, offsetMs, paused }: { s: Snapshot; q: PublicQuestion; offsetMs: number; paused: boolean }) {
  rememberInput(q);
  const body = (() => {
    switch (q.family) {
      case "calavera": return <CalaveraQ s={s} q={q} />;
      case "line": return <LineQ s={s} q={q} />;
      case "loteria": return <LoteriaQ s={s} q={q} />;
      case "room": return <RoomQ s={s} q={q} />;
      case "closest": return <ClosestQ s={s} q={q} />;
      case "case": return <CaseQ s={s} q={q} />;
    }
  })();
  return (
    <div className={`tv-q tv-q-${q.family}`}>
      <QHeader s={s} offsetMs={offsetMs} paused={paused} />
      {body}
    </div>
  );
}

function RevealView({ s, q, reveal, offsetMs }: { s: Snapshot; q: PublicQuestion; reveal: RevealInfo | null; offsetMs: number }) {
  rememberInput(q);
  const body = (() => {
    switch (q.family) {
      case "calavera": return <CalaveraR q={q} reveal={reveal} />;
      case "line": return <LineR q={q} reveal={reveal} />;
      case "loteria": return <LoteriaR q={q} reveal={reveal} />;
      case "room": return <RoomR q={q} reveal={reveal} />;
      case "closest": return <ClosestR q={q} reveal={reveal} />;
      case "case": return <CaseR s={s} q={q} reveal={reveal} />;
    }
  })();
  const title = q.family === "calavera" ? "The votes are in" : q.family === "room" ? "The room has spoken" : q.family === "case" ? FAMILY.case.title : "The answer";
  return (
    <div className={`tv-q tv-reveal tv-r-${q.family}`}>
      <QHeader s={s} offsetMs={offsetMs} paused={false} title={title} />
      {body}
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
      <div className="tv-qhead"><div><div className="tv-fam">{set ? (set.mixed ? "Ronda Sorpresa" : FAMILY[set.family].title) : "Results"} <DoubleBadge s={s} /></div><div className="tv-eyebrow">Set {s.phase.setSeq ?? ""} results</div></div>
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

/* ----------------------------- party album slide ----------------------------- */

function SlideView({ slide }: { slide: PublicSlide }) {
  const [layers, setLayers] = useState<PublicSlide[]>([slide]);
  useEffect(() => {
    setLayers((l) => (l[l.length - 1]?.id === slide.id ? l : [...l.slice(-1), slide]));
  }, [slide]);
  return (
    <div className="tv-slide-wrap">
      {layers.map((p, i) => {
        const ar = p.width && p.height ? p.width / p.height : 1.5;
        return (
          <figure key={p.id} className={`slide ${i < layers.length - 1 ? "leaving" : ""} ${ar < 1 ? "portrait" : "landscape"}`}>
            <div className="slide-photo" style={{ ["--ar" as string]: String(ar) }}>
              <img src={p.url} alt={p.caption || "Party photo"} />
            </div>
            {(p.caption || p.takenBy) && (
              <figcaption>
                <div className="slide-eyebrow">La fiesta · Tonight</div>
                {p.caption && <p className="slide-caption">{p.caption}</p>}
                {p.takenBy && <p className="slide-by">📷 {p.takenBy}</p>}
              </figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );
}
