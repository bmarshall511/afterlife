/**
 * Deterministic object library shared by content generators (server) and SceneView (client).
 * Every object is a list of simple primitives in a 100x100 box so bounding boxes are exact.
 * Silhouettes are deliberately distinct so no clue relies on color alone.
 */

export type Fill =
  | "gold" | "tang" | "tang2" | "leaf" | "cream" | "white" | "dark" | "violet" | "fuchsia"
  | "bread" | "breadDark" | "glass" | "aqua" | "clay" | "smoke" | "bg";

export type Prim =
  | { t: "c"; cx: number; cy: number; r: number; f: Fill; d?: 1 }
  | { t: "e"; cx: number; cy: number; rx: number; ry: number; f: Fill; d?: 1 }
  | { t: "r"; x: number; y: number; w: number; h: number; rx?: number; f: Fill; d?: 1 }
  | { t: "p"; pts: number[]; f: Fill; d?: 1 }
  | { t: "l"; pts: number[]; w: number; f: Fill; d?: 1 };

export const PALETTE: Record<Fill, string> = {
  gold: "#F5A524", tang: "#F97316", tang2: "#C2410C", leaf: "#5E8C55", cream: "#EFE3CC",
  white: "#F7F4EF", dark: "#1B1622", violet: "#8B5CF6", fuchsia: "#D946EF", bread: "#C98A44",
  breadDark: "#8A5427", glass: "#CFE3F2", aqua: "#6FA8DC", clay: "#A0522D", smoke: "#BDB6C9", bg: "#0B0A10",
};

export type ObjectKind =
  | "marigold" | "candle" | "skull" | "bread" | "water" | "copal" | "photo" | "papel"
  | "butterfly" | "cup" | "orange" | "guitar" | "plate";

export const OBJECTS: Record<ObjectKind, { label: string; plural: string; es: string }> = {
  marigold: { label: "Marigold", plural: "marigolds", es: "Cempasúchil" },
  candle: { label: "Candle", plural: "candles", es: "Vela" },
  skull: { label: "Sugar skull", plural: "sugar skulls", es: "Calaverita" },
  bread: { label: "Pan de muerto", plural: "loaves of pan de muerto", es: "Pan de muerto" },
  water: { label: "Glass of water", plural: "glasses of water", es: "Vaso de agua" },
  copal: { label: "Copal burner", plural: "copal burners", es: "Copalero" },
  photo: { label: "Photo frame", plural: "photo frames", es: "Retrato" },
  papel: { label: "Papel picado", plural: "papel picado flags", es: "Papel picado" },
  butterfly: { label: "Butterfly", plural: "butterflies", es: "Mariposa" },
  cup: { label: "Hot chocolate", plural: "cups of hot chocolate", es: "Chocolate" },
  orange: { label: "Orange", plural: "oranges", es: "Naranja" },
  guitar: { label: "Guitar", plural: "guitars", es: "Guitarra" },
  plate: { label: "Plate of tamales", plural: "plates of tamales", es: "Tamales" },
};

export const ALL_KINDS = Object.keys(OBJECTS) as ObjectKind[];

function marigold(): Prim[] {
  const out: Prim[] = [{ t: "r", x: 47, y: 62, w: 6, h: 34, f: "leaf" }, { t: "e", cx: 62, cy: 84, rx: 11, ry: 5, f: "leaf", d: 1 }];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI * 2) / 10;
    out.push({ t: "c", cx: round(50 + 24 * Math.cos(a)), cy: round(42 + 24 * Math.sin(a)), r: 13, f: "gold" });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8 + 0.4;
    out.push({ t: "c", cx: round(50 + 12 * Math.cos(a)), cy: round(42 + 12 * Math.sin(a)), r: 10, f: "tang" });
  }
  out.push({ t: "c", cx: 50, cy: 42, r: 7, f: "tang2", d: 1 });
  return out;
}
const round = (n: number) => Math.round(n * 10) / 10;

