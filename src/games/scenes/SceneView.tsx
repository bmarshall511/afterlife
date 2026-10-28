"use client";
/**
 * Deterministic inline-SVG scenes for v2 families. No network, no images, no answers in markup before reveal.
 * Templates: loteria-grid | case-board | line-axis | closest-numberline
 */
import type { CSSProperties, ReactNode } from "react";
import type { RevealInfo, SceneSpec, Stage } from "@/shared/types";
import { ICONS, ICON_IDS, INK, IconSvg } from "./icons";

export { ICON_IDS };

export interface SceneViewProps {
  spec: SceneSpec | null | undefined;
  audience: "tv" | "phone";
  stage?: Stage | null;
  reveal?: RevealInfo | null;
  className?: string;
  style?: CSSProperties;
}

const C = { bg: "#0B0A10", panel: "#15121C", line: "rgba(243,233,210,0.16)", text: "#F7F4EF", muted: "rgba(247,244,239,0.62)", gold: "#F5A524", cream: INK.cream, red: INK.red };
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Georgia, serif";

const STYLE = `
.al-scene{display:block;width:100%;height:auto;max-height:100%}
@media (prefers-reduced-motion: no-preference){
  .al-scene .al-in{animation:al-fade .45s ease-out both}
  .al-scene .al-glow{animation:al-glow 1.8s ease-in-out 2}
}
@keyframes al-fade{from{opacity:0}to{opacity:1}}
@keyframes al-glow{50%{opacity:.6}}
`;

/** Card / offering icon by id (lotería `lot-*`, offerings `off-*`). */
export function OptionIcon({ icon, size = 40, title }: { icon?: string | null; size?: number; title?: string }) {
  return <IconSvg icon={icon} size={size} title={title} />;
}

function Frame({ w, h, children, label }: { w: number; h: number; children: ReactNode; label: string }) {
  return (
    <svg className="al-scene" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={{ fontFamily: FONT }}>
      <style>{STYLE}</style>
      {children}
    </svg>
  );
}

const Icon = ({ id, x, y, s }: { id: string; x: number; y: number; s: number }) =>
  <g transform={`translate(${x} ${y}) scale(${s / 100})`}>{ICONS[id] ?? <circle cx={50} cy={50} r={20} fill={C.gold} />}</g>;

/* ——— lotería ——— */
function LoteriaGrid({ spec, audience, reveal }: { spec: SceneSpec; audience: "tv" | "phone"; reveal?: RevealInfo | null }) {
  const cards = (spec.data.cards as { label: string; icon: string }[]) ?? [];
  const cols = cards.length <= 9 ? (audience === "tv" ? 5 : 3) : audience === "tv" ? 6 : 4;
  const rows = Math.ceil(cards.length / cols);
  const cw = 150, ch = 210, gap = 18;
  const W = cols * cw + (cols + 1) * gap, H = rows * ch + (rows + 1) * gap;
  const ans = typeof reveal?.correct === "number" ? reveal.correct : null;
  const card = (reveal?.detail?.card ?? null) as { es: string; en: string } | null;
  return (
    <Frame w={W} h={H} label={ans !== null && card ? `Answer: ${card.es} (${card.en})` : `${cards.length} lotería cards`}>
      {cards.map((c, i) => {
        const x = gap + (i % cols) * (cw + gap), y = gap + Math.floor(i / cols) * (ch + gap);
        const win = ans === i, dim = ans !== null && !win;
        return (
          <g key={c.label} className="al-in" opacity={dim ? 0.28 : 1}>
            <rect x={x} y={y} width={cw} height={ch} rx={10} fill={C.cream} stroke={win ? C.gold : "#2A2530"} strokeWidth={win ? 8 : 3} className={win ? "al-glow" : undefined} />
            <rect x={x + 8} y={y + 8} width={cw - 16} height={ch - 16} rx={6} fill="none" stroke={C.bg} strokeWidth={2} />
            <text x={x + 16} y={y + 34} fontSize={24} fontWeight={800} fill={C.bg}>{c.label}</text>
            <Icon id={c.icon} x={x + 15} y={y + 46} s={120} />
            {win && card ? <text x={x + cw / 2} y={y + ch - 14} fontSize={card.es.length > 11 ? 15 : 18} fontWeight={800} textAnchor="middle" fill={C.bg} fontFamily={SERIF}>{card.es}</text> : null}
          </g>
        );
      })}
    </Frame>
  );
}

