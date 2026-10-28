"use client";
/** InputSpec-driven phone controls. Each control is fully usable by tap (no drag/precision required). */
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { AnswerValue, InputSpec } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { OptionIcon } from "@/games/scenes/SceneView";

export type Draft = AnswerValue | null;

export function initialDraft(spec: InputSpec): Draft {
  switch (spec.kind) {
    case "order": return spec.items.map((i) => i.id);
    case "assign": return {};
    case "text": return "";
    case "percent": return 50;
    case "fib": return { statements: ["", "", ""], fib: -1 };
    default: return null;
  }
}

/** Null when the draft can be submitted; otherwise a short hint for the lock button. */
export function incompleteReason(spec: InputSpec, v: Draft): string | null {
  switch (spec.kind) {
    case "choice": return typeof v === "number" ? null : "Pick one";
    case "vote": return typeof v === "string" ? null : "Pick your favorite";
    case "order": return Array.isArray(v) && v.length === spec.items.length ? null : "Arrange the cards";
    case "number": return typeof v === "number" && v >= spec.min && v <= spec.max ? null : `Enter ${spec.min.toLocaleString("en-US")}–${spec.max.toLocaleString("en-US")}`;
    case "percent": return typeof v === "number" && v >= 0 && v <= 100 ? null : "Pick a percent";
    case "text": return typeof v === "string" && v.trim().length >= 2 ? null : "Write your line";
    case "fib": {
      const f = v as { statements?: string[]; fib?: number } | null;
      const filled = (f?.statements ?? []).filter((x) => x.trim().length >= 3).length;
      if (filled < 3) return `Write all 3 (${filled} done)`;
      return typeof f?.fib === "number" && f.fib >= 0 && f.fib <= 2 ? null : "Mark which one is the fib";
    }
    case "assign": {
      const n = v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).length : 0;
      return n === spec.people.length ? null : `Place all ${spec.people.length} (${n} placed)`;
    }
  }
}

export function AnswerInput({ spec, value, onChange, disabled, ownEntryId }: {
  spec: InputSpec; value: Draft; onChange: (v: Draft) => void; disabled: boolean; ownEntryId?: string | null;
}) {
  switch (spec.kind) {
    case "choice": return spec.layout === "grid" ? <CardGrid spec={spec} value={value} onChange={onChange} disabled={disabled} /> : <ChoiceList spec={spec} value={value} onChange={onChange} disabled={disabled} />;
    case "vote": return <VoteList spec={spec} value={value} onChange={onChange} disabled={disabled} ownEntryId={ownEntryId} />;
    case "order": return <OrderList spec={spec} value={value as string[]} onChange={onChange} disabled={disabled} />;
    case "number": return <NumberEntry spec={spec} value={value} onChange={onChange} disabled={disabled} />;
    case "percent": return <PercentEntry spec={spec} value={value} onChange={onChange} disabled={disabled} />;
    case "text": return <TextEntry spec={spec} value={value} onChange={onChange} disabled={disabled} />;
    case "assign": return <AssignBoard spec={spec} value={value} onChange={onChange} disabled={disabled} />;
    case "fib": return <FibEntry spec={spec} value={value} onChange={onChange} disabled={disabled} />;
  }
}

