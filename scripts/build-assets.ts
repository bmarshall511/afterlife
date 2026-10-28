/**
 * Derive responsive web assets from the original key art.
 * Originals in afterlife-handoff/assets are never modified. Never upscales:
 * widths larger than the source are clamped to the source width (aspect preserved).
 * Output: public/art/<name>-<w>.{webp,avif} + public/art/placeholders.json (tiny blurred data URIs).
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "afterlife-handoff/assets");
const OUT = path.join(ROOT, "public/art");
const NAMES = ["arrival-amber", "focus-violet", "celebration-magenta"] as const;
// "full" = source resolution (1672px); we never upscale. Browsers scale it for 1080p/4K with object-fit: cover.
const SIZES: { label: string; width: number }[] = [{ label: "960", width: 960 }, { label: "full", width: Infinity }];

async function main() {
  await mkdir(OUT, { recursive: true });
  const placeholders: Record<string, string> = {};
  for (const name of NAMES) {
    const file = path.join(SRC, `${name}.png`);
    const meta = await sharp(file).metadata();
    const srcW = meta.width ?? 0;
    for (const { label, width: want } of SIZES) {
      const width = Math.min(want, srcW);
      const hi = label === "full";
      const base = sharp(file).resize({ width, withoutEnlargement: true, fit: "inside" });
      await base.clone().webp({ quality: hi ? 86 : 80 }).toFile(path.join(OUT, `${name}-${label}.webp`));
      await base.clone().avif({ quality: hi ? 62 : 55 }).toFile(path.join(OUT, `${name}-${label}.avif`));
      console.log(`${name}-${label}: ${width}px`);
    }
    const tiny = await sharp(file).resize({ width: 32 }).blur(1.2).webp({ quality: 50 }).toBuffer();
    placeholders[name] = `data:image/webp;base64,${tiny.toString("base64")}`;
  }
  await writeFile(path.join(OUT, "placeholders.json"), JSON.stringify(placeholders, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
