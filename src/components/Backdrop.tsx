"use client";
import { useEffect, useMemo, useState } from "react";
import type { BackdropState } from "@/shared/types";

const ART: Record<BackdropState, string> = { amber: "arrival-amber", violet: "focus-violet", magenta: "celebration-magenta" };
const ORDER: BackdropState[] = ["amber", "violet", "magenta"];

export type Dim = "normal" | "light" | "heavy";

/**
 * Layered key-art backdrop. All three states are mounted (= preloaded); a new state only fades in
 * once its image has decoded, so the previous art stays up — never a blank flash.
 */
export function Backdrop({ state, dim = "normal", accentKey, petals = false, drift = false, variant = "tv" }: {
  state: BackdropState; dim?: Dim; accentKey?: string | number | null; petals?: boolean; drift?: boolean; variant?: "tv" | "phone";
}) {
  const [loaded, setLoaded] = useState<Record<BackdropState, boolean>>({ amber: false, violet: false, magenta: false });
  const [shown, setShown] = useState<BackdropState>(state);
  useEffect(() => { if (loaded[state]) setShown(state); }, [state, loaded]);

  const [accent, setAccent] = useState(0);
  useEffect(() => { if (accentKey != null) setAccent((a) => a + 1); }, [accentKey]);

  return (
    <div className={`bd bd-${variant} bd-dim-${dim} ${drift ? "bd-drift" : ""}`} aria-hidden="true">
      {ORDER.map((s) => (
        <picture key={s} className={`bd-layer ${shown === s ? "on" : ""}`}>
          <source type="image/avif" media="(min-width: 900px)" srcSet={`/art/${ART[s]}-full.avif`} />
          <source type="image/webp" media="(min-width: 900px)" srcSet={`/art/${ART[s]}-full.webp`} />
          <source type="image/avif" srcSet={`/art/${ART[s]}-960.avif`} />
          <img
            src={`/art/${ART[s]}-960.webp`} alt="" decoding="async"
            fetchPriority={s === state ? "high" : "low"}
            ref={(el) => { if (el?.complete && el.naturalWidth && !loaded[s]) setLoaded((l) => ({ ...l, [s]: true })); }}
            onLoad={() => setLoaded((l) => (l[s] ? l : { ...l, [s]: true }))}
          />
        </picture>
      ))}
      <div className="bd-shade" />
      {accent > 0 && <div key={accent} className={`bd-accent bd-accent-${shown}`} />}
      {petals && <Petals />}
    </div>
  );
}

function Petals() {
  const items = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i * 1.7) % 9, dur: 11 + ((i * 5) % 7), size: 0.5 + ((i * 3) % 5) / 6, rot: (i * 47) % 360,
  })), []);
  return (
    <div className="petals">
      {items.map((p, i) => (
        <span key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
          ["--s" as string]: p.size, ["--r" as string]: `${p.rot}deg` }} />
      ))}
    </div>
  );
}