const DRAW: Record<ObjectKind, () => Prim[]> = {
  marigold,
  candle: () => [
    { t: "r", x: 26, y: 90, w: 48, h: 7, rx: 3, f: "gold" },
    { t: "r", x: 34, y: 40, w: 32, h: 52, rx: 4, f: "cream" },
    { t: "e", cx: 40, cy: 46, rx: 4, ry: 9, f: "white", d: 1 },
    { t: "r", x: 48, y: 31, w: 4, h: 10, f: "dark" },
    { t: "e", cx: 50, cy: 22, rx: 9, ry: 15, f: "gold" },
    { t: "e", cx: 50, cy: 27, rx: 4, ry: 7, f: "white", d: 1 },
  ],
  skull: () => [
    { t: "e", cx: 50, cy: 42, rx: 32, ry: 30, f: "white" },
    { t: "r", x: 32, y: 56, w: 36, h: 26, rx: 10, f: "white" },
    { t: "c", cx: 38, cy: 44, r: 9, f: "violet" },
    { t: "c", cx: 62, cy: 44, r: 9, f: "violet" },
    { t: "p", pts: [50, 52, 45, 62, 55, 62], f: "dark" },
    { t: "l", pts: [38, 72, 62, 72], w: 2, f: "dark", d: 1 },
    { t: "l", pts: [44, 67, 44, 78], w: 2, f: "dark", d: 1 },
    { t: "l", pts: [50, 67, 50, 78], w: 2, f: "dark", d: 1 },
    { t: "l", pts: [56, 67, 56, 78], w: 2, f: "dark", d: 1 },
    { t: "c", cx: 50, cy: 23, r: 5, f: "fuchsia", d: 1 },
    { t: "c", cx: 42, cy: 21, r: 3, f: "fuchsia", d: 1 },
    { t: "c", cx: 58, cy: 21, r: 3, f: "fuchsia", d: 1 },
  ],
  bread: () => [
    { t: "e", cx: 50, cy: 64, rx: 42, ry: 26, f: "bread" },
    { t: "l", pts: [24, 52, 76, 76], w: 8, f: "breadDark" },
    { t: "l", pts: [24, 76, 76, 52], w: 8, f: "breadDark" },
    { t: "c", cx: 50, cy: 40, r: 10, f: "breadDark" },
    { t: "c", cx: 34, cy: 66, r: 2, f: "white", d: 1 },
    { t: "c", cx: 66, cy: 66, r: 2, f: "white", d: 1 },
    { t: "c", cx: 50, cy: 80, r: 2, f: "white", d: 1 },
  ],
  water: () => [
    { t: "p", pts: [30, 18, 70, 18, 63, 94, 37, 94], f: "glass" },
    { t: "p", pts: [32.5, 40, 67.5, 40, 62, 90, 38, 90], f: "aqua" },
    { t: "l", pts: [30, 18, 70, 18], w: 3, f: "white", d: 1 },
    { t: "l", pts: [39, 46, 41, 84], w: 3, f: "white", d: 1 },
  ],
  copal: () => [
    { t: "c", cx: 44, cy: 28, r: 7, f: "smoke", d: 1 },
    { t: "c", cx: 55, cy: 17, r: 6, f: "smoke", d: 1 },
    { t: "c", cx: 47, cy: 7, r: 5, f: "smoke", d: 1 },
    { t: "e", cx: 50, cy: 88, rx: 24, ry: 7, f: "clay" },
    { t: "r", x: 44, y: 64, w: 12, h: 22, f: "clay" },
    { t: "p", pts: [20, 44, 80, 44, 66, 68, 34, 68], f: "clay" },
    { t: "r", x: 16, y: 39, w: 68, h: 8, rx: 4, f: "gold" },
  ],
  photo: () => [
    { t: "r", x: 22, y: 12, w: 56, h: 76, rx: 3, f: "gold" },
    { t: "r", x: 30, y: 20, w: 40, h: 60, f: "dark" },
    { t: "c", cx: 50, cy: 40, r: 9, f: "cream" },
    { t: "e", cx: 50, cy: 70, rx: 16, ry: 11, f: "cream" },
    { t: "r", x: 40, y: 90, w: 20, h: 6, f: "gold", d: 1 },
  ],
  papel: () => [
    { t: "l", pts: [4, 14, 96, 14], w: 2, f: "white" },
    { t: "p", pts: [16, 14, 84, 14, 84, 80, 67, 70, 50, 80, 33, 70, 16, 80], f: "fuchsia" },
    { t: "c", cx: 50, cy: 38, r: 9, f: "dark", d: 1 },
    { t: "c", cx: 31, cy: 32, r: 5, f: "dark", d: 1 },
    { t: "c", cx: 69, cy: 32, r: 5, f: "dark", d: 1 },
    { t: "p", pts: [50, 52, 57, 60, 50, 68, 43, 60], f: "dark", d: 1 },
  ],
  butterfly: () => [
    { t: "e", cx: 32, cy: 38, rx: 20, ry: 16, f: "tang" },
    { t: "e", cx: 68, cy: 38, rx: 20, ry: 16, f: "tang" },
    { t: "e", cx: 36, cy: 64, rx: 14, ry: 12, f: "tang" },
    { t: "e", cx: 64, cy: 64, rx: 14, ry: 12, f: "tang" },
    { t: "e", cx: 50, cy: 50, rx: 5, ry: 26, f: "dark" },
    { t: "l", pts: [48, 26, 40, 10], w: 2, f: "cream", d: 1 },
    { t: "l", pts: [52, 26, 60, 10], w: 2, f: "cream", d: 1 },
    { t: "c", cx: 26, cy: 34, r: 4, f: "white", d: 1 },
    { t: "c", cx: 74, cy: 34, r: 4, f: "white", d: 1 },
  ],
  cup: () => [
    { t: "c", cx: 72, cy: 62, r: 12, f: "clay" },
    { t: "c", cx: 72, cy: 62, r: 6, f: "bg" },
    { t: "r", x: 26, y: 40, w: 44, h: 50, rx: 7, f: "clay" },
    { t: "e", cx: 48, cy: 43, rx: 19, ry: 4, f: "breadDark", d: 1 },
    { t: "l", pts: [40, 32, 44, 22, 40, 12], w: 3, f: "smoke", d: 1 },
    { t: "l", pts: [55, 32, 59, 22, 55, 12], w: 3, f: "smoke", d: 1 },
  ],
  orange: () => [
    { t: "c", cx: 50, cy: 58, r: 32, f: "tang" },
    { t: "r", x: 48, y: 18, w: 4, h: 10, f: "dark" },
    { t: "e", cx: 63, cy: 22, rx: 12, ry: 6, f: "leaf" },
    { t: "c", cx: 50, cy: 60, r: 3, f: "tang2", d: 1 },
    { t: "e", cx: 37, cy: 46, rx: 7, ry: 4, f: "white", d: 1 },
  ],
  guitar: () => [
    { t: "c", cx: 50, cy: 72, r: 23, f: "bread" },
    { t: "c", cx: 50, cy: 48, r: 16, f: "bread" },
    { t: "r", x: 46, y: 8, w: 8, h: 46, f: "breadDark" },
    { t: "r", x: 41, y: 2, w: 18, h: 10, rx: 2, f: "dark" },
    { t: "c", cx: 50, cy: 58, r: 7, f: "dark", d: 1 },
    { t: "r", x: 41, y: 78, w: 18, h: 4, f: "dark", d: 1 },
    { t: "l", pts: [48, 10, 48, 80], w: 1, f: "cream", d: 1 },
    { t: "l", pts: [52, 10, 52, 80], w: 1, f: "cream", d: 1 },
  ],
  plate: () => [
    { t: "e", cx: 50, cy: 68, rx: 44, ry: 16, f: "white" },
    { t: "e", cx: 50, cy: 66, rx: 33, ry: 10, f: "cream", d: 1 },
    { t: "e", cx: 37, cy: 56, rx: 15, ry: 9, f: "gold" },
    { t: "e", cx: 62, cy: 56, rx: 15, ry: 9, f: "gold" },
    { t: "e", cx: 50, cy: 46, rx: 15, ry: 9, f: "gold" },
    { t: "l", pts: [30, 56, 44, 56], w: 2, f: "leaf", d: 1 },
    { t: "l", pts: [55, 56, 69, 56], w: 2, f: "leaf", d: 1 },
  ],
};