function FibEntry({ spec, value, onChange, disabled }: P<"fib">) {
  const v = (value && typeof value === "object" && "statements" in value ? value : { statements: ["", "", ""], fib: -1 }) as { statements: string[]; fib: number };
  const set = (i: number, t: string) => { const st = v.statements.slice(); st[i] = t.replace(/\n/g, " "); onChange({ ...v, statements: st }); };
  return (
    <div className="ph-fib">
      <p className="ph-fib-hint"><Icon name="eye" /> Keep it believable — two true, one fib. Short and specific works best.</p>
      {[0, 1, 2].map((i) => {
        const t = v.statements[i] ?? "";
        const isFib = v.fib === i;
        return (
          <div key={i} className={`ph-fib-row ${isFib ? "fib" : ""}`}>
            <label className="ph-fib-label" htmlFor={`fib-${i}`}>{String.fromCharCode(65 + i)}</label>
            <div className="ph-fib-field">
              <textarea id={`fib-${i}`} rows={2} maxLength={spec.maxLength} disabled={disabled} value={t} placeholder={i === 0 ? "e.g. Our abuela once out-danced a mariachi" : "Something about your family…"}
                onChange={(e) => set(i, e.target.value)} />
              <div className="ph-fib-foot">
                <button type="button" role="radio" aria-checked={isFib} className={`ph-fib-mark ${isFib ? "on" : ""}`} disabled={disabled} onClick={() => onChange({ ...v, fib: i })}>
                  <Icon name={isFib ? "x" : "check"} /> {isFib ? "This is the fib" : "Mark as the fib"}
                </button>
                <span className={`ph-text-count ${spec.maxLength - t.length <= 10 ? "low" : ""}`}>{t.length}/{spec.maxLength}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type P<K extends InputSpec["kind"]> = { spec: Extract<InputSpec, { kind: K }>; value: Draft; onChange: (v: Draft) => void; disabled: boolean };

function ChoiceList({ spec, value, onChange, disabled }: P<"choice">) {
  return (
    <div className="ph-options" role="radiogroup" aria-label="Answer choices">
      {spec.options.map((o, i) => (
        <button key={i} role="radio" aria-checked={value === i} className={`ph-opt ${value === i ? "sel" : ""}`} disabled={disabled} onClick={() => onChange(i)}>
          <span className="ph-opt-label">{o.label}</span>
          <span className="ph-opt-text">{o.text}</span>
          {value === i && <Icon name="check" className="ph-opt-tick" />}
        </button>
      ))}
    </div>
  );
}

function CardGrid({ spec, value, onChange, disabled }: P<"choice">) {
  return (
    <div className={`ph-cards n${spec.options.length}`} role="radiogroup" aria-label="Cards">
      {spec.options.map((o, i) => (
        <button key={i} role="radio" aria-checked={value === i} className={`ph-card ${value === i ? "sel" : ""}`} disabled={disabled} onClick={() => onChange(i)}>
          <span className="ph-card-n">{i + 1}</span>
          <span className="ph-card-art" data-n={o.label}><OptionIcon icon={o.icon} size={56} /></span>
          <span className="ph-card-name">{o.text}</span>
        </button>
      ))}
    </div>
  );
}

function VoteList({ spec, value, onChange, disabled, ownEntryId }: P<"vote"> & { ownEntryId?: string | null }) {
  return (
    <div className="ph-votes" role="radiogroup" aria-label="Epitaphs">
      {spec.entries.map((e, i) => e.id === ownEntryId ? null : (
        <button key={e.id} role="radio" aria-checked={value === e.id} className={`ph-vote ${value === e.id ? "sel" : ""}`} disabled={disabled} onClick={() => onChange(e.id)}>
          <span className="ph-opt-label">{String.fromCharCode(65 + i)}</span>
          <span className="ph-vote-text">{e.text}</span>
        </button>
      ))}
      {ownEntryId && spec.entries.some((e) => e.id === ownEntryId) && <p className="ph-fine left"><Icon name="eye" /> Your own line is hidden — no voting for yourselves.</p>}
    </div>
  );
}

function OrderList({ spec, value, onChange, disabled }: { spec: Extract<InputSpec, { kind: "order" }>; value: string[]; onChange: (v: Draft) => void; disabled: boolean }) {
  const ids = Array.isArray(value) && value.length === spec.items.length ? value : spec.items.map((i) => i.id);
  const byId = new Map(spec.items.map((i) => [i.id, i]));
  const drag = useRef<{ id: string; startY: number; rowH: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dy, setDy] = useState(0);
  const [live, setLive] = useState("");

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length || from === to) return ids;
    const next = ids.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
    setLive(`${byId.get(x)?.text} moved to position ${to + 1} of ${ids.length}`);
    return next;
  };

  const down = (e: RPointerEvent<HTMLElement>, id: string) => {
    if (disabled) return;
    const row = (e.currentTarget as HTMLElement).closest("li");
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, startY: e.clientY, rowH: (row?.getBoundingClientRect().height ?? 64) + 8 };
    setDragId(id); setDy(0);
  };
  const moveP = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current; if (!d) return;
    let delta = e.clientY - d.startY;
    const idx = ids.indexOf(d.id);
    const steps = Math.max(-idx, Math.min(ids.length - 1 - idx, Math.round(delta / d.rowH)));
    if (steps !== 0) { move(idx, idx + steps); d.startY += steps * d.rowH; delta -= steps * d.rowH; }
    setDy(delta);
  };
  const up = () => { drag.current = null; setDragId(null); setDy(0); };

  return (
    <div className="ph-order">
      <div className="ph-order-end"><Icon name="up" /> {spec.lowLabel}</div>
      <ol className="ph-order-list">
        {ids.map((id, k) => {
          const it = byId.get(id);
          return (
            <li key={id} className={dragId === id ? "dragging" : ""} style={dragId === id ? { transform: `translateY(${dy}px)` } : undefined}>
              <span className="ph-order-grip" aria-hidden="true" onPointerDown={(e) => down(e, id)} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}>
                <Icon name="grip" />
              </span>
              <span className="ph-order-n">{k + 1}</span>
              <span className="ph-order-text">{it?.icon && <OptionIcon icon={it.icon} size={28} />}{it?.text ?? id}</span>
              <span className="ph-order-btns">
                <button aria-label={`Move ${it?.text} up`} disabled={disabled || k === 0} onClick={() => move(k, k - 1)}><Icon name="up" /></button>
                <button aria-label={`Move ${it?.text} down`} disabled={disabled || k === ids.length - 1} onClick={() => move(k, k + 1)}><Icon name="down" /></button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="ph-order-end"><Icon name="down" /> {spec.highLabel}</div>
      <span className="sr-only" aria-live="polite">{live}</span>
    </div>
  );
}

function decimals(step: number) { const s = String(step); return s.includes(".") ? s.split(".")[1].length : 0; }

function NumberEntry({ spec, value, onChange, disabled }: P<"number">) {
  const [text, setText] = useState(typeof value === "number" ? String(value) : "");
  const dp = decimals(spec.step);
  const clamp = (n: number) => Math.min(spec.max, Math.max(spec.min, Number(n.toFixed(dp))));
  const set = (n: number) => { const c = clamp(n); setText(String(c)); onChange(c); };
  const cur = typeof value === "number" ? value : null;
  const big = Math.max(spec.step * 10, Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, spec.max - spec.min))) - 1)));
  return (
    <div className="ph-num">
      <div className="ph-num-row">
        <button className="ph-step" aria-label={`Minus ${spec.step}`} disabled={disabled} onClick={() => set((cur ?? spec.min) - spec.step)}><Icon name="minus" /></button>
        <label className="ph-num-field">
          <span className="sr-only">Your guess{spec.unit ? ` in ${spec.unit}` : ""}</span>
          <input inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder="?" disabled={disabled} value={text}
            onChange={(e) => {
              const t = e.target.value.replace(/[^\d.,-]/g, "").replace(",", ".");
              setText(t);
              const n = Number(t);
              onChange(t !== "" && Number.isFinite(n) ? n : null);
            }}
            onBlur={() => { if (cur != null) set(cur); }} />
          {spec.unit && <span className="ph-num-unit">{spec.unit}</span>}
        </label>
        <button className="ph-step" aria-label={`Plus ${spec.step}`} disabled={disabled} onClick={() => set((cur ?? spec.min) + spec.step)}><Icon name="plus" /></button>
      </div>
      <div className="ph-num-quick">
        <button disabled={disabled} onClick={() => set((cur ?? spec.min) - big)}>−{big.toLocaleString("en-US")}</button>
        <span>Between {spec.min.toLocaleString("en-US")} and {spec.max.toLocaleString("en-US")}{spec.unit ? ` ${spec.unit}` : ""}</span>
        <button disabled={disabled} onClick={() => set((cur ?? spec.min) + big)}>+{big.toLocaleString("en-US")}</button>
      </div>
      <p className="ph-fine left"><Icon name="bust" /> Going over the real {spec.unit === "pesos" ? "price" : "number"} scores zero.</p>
    </div>
  );
}