/* ——— ofrenda case ——— */
interface CasePerson { id: string; name: string; bio: string; offering: string; icon: string }
function CaseBoard({ spec, audience, reveal }: { spec: SceneSpec; audience: "tv" | "phone"; reveal?: RevealInfo | null }) {
  const people = (spec.data.people as CasePerson[]) ?? [];
  const slots = (spec.data.slots as { id: string; label: string }[]) ?? [];
  const sol = reveal?.detail?.final ? (reveal.correct as Record<string, string> | null) : null;
  const W = 1600, top = sol ? 30 : 190, altarY = sol ? 250 : 430, H = sol ? 640 : 650;
  void audience;
  const cast = [...people].sort((a, b) => a.name.localeCompare(b.name));
  const sw = W / 4;
  const placed = (slotId: string) => people.find((p) => sol?.[p.id] === slotId);
  return (
    <Frame w={W} h={H} label={sol ? "Solved ofrenda" : "Four altars awaiting four ancestors"}>
      {/* altars */}
      {slots.map((s, i) => {
        const cx = sw * i + sw / 2; const p = placed(s.id);
        return (
          <g key={s.id} className="al-in">
            <rect x={cx - 150} y={altarY} width={300} height={42} fill="#3A2A1E" stroke={C.gold} strokeWidth={2} />
            <rect x={cx - 120} y={altarY + 42} width={240} height={42} fill="#2C2017" stroke={C.gold} strokeWidth={2} />
            <rect x={cx - 90} y={altarY + 84} width={180} height={42} fill="#211810" stroke={C.gold} strokeWidth={2} />
            {[-130, 130].map((dx) => <g key={dx}><rect x={cx + dx - 6} y={altarY - 34} width={12} height={34} fill={C.cream} /><path d={`M${cx + dx} ${altarY - 50} q7 10 0 16 q-7 -6 0 -16Z`} fill={C.gold} /></g>)}
            <text x={cx} y={altarY + 160} fontSize={30} fontWeight={800} textAnchor="middle" fill={C.text}>{s.label.replace(/ \(.*\)/, "")}</text>
            {sol ? <text x={cx} y={altarY + 192} fontSize={20} textAnchor="middle" fill={C.muted}>{i === 0 ? "far left" : i === 3 ? "far right" : ""}</text> : null}
            {p ? (
              <g className="al-in">
                <circle cx={cx} cy={altarY - 110} r={70} fill={C.panel} stroke={C.gold} strokeWidth={4} />
                <Icon id="lot-calavera" x={cx - 50} y={altarY - 162} s={100} />
                <Icon id={p.icon} x={cx + 30} y={altarY - 60} s={60} />
                <text x={cx} y={altarY + 236} fontSize={30} fontWeight={800} textAnchor="middle" fill={C.gold} fontFamily={SERIF}>{p.name}</text>
              </g>
            ) : (
              <g><circle cx={cx} cy={altarY - 110} r={70} fill="none" stroke={C.line} strokeWidth={3} strokeDasharray="10 10" /><text x={cx} y={altarY - 94} fontSize={48} fontWeight={800} textAnchor="middle" fill={C.muted}>{i + 1}</text></g>
            )}
          </g>
        );
      })}
      {/* cast list: neutral alphabetical row above the board, never aligned with a specific altar */}
      {!sol ? (
        <g>
          <text x={W / 2} y={18} fontSize={18} textAnchor="middle" fill={C.muted} letterSpacing={3}>THE FAMILY · A–Z</text>
          {cast.map((p, i) => {
            const x = 130 + i * 340;
            return (
              <g key={p.id} className="al-in" transform={`translate(${x} 30)`}>
                <rect width={320} height={110} rx={12} fill={C.panel} stroke={C.line} />
                <Icon id={p.icon} x={10} y={15} s={80} />
                <text x={96} y={44} fontSize={23} fontWeight={800} fill={C.text} fontFamily={SERIF}>{p.name}</text>
                <text x={100} y={78} fontSize={20} fill={C.gold}>loved {p.offering}</text>
              </g>
            );
          })}
        </g>
      ) : null}
      <text x={W / 2} y={top} fontSize={22} textAnchor="middle" fill={C.muted} letterSpacing={4}>LEFT  ←  OFRENDA  →  RIGHT</text>
    </Frame>
  );
}

