/** Generates app icons (PWA, Apple touch, favicon) from one SVG design. Run: npx tsx scripts/build-icons.ts */
import sharp from "sharp";
import fs from "node:fs";

function flower(cx: number, cy: number, r: number) {
  // marigold: two rings of rounded petals around a deeper center
  const ring = (n: number, rad: number, pr: number, fill: string, rot: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + rot;
      return `<circle cx="${cx + Math.cos(a) * rad}" cy="${cy + Math.sin(a) * rad}" r="${pr}" fill="${fill}"/>`;
    }).join("");
  return ring(12, r * 0.62, r * 0.36, "#f07a12", 0) + ring(10, r * 0.38, r * 0.3, "#f6a623", 0.3) + `<circle cx="${cx}" cy="${cy}" r="${r * 0.28}" fill="#ffc35a"/>`;
}

/** pad = fraction of canvas kept clear around the mark (maskable icons need ~20%). */
function svg(size: number, pad: number, rounded: boolean) {
  const s = size, m = s * pad, w = s - 2 * m;
  const stroke = w * 0.034;
  const ax = m + w * 0.5, top = m + w * 0.2, base = m + w * 0.82, half = w * 0.27;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#1a1210"/><stop offset="1" stop-color="#050506"/></radialGradient></defs>
  <rect width="${s}" height="${s}" rx="${rounded ? s * 0.22 : 0}" fill="url(#g)"/>
  <path d="M ${ax - half} ${base} L ${ax} ${top} L ${ax + half} ${base} M ${ax - half * ((0.62 - 0.2) / 0.62)} ${m + w * 0.62} L ${ax + half * ((0.62 - 0.2) / 0.62)} ${m + w * 0.62}"
    fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="butt" stroke-linejoin="miter"/>
  ${flower(ax + half * 0.92, top + w * 0.03, w * 0.085)}
</svg>`;
}

const out = "public/icons";
fs.mkdirSync(out, { recursive: true });
const jobs: [string, number, number, boolean][] = [
  ["icon-192.png", 192, 0.08, false],
  ["icon-512.png", 512, 0.08, false],
  ["maskable-512.png", 512, 0.2, false],
  ["apple-touch-icon.png", 180, 0.1, false],
  ["favicon-64.png", 64, 0.04, true],
];
for (const [name, size, pad, rounded] of jobs) await sharp(Buffer.from(svg(size, pad, rounded))).png().toFile(`${out}/${name}`);
fs.writeFileSync(`${out}/icon.svg`, svg(512, 0.08, true));
console.log("icons written to", out);