function PercentEntry({ spec, value, onChange, disabled }: P<"percent">) {
  const v = typeof value === "number" ? value : 50;
  const set = (n: number) => onChange(Math.min(100, Math.max(0, Math.round(n))));
  return (
    <div className="ph-pct">
      <div className="ph-pct-big" aria-hidden="true">{v}<span>%</span></div>
      <input type="range" min={0} max={100} step={1} value={v} disabled={disabled} aria-label="Percent of families"
        aria-valuetext={`${v} percent`} onChange={(e) => set(Number(e.target.value))} style={{ ["--p" as string]: `${v}%` }} />
      <div className="ph-pct-ticks" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
      <div className="ph-pct-btns">
        {[-10, -1, 1, 10].map((d) => (
          <button key={d} disabled={disabled} onClick={() => set(v + d)} aria-label={`${d > 0 ? "Plus" : "Minus"} ${Math.abs(d)} percent`}>{d > 0 ? `+${d}` : `−${-d}`}</button>
        ))}
      </div>
      {spec.optionText && <span className="sr-only">Your answer was {spec.optionText}</span>}
    </div>
  );
}

function TextEntry({ spec, value, onChange, disabled }: P<"text">) {
  const t = typeof value === "string" ? value : "";
  const left = spec.maxLength - t.length;
  return (
    <div className="ph-text">
      <label className="sr-only" htmlFor="ph-text-in">Your last line</label>
      <textarea id="ph-text-in" rows={3} maxLength={spec.maxLength} placeholder={spec.placeholder} disabled={disabled} value={t}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))} enterKeyHint="done" />
      <div className={`ph-text-count ${left <= 10 ? "low" : ""}`} aria-live="polite">{t.length}/{spec.maxLength}</div>
    </div>
  );
}

