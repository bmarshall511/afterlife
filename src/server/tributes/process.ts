import sharp from "sharp";
import { HttpError } from "./http";
import { LIMITS } from "./config";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif", "image/gif"];

/** Detect image format from magic bytes (client-provided content type is never trusted). */
export function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.toString("ascii", 0, 3) === "GIF") return "gif";
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(brand)) return "heic";
    if (/^avi[fs]$/.test(brand)) return "avif";
  }
  return null;
}

export interface Derivatives {
  original: Buffer; // normalized (EXIF-rotated, metadata stripped, <= 2400px) JPEG kept for re-renders
  display: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

/** Validate an uploaded photo. Throws HttpError with a guest-readable message. Returns normalized original. */
export async function normalizeUpload(buf: Buffer): Promise<Buffer> {
  if (buf.length === 0) throw new HttpError(400, "no_photo", "Please choose a photo.");
  if (buf.length > LIMITS.maxBytes) throw new HttpError(413, "too_large", "That photo is too large (15 MB max). Try a smaller copy or a screenshot.");
  const kind = sniff(buf);
  if (!kind) throw new HttpError(415, "bad_type", "That file isn't a photo we can use. Please choose a JPEG, PNG, WebP or iPhone photo.");
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(buf, { failOn: "error", limitInputPixels: 80_000_000 }).metadata();
  } catch {
    throw new HttpError(422, "undecodable", kind === "heic"
      ? "We couldn't read this iPhone (HEIC) photo. Please try again from Safari, or share it as a JPEG."
      : "We couldn't read this photo — it may be damaged. Please try a different copy.");
  }
  if (!meta.width || !meta.height || meta.width < LIMITS.minDimension || meta.height < LIMITS.minDimension)
    throw new HttpError(422, "too_small", "That photo is too small to show on the TV. Please choose a larger copy.");
  try {
    return await sharp(buf, { failOn: "error", limitInputPixels: 80_000_000, animated: false })
      .rotate() // apply EXIF orientation, then metadata is dropped on re-encode
      .resize({ width: LIMITS.originalLongEdge, height: LIMITS.originalLongEdge, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#000" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new HttpError(422, "undecodable", "We couldn't read this photo — it may be damaged. Please try a different copy.");
  }
}

/** Build display + thumb derivatives from a normalized original with an extra user rotation (0/90/180/270). */
export async function renderDerivatives(original: Buffer, rotation: number): Promise<Derivatives> {
  const rot = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  const base = rot ? await sharp(original).rotate(rot).toBuffer() : original;
  const display = await sharp(base)
    .resize({ width: LIMITS.displayLongEdge, height: LIMITS.displayLongEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(base)
    .resize({ width: LIMITS.thumbLongEdge, height: LIMITS.thumbLongEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  return { original, display: display.data, thumb, width: display.info.width, height: display.info.height };
}