const CACHE = new Map<ObjectKind, Prim[]>();
export function shapesFor(kind: ObjectKind): Prim[] {
  let s = CACHE.get(kind);
  if (!s) { s = DRAW[kind](); CACHE.set(kind, s); }
  return s.map((p) => ({ ...p, ...("pts" in p ? { pts: [...p.pts] } : {}) }) as Prim);
}

export function isKind(k: unknown): k is ObjectKind {
  return typeof k === "string" && k in OBJECTS;
}

export function bbox(p: Prim): [number, number, number, number] {
  switch (p.t) {
    case "c": return [p.cx - p.r, p.cy - p.r, p.cx + p.r, p.cy + p.r];
    case "e": return [p.cx - p.rx, p.cy - p.ry, p.cx + p.rx, p.cy + p.ry];
    case "r": return [p.x, p.y, p.x + p.w, p.y + p.h];
    default: {
      const xs = p.pts.filter((_, i) => i % 2 === 0), ys = p.pts.filter((_, i) => i % 2 === 1);
      const pad = p.t === "l" ? p.w / 2 : 0;
      return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    }
  }
}

export function intersects(p: Prim, v: { x: number; y: number; s: number }): boolean {
  const [x0, y0, x1, y1] = bbox(p);
  return x1 > v.x && x0 < v.x + v.s && y1 > v.y && y0 < v.y + v.s;
}

/** Which library kind (if any) a shape list exactly matches. Used by validation. */
export function matchKind(shapes: unknown): ObjectKind | null {
  const j = JSON.stringify(shapes);
  for (const k of ALL_KINDS) if (JSON.stringify(shapesFor(k)) === j) return k;
  return null;
}
