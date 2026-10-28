"use client";
/**
 * Deterministic inline-SVG renderer for every content scene template.
 * No network, no images, no answer-bearing names in markup or aria labels.
 * Templates: memory-shelf | difference-pair | reveal-stage | altar-tiers
 * (reveal-object is server-only; publicQuestion converts it to reveal-stage.)
 */
import type { CSSProperties, ReactNode } from "react";
import type { RevealInfo, SceneSpec, Stage } from "@/shared/types";
import { PALETTE, isKind, shapesFor, type Prim } from "./library";

export interface SceneViewProps {
  spec: SceneSpec | null | undefined;
  audience: "tv" | "phone";
  stage?: Stage | null;
  elapsedMs?: number;
  reveal?: RevealInfo | null;
  className?: string;
  style?: CSSProperties;
}

const C = { bg: "#0B0A10", panel: "#14111B", line: "rgba(255,255,255,0.10)", text: "#F7F4EF", muted: "rgba(247,244,239,0.6)", gold: "#F5A524", violet: "#8B5CF6", fuchsia: "#D946EF" };
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

const STYLE = `
.al-scene{display:block;width:100%;height:auto;max-height:100%}
@media (prefers-reduced-motion: no-preference){
  .al-scene .al-in{animation:al-fade .5s ease-out both}
  .al-scene .al-pulse{animation:al-pulse 1.6s ease-in-out 2}
}
@keyframes al-fade{from{opacity:0}to{opacity:1}}
@keyframes al-pulse{50%{opacity:.55}}
`;