function AssignBoard({ spec, value, onChange, disabled }: P<"assign">) {
  const map: Record<string, string> = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
  const [sel, setSel] = useState<string | null>(null);
  const who = (slot: string) => Object.keys(map).find((p) => map[p] === slot) ?? null;
  const name = (p: string | null) => spec.people.find((x) => x.id === p)?.name ?? "";
  const place = (slot: string) => {
    if (disabled) return;
    if (!sel) { const p = who(slot); if (p) setSel(p); return; }
    const next: Record<string, string> = {};
    for (const [p, s] of Object.entries(map)) if (p !== sel && s !== slot) next[p] = s;
    next[sel] = slot;
    onChange(next);
    const nextUnplaced = spec.people.find((p) => !next[p.id]);
    setSel(nextUnplaced?.id ?? null);
  };
  return (
    <div className="ph-assign">
      <div className="ph-assign-h"><span>1 · Tap an ancestor</span></div>
      <div className="ph-people" role="listbox" aria-label="Ancestors">
        {spec.people.map((p) => {
          const slot = spec.slots.find((s) => s.id === map[p.id]);
          return (
            <button key={p.id} role="option" aria-selected={sel === p.id} className={`ph-person ${sel === p.id ? "sel" : ""} ${slot ? "placed" : ""}`} disabled={disabled} onClick={() => setSel(sel === p.id ? null : p.id)}>
              <b>{p.name}</b>
              <small>{slot ? <><Icon name="check" /> {slot.label}</> : "Not placed"}</small>
            </button>
          );
        })}
      </div>
      <div className="ph-assign-h"><span>2 · Tap an altar{sel ? ` for ${name(sel)}` : ""}</span>
        <button className="link-btn" disabled={disabled || !Object.keys(map).length} onClick={() => { onChange({}); setSel(null); }}><Icon name="reset" /> Clear</button>
      </div>
      <div className="ph-altars">
        {spec.slots.map((s) => {
          const p = who(s.id);
          return (
            <button key={s.id} className={`ph-altar ${p ? "filled" : ""} ${sel ? "target" : ""}`} disabled={disabled} onClick={() => place(s.id)}
              aria-label={`${s.label}: ${p ? name(p) : "empty"}`}>
              <span className="ph-altar-label">{s.label}</span>
              <b>{p ? name(p) : "—"}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ read-only summaries */

export function ValueSummary({ spec, value }: { spec: InputSpec | null; value: AnswerValue }) {
  if (!spec) return <div className="ph-sum"><b>{typeof value === "object" ? "Saved" : String(value)}</b></div>;
  switch (spec.kind) {
    case "choice": {
      const o = spec.options[value as number];
      return <div className="ph-sum row">{o?.icon && <OptionIcon icon={o.icon} size={44} />}<span className="ph-opt-label">{o?.label}</span><b>{o?.text ?? "—"}</b></div>;
    }
    case "vote": {
      const i = spec.entries.findIndex((e) => e.id === value);
      return <div className="ph-sum row"><span className="ph-opt-label">{String.fromCharCode(65 + Math.max(0, i))}</span><b className="ital">{spec.entries[i]?.text ?? "—"}</b></div>;
    }
    case "order": {
      const by = new Map(spec.items.map((x) => [x.id, x.text]));
      return <ol className="ph-sum-list">{(value as string[]).map((id) => <li key={id}>{by.get(id) ?? id}</li>)}</ol>;
    }
    case "number": return <div className="ph-sum big">{Number(value).toLocaleString("en-US")}<small>{spec.unit}</small></div>;
    case "percent": return <div className="ph-sum big">{String(value)}<small>%</small></div>;
    case "text": return <div className="ph-sum"><b className="ital">“{String(value)}”</b></div>;
    case "fib": {
      const f = value as { statements: string[]; fib: number };
      return (
        <ul className="ph-sum-list plain">
          {f.statements.map((t, i) => <li key={i}><span>{String.fromCharCode(65 + i)} · {t}</span><b>{i === f.fib ? "Fib" : "True"}</b></li>)}
        </ul>
      );
    }
    case "assign": {
      const m = value as Record<string, string>;
      return (
        <ul className="ph-sum-list plain">
          {spec.slots.map((s) => {
            const p = Object.keys(m).find((k) => m[k] === s.id);
            return <li key={s.id}><span>{s.label}</span><b>{spec.people.find((x) => x.id === p)?.name ?? "—"}</b></li>;
          })}
        </ul>
      );
    }
  }
}