/* ——— the line ——— */
function LineAxis({ spec, reveal }: { spec: SceneSpec; reveal?: RevealInfo | null }) {
  const det = reveal?.detail as { items?: { id: string; text: string; display: string }[]; lowLabel?: string; highLabel?: string } | null | undefined;
  const items = det?.items ?? ((spec.data.items as { id: string; text: string }[]) ?? []).map((x) => ({ ...x, display: "" }));
  const low = det?.lowLabel ?? (spec.data.lowLabel as string), high = det?.highLabel ?? (spec.data.highLabel as string);
  const W = 1600, H = 420, n = items.length, x0 = 140, x1 = W - 140;
  const known = !!det?.items;
  return (
    <Frame w={W} h={H} label={known ? `True order: ${items.map((i) => i.text).join(", ")}` : "Ordering line"}>
      <line x1={x0} y1={200} x2={x1} y2={200} stroke={C.gold} strokeWidth={6} strokeLinecap="round" />
      <path d={`M${x1} 186 L${x1 + 26} 200 L${x1} 214Z`} fill={C.gold} />
      <text x={x0} y={250} fontSize={26} fill={C.muted} textAnchor="middle">{low}</text>
      <text x={x1} y={250} fontSize={26} fill={C.muted} textAnchor="middle">{high}</text>
      {known ? items.map((it, i) => {
        const x = n > 1 ? x0 + ((x1 - x0) * i) / (n - 1) : (x0 + x1) / 2;
        const up = i % 2 === 0;
        return (
          <g key={it.id} className="al-in">
            <circle cx={x} cy={200} r={14} fill={C.cream} stroke={C.gold} strokeWidth={4} />
            <text x={x} y={up ? 130 : 300} fontSize={40} fontWeight={800} textAnchor="middle" fill={C.gold}>{it.display}</text>
            <text x={x} y={up ? 80 : 345} fontSize={22} textAnchor="middle" fill={C.text}>{it.text.length > 34 ? `${it.text.slice(0, 32)}…` : it.text}</text>
          </g>
        );
      }) : null}
    </Frame>
  );
}

/* ——— closest ——— */
function ClosestLine({ spec, reveal }: { spec: SceneSpec; reveal?: RevealInfo | null }) {
  const det = reveal?.detail as { value?: number; display?: string } | null | undefined;
  const min = Number(spec.data.min), max = Number(spec.data.max), unit = String(spec.data.unit ?? "");
  const W = 1600, H = 380, x0 = 100, x1 = W - 100;
  const truth = typeof det?.value === "number" ? det.value : null;
  const guesses = (reveal?.outcomes ?? []).filter((o) => typeof o.value === "number");
  // zoom around the action so close guesses separate visually
  const vals = [truth, ...guesses.map((g) => g.value as number)].filter((v): v is number => v !== null);
  let lo = min, hi = max;
  if (truth !== null && vals.length) { lo = Math.max(min, Math.min(...vals) - truth * 0.15); hi = Math.min(max, Math.max(...vals, truth) + truth * 0.15); if (hi <= lo) { lo = min; hi = max; } }
  const X = (v: number) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  const isYear = /^years?$/i.test(unit) || spec.data.year === true;
  const fmt = (v: number) => (isYear ? String(Math.round(v)) : v.toLocaleString("en-US"));
  return (
    <Frame w={W} h={H} label={truth !== null ? `Answer ${fmt(truth)} ${unit}` : `Number line from ${fmt(min)} to ${fmt(max)} ${unit}`}>
      <line x1={x0} y1={220} x2={x1} y2={220} stroke={C.line} strokeWidth={6} />
      {truth !== null ? <rect x={X(truth)} y={200} width={Math.max(0, x1 - X(truth))} height={40} fill={C.red} opacity={0.22} /> : null}
      <text x={x0} y={280} fontSize={24} fill={C.muted} textAnchor="middle">{fmt(Math.round(lo))}</text>
      <text x={x1} y={280} fontSize={24} fill={C.muted} textAnchor="middle">{fmt(Math.round(hi))} {unit}</text>
      {guesses.map((g, i) => {
        const v = g.value as number, bust = truth !== null && v > truth;
        return (
          <g key={g.teamId} className="al-in">
            <line x1={X(v)} y1={220} x2={X(v)} y2={i % 2 ? 150 : 110} stroke={bust ? C.red : C.cream} strokeWidth={3} />
            <text x={X(v)} y={i % 2 ? 140 : 100} fontSize={22} textAnchor="middle" fill={bust ? C.red : C.text}>{g.name}: {fmt(v)}</text>
          </g>
        );
      })}
      {truth !== null ? (
        <g className="al-in">
          <line x1={X(truth)} y1={180} x2={X(truth)} y2={260} stroke={C.gold} strokeWidth={8} />
          <text x={X(truth)} y={330} fontSize={48} fontWeight={800} textAnchor="middle" fill={C.gold}>{det?.display ?? fmt(truth)}</text>
        </g>
      ) : null}
    </Frame>
  );
}

export function SceneView({ spec, audience, reveal, className, style }: SceneViewProps) {
  if (!spec) return null;
  let inner: ReactNode = null;
  switch (spec.template) {
    case "loteria-grid": inner = <LoteriaGrid spec={spec} audience={audience} reveal={reveal} />; break;
    case "case-board": inner = <CaseBoard spec={spec} audience={audience} reveal={reveal} />; break;
    case "line-axis": inner = <LineAxis spec={spec} reveal={reveal} />; break;
    case "closest-numberline": inner = <ClosestLine spec={spec} reveal={reveal} />; break;
    default: return null;
  }
  return <div className={className} style={{ width: "100%", ...style }} data-scene={spec.template}>{inner}</div>;
}

export default SceneView;