export function Shapes({ prims, mono }: { prims: Prim[]; mono?: boolean }) {
  return (
    <>
      {prims.map((p, i) => {
        const fill = mono ? "#EDE7F6" : (PALETTE[p.f] ?? (/^#[0-9a-fA-F]{6}$/.test(p.f) ? p.f : "#888"));
        switch (p.t) {
          case "c": return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={fill} />;
          case "e": return <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={fill} />;
          case "r": return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx ?? 0} fill={fill} />;
          case "p": return <polygon key={i} points={p.pts.join(" ")} fill={fill} />;
          case "l": return <polyline key={i} points={p.pts.join(" ")} fill="none" stroke={fill} strokeWidth={p.w} strokeLinecap="round" strokeLinejoin="round" />;
        }
      })}
    </>
  );
}

/** Draw a library object centred at (x,y) within a square of `size`. */
function Obj({ kind, x, y, size }: { kind: unknown; x: number; y: number; size: number }) {
  if (!isKind(kind)) return null;
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})`}>
      <Shapes prims={shapesFor(kind)} />
    </g>
  );
}

/** Icon for an option with an icon id (library object). Renders nothing for unknown ids. */
export function OptionIcon({ icon, size = 40, title }: { icon?: string | null; size?: number; title?: string }) {
  if (!isKind(icon)) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <Shapes prims={shapesFor(icon)} />
    </svg>
  );
}

function Frame({ w, h, label, children, className, style }: { w: number; h: number; label: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <svg className={`al-scene ${className ?? ""}`} style={style} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <style>{STYLE}</style>
      <defs>
        <radialGradient id="al-glow" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#241B33" />
          <stop offset="100%" stopColor={C.bg} />
        </radialGradient>
      </defs>
      <rect width={w} height={h} rx={24} fill="url(#al-glow)" />
      <g className="al-in">{children}</g>
    </svg>
  );
}

// ---------------------------------------------------------------- memory-shelf
function MemoryShelf({ data, audience }: { data: Record<string, unknown>; audience: "tv" | "phone" }) {
  const cols = Number(data.cols) || 3, rows = Number(data.rows) || 2;
  const cells = (data.cells as string[]) ?? [];
  const cell = 220, pad = 40, w = cols * cell + pad * 2, h = rows * cell + pad * 2;
  return (
    <Frame w={w} h={h} label={`Memory picture: ${cells.length} objects in ${rows} rows. Study it before it disappears.`} style={audience === "phone" ? { maxHeight: 260 } : undefined}>
      {Array.from({ length: rows }, (_, r) => (
        <line key={r} x1={pad} x2={w - pad} y1={pad + (r + 1) * cell - 14} y2={pad + (r + 1) * cell - 14} stroke={C.line} strokeWidth={3} />
      ))}
      {cells.map((k, i) => (
        <Obj key={i} kind={k} x={pad + (i % cols) * cell + cell / 2} y={pad + Math.floor(i / cols) * cell + cell / 2 - 10} size={176} />
      ))}
    </Frame>
  );
}

// ---------------------------------------------------------------- difference-pair
const RW = 300, RH = 220;
function Panel({ regions, dx, title, highlight }: { regions: string[][]; dx: number; title: string; highlight: number | null }) {
  return (
    <g transform={`translate(${dx} 70)`}>
      <text x={RW} y={-22} textAnchor="middle" fill={C.muted} fontFamily={FONT} fontSize={30} fontWeight={600} letterSpacing={4}>{title}</text>
      <rect width={RW * 2} height={RH * 2} rx={18} fill={C.panel} stroke={C.line} strokeWidth={2} />
      <line x1={RW} x2={RW} y1={0} y2={RH * 2} stroke={C.line} strokeWidth={3} strokeDasharray="10 10" />
      <line x1={0} x2={RW * 2} y1={RH} y2={RH} stroke={C.line} strokeWidth={3} strokeDasharray="10 10" />
      {regions.map((g, i) => {
        const ox = (i % 2) * RW, oy = Math.floor(i / 2) * RH;
        const xs = g.length === 1 ? [RW / 2] : [RW * 0.3, RW * 0.7];
        return (
          <g key={i}>
            {g.map((k, j) => <Obj key={j} kind={k} x={ox + xs[j]} y={oy + RH / 2 + 8} size={g.length === 1 ? 160 : 132} />)}
            <circle cx={ox + 30} cy={oy + 30} r={20} fill={C.bg} stroke={highlight === i ? C.gold : "rgba(255,255,255,0.35)"} strokeWidth={3} />
            <text x={ox + 30} y={oy + 40} textAnchor="middle" fill={C.text} fontFamily={FONT} fontSize={28} fontWeight={800}>{"ABCD"[i]}</text>
            {highlight === i && <rect className="al-pulse" x={ox + 6} y={oy + 6} width={RW - 12} height={RH - 12} rx={14} fill="none" stroke={C.gold} strokeWidth={8} />}
          </g>
        );
      })}
    </g>
  );
}
function DifferencePair({ spec, audience, reveal }: { spec: SceneSpec; audience: "tv" | "phone"; reveal?: RevealInfo | null }) {
  const a = (spec.data.regions as string[][]) ?? [];
  const b = ((spec.variant?.regions as string[][]) ?? a);
  const hi = typeof reveal?.highlight?.regionIndex === "number" ? (reveal.highlight.regionIndex as number) : null;
  const label = "Two pictures side by side, each split into regions A top left, B top right, C bottom left, D bottom right. One region differs.";
  if (audience === "phone") {
    const w = RW * 2 + 40, h = (RH * 2 + 90) * 2;
    return (
      <Frame w={w} h={h} label={label}>
        <Panel regions={a} dx={20} title="PICTURE 1" highlight={hi} />
        <g transform={`translate(0 ${RH * 2 + 90})`}><Panel regions={b} dx={20} title="PICTURE 2" highlight={hi} /></g>
      </Frame>
    );
  }
  return (
    <Frame w={RW * 4 + 120} h={RH * 2 + 100} label={label}>
      <Panel regions={a} dx={40} title="PICTURE 1" highlight={hi} />
      <Panel regions={b} dx={RW * 2 + 80} title="PICTURE 2" highlight={hi} />
    </Frame>
  );
}

// ---------------------------------------------------------------- reveal-stage
function RevealStage({ spec, audience }: { spec: SceneSpec; audience: "tv" | "phone" }) {
  const d = spec.data as { stage?: number; view?: { x: number; y: number; s: number }; mono?: boolean; shapes?: Prim[] };
  const v = d.view ?? { x: 0, y: 0, s: 100 };
  const stage = d.stage ?? 0;
  const S = 600;
  const label = stage >= 3 ? "Mystery picture, fully revealed." : `Mystery picture, clue ${stage + 1} of 3: ${["a close-up detail", "the outline", "the shape in colour"][stage]}.`;
  return (
    <Frame w={S} h={S + 70} label={label} style={audience === "phone" ? { maxHeight: 300 } : undefined}>
      <svg x={40} y={20} width={S - 80} height={S - 80} viewBox={`${v.x} ${v.y} ${v.s} ${v.s}`}>
        <defs><clipPath id={`al-rv-${spec.seed}`}><rect x={v.x} y={v.y} width={v.s} height={v.s} rx={v.s * 0.04} /></clipPath></defs>
        <rect x={v.x} y={v.y} width={v.s} height={v.s} rx={v.s * 0.04} fill={C.panel} />
        <g clipPath={`url(#al-rv-${spec.seed})`}><Shapes prims={d.shapes ?? []} mono={d.mono} /></g>
      </svg>
      {stage < 3 && [0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx={S / 2 + (i - 1) * 46} cy={S + 20} r={13} fill={i <= stage ? C.gold : "none"} stroke={i <= stage ? C.gold : "rgba(255,255,255,0.4)"} strokeWidth={3} />
          <text x={S / 2 + (i - 1) * 46} y={S + 26} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={800} fill={i <= stage ? C.bg : C.muted}>{i + 1}</text>
        </g>
      ))}
    </Frame>
  );
}

