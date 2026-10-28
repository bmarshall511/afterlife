"use client";
import "./install.css";

import { useEffect, useState } from "react";

type Platform = "ios-safari" | "ios-other" | "android" | "desktop";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function detect(): Platform {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="ig-inline">
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);
const DotsIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="ig-inline">
    <circle cx="12" cy="5" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="19" r="1.8" fill="currentColor" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="ig-inline">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const STEPS: Record<Platform, { title: string; steps: React.ReactNode[] }> = {
  "ios-safari": {
    title: "iPhone or iPad",
    steps: [
      <>Tap the <b>Share</b> button <ShareIcon /> at the bottom of the screen (on iPad it’s at the top).</>,
      <>Scroll down a little and tap <b>Add to Home Screen</b> <PlusIcon />.</>,
      <>Tap <b>Add</b> in the top-right corner.</>,
      <>Find the black <b>AFTERLIFE</b> icon on your home screen and tap it.</>,
    ],
  },
  "ios-other": {
    title: "iPhone or iPad",
    steps: [
      <>Tap the <b>Share</b> button <ShareIcon /> (in Chrome it’s in the address bar).</>,
      <>Tap <b>Add to Home Screen</b> <PlusIcon />. If you don’t see it, open this page in <b>Safari</b> instead.</>,
      <>Tap <b>Add</b>.</>,
      <>Find the black <b>AFTERLIFE</b> icon on your home screen and tap it.</>,
    ],
  },
  android: {
    title: "Android phone",
    steps: [
      <>Tap the <b>menu</b> button <DotsIcon /> in the top-right corner of Chrome.</>,
      <>Tap <b>Add to Home screen</b> or <b>Install app</b>.</>,
      <>Tap <b>Install</b> (or <b>Add</b>).</>,
      <>Find the black <b>AFTERLIFE</b> icon on your home screen and tap it.</>,
    ],
  },
  desktop: {
    title: "Computer",
    steps: [
      <>In Chrome or Edge, click the <b>install</b> icon at the right end of the address bar.</>,
      <>Click <b>Install</b>.</>,
      <>On a phone it’s easier: open this same page there and follow the phone steps.</>,
    ],
  },
};

/** `embedded`: shown inside an in-app sheet (no page header/back link; the sheet has its own title and close). */
export default function InstallGuide({ embedded = false, onDone }: { embedded?: boolean; onDone?: () => void }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [teamCode, setTeamCode] = useState<string | null>(null);
  const [party, setParty] = useState("live");

  useEffect(() => {
    setPlatform(detect());
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    const p = new URLSearchParams(location.search).get("party") === "demo" ? "demo" : "live";
    setParty(p);
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallEvent); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // If they've already joined a team in this browser, show their code: on iPhone the home-screen app
    // doesn't share this browser's sign-in, so they'll rejoin with it.
    fetch(`/api/me?party=${p}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => me?.team?.inviteCode && setTeamCode(me.team.inviteCode))
      .catch(() => {});
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const order: Platform[] = platform ? [platform, ...(["ios-safari", "android", "desktop"] as Platform[]).filter((x) => x !== platform && !(platform === "ios-other" && x === "ios-safari"))] : [];
  const back = party === "demo" ? "/?party=demo" : "/";

  return (
    <main className={`ig${embedded ? " ig-embedded" : ""}`}>
      <div className="ig-head">
        <img src="/icons/icon-192.png" alt="" width={72} height={72} className="ig-icon" />
        {!embedded && <h1>Install the AFTERLIFE app</h1>}
        <p className="ig-lead">Get an AFTERLIFE icon on your phone, so the games, photo album and tributes open with one tap — just like an app. It’s optional, free, and takes about 20 seconds. No app store needed.</p>
      </div>

      {installed ? (
        <section className="ig-card ig-done" aria-live="polite">
          <h2>You’re all set</h2>
          <p>The app is installed and you’re using it now.</p>
          {embedded ? <button className="ig-btn" onClick={onDone}>Continue</button> : <a className="ig-btn" href={back}>Continue</a>}
        </section>
      ) : (
        <>
          {deferred && (
            <section className="ig-card">
              <button
                className="ig-btn"
                onClick={async () => { await deferred.prompt(); const c = await deferred.userChoice; if (c.outcome === "accepted") setInstalled(true); setDeferred(null); }}
              >
                Install app
              </button>
              <p className="ig-small">Tap the button, then tap <b>Install</b>.</p>
            </section>
          )}

          {teamCode && (platform === "ios-safari" || platform === "ios-other") && (
            <section className="ig-card ig-note">
              <h2>Already playing?</h2>
              <p>On iPhone, the installed app starts fresh. After you open it, tap <b>Join an existing team</b> and enter your team code:</p>
              <p className="ig-code" aria-label={`Team code ${teamCode.split("").join(" ")}`}>{teamCode}</p>
              <p className="ig-small">Write it down or take a screenshot before you continue. Your team’s points are safe either way.</p>
            </section>
          )}

          {order.map((p, i) => (
            <section key={p} className={`ig-card ${i > 0 ? "ig-other" : ""}`}>
              {i === 0 ? <h2>{STEPS[p].title}</h2> : <details><summary>{STEPS[p].title}</summary><Steps p={p} /></details>}
              {i === 0 && <Steps p={p} />}
            </section>
          ))}
        </>
      )}

      <p className="ig-small ig-foot">
        Don’t want to? No problem — everything works in your normal web browser too.{!embedded && <> <a href={back}>Back</a></>}
      </p>
    </main>
  );
}

function Steps({ p }: { p: Platform }) {
  return (
    <ol className="ig-steps">
      {STEPS[p].steps.map((s, i) => (
        <li key={i}><span className="ig-num" aria-hidden="true">{i + 1}</span><span>{s}</span></li>
      ))}
    </ol>
  );
}
