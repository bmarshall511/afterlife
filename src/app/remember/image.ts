"use client";

const MAX_EDGE = 2400;
const TARGET_BYTES = 3.8 * 1024 * 1024; // stays under Vercel's 4.5 MB function request body limit

export type Source = HTMLCanvasElement;

/** Decode any browser-decodable image (incl. HEIC on Safari) with EXIF orientation applied, scaled to <= 2400px. */
export async function decodeToCanvas(file: File): Promise<Source> {
  let src: CanvasImageSource & { width: number; height: number };
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    src = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }
  const w = (src as HTMLImageElement).naturalWidth || src.width;
  const h = (src as HTMLImageElement).naturalHeight || src.height;
  if (!w || !h) throw new Error("decode");
  const s = Math.min(1, MAX_EDGE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("decode");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  if ("close" in src && typeof (src as ImageBitmap).close === "function") (src as ImageBitmap).close();
  return c;
}

/** Rotate a canvas clockwise by 0/90/180/270. */
export function rotateCanvas(src: Source, deg: number): Source {
  const r = ((deg % 360) + 360) % 360;
  if (!r) return src;
  const c = document.createElement("canvas");
  const swap = r === 90 || r === 270;
  c.width = swap ? src.height : src.width;
  c.height = swap ? src.width : src.height;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((r * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export async function canvasToJpeg(c: Source): Promise<Blob> {
  for (const q of [0.9, 0.82, 0.72, 0.6]) {
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));
    if (!b) throw new Error("encode");
    if (b.size <= TARGET_BYTES || q === 0.6) return b;
  }
  throw new Error("encode");
}