// ---------------------------------------------------------------- altar-tiers
function AltarTiers({ spec, audience, reveal }: { spec: SceneSpec; audience: "tv" | "phone"; reveal?: RevealInfo | null }) {
  const tiers = (spec.data.tiers as string[][]) ?? [];
  const W = 1200, H = 790, tierH = 210, base = 120;
  const hi = reveal?.highlight?.icon as string | undefined;
  const widths = [520, 820, 1100];
  const names = ["Top level", "Middle level", "Bottom level"];
  return (
    <Frame w={W} h={H} label={`Illustrated ofrenda-style altar with three levels holding ${tiers.flat().length} objects.`} style={audience === "phone" ? { maxHeight: 320 } : undefined}>
      {tiers.map((t, li) => {
        const tw = widths[li] ?? 1100, x0 = (W - tw) / 2, y = base + li * tierH;
        return (
          <g key={li}>
            <rect x={x0} y={y + tierH - 34} width={tw} height={22} rx={6} fill="#211A2C" />
            <rect x={x0} y={y + tierH - 34} width={tw} height={4} fill={C.gold} opacity={0.85} />
            <text x={x0 + 10} y={y + tierH + 8} textAnchor="start" fill={C.muted} fontFamily={FONT} fontSize={22} fontWeight={600}>{names[li]}</text>
            {t.map((k, j) => {
              const cx = x0 + (tw / t.length) * (j + 0.5);
              return (
                <g key={j}>
                  {hi === k && <circle className="al-pulse" cx={cx} cy={y + tierH / 2 - 26} r={96} fill="none" stroke={C.gold} strokeWidth={8} />}
                  <Obj kind={k} x={cx} y={y + tierH / 2 - 26} size={160} />
                </g>
              );
            })}
          </g>
        );
      })}
    </Frame>
  );
}

export function SceneView({ spec, audience, stage, reveal, className, style }: SceneViewProps) {
  void stage;
  // During reveal, show the revealed variant where one exists.
  const hiScene = reveal?.highlight?.scene as SceneSpec | undefined;
  const s = hiScene && (spec?.template === "reveal-stage" || !spec || spec.template === "memory-shelf") ? hiScene : spec;
  if (!s) return null;
  const inner = (() => {
    switch (s.template) {
      case "memory-shelf": return <MemoryShelf data={s.data} audience={audience} />;
      case "difference-pair": return <DifferencePair spec={s} audience={audience} reveal={reveal} />;
      case "reveal-stage": return <RevealStage spec={s} audience={audience} />;
      case "altar-tiers": return <AltarTiers spec={s} audience={audience} reveal={reveal} />;
      default: return null; // reveal-object is never sent to clients
    }
  })();
  return <div className={className} style={{ width: "100%", ...style }} data-scene={s.template}>{inner}</div>;
}

export default SceneView;
