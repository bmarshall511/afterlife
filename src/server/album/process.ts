import sharp from "sharp";
import { HttpError } from "@/server/tributes/http";
import { sniff } from "@/server/tributes/process";
import { ALBUM_LIMITS as L } from "./config";

export interface AlbumDerivatives {
  full: Buffer; // original resolution, EXIF-rotated, all metadata stripped, JPEG q92
  display: Buffer; // <= 1920 long edge JPEG
  thumb: Buffer; // <= 480 long edge WebP
  width: number;
  height: number;
}

const ALLOWED = new Set(["jpeg", "png", "webp", "heic"]);

/** Validate + re-encode a raw upload. Throws HttpError with a guest-readable message. */
export async function processAlbumPhoto(buf: Buffer): Promise<AlbumDerivatives> {
  if (buf.length === 0) throw new HttpError(400, "no_photo", "That upload was empty. Please try again.");
  if (buf.length > L.maxBytes) throw new HttpError(413, "too_large", "That photo is too large (25 MB max).");
  const kind = sniff(buf);
  if (!kind || !ALLOWED.has(kind))
    throw new HttpError(415, "bad_type", "That file isn't a photo we can use. Please choose a JPEG, PNG, WebP or iPhone photo (no videos).");
  const opts = { failOn: "error" as const, limitInputPixels: L.maxInputPixels, animated: false };
  let meta;
  try {
    meta = await sharp(buf, opts).metadata();
  } catch {
    throw new HttpError(422, "undecodable", kind === "heic"
      ? "We couldn't read this iPhone (HEIC) photo. Please try again from Safari, or share it as a JPEG."
      : "We couldn't read this photo — it may be damaged. Please try a different copy.");
  }
  if (!meta.width || !meta.height || meta.width < L.minDimension || meta.height < L.minDimension)
    throw new HttpError(422, "too_small", "That photo is too small. Please choose a larger copy.");
  try {
    // .rotate() applies EXIF orientation; sharp drops ALL metadata (EXIF/GPS/XMP/IPTC) on output
    // unless withMetadata/keep* is called, which we never do.
    const full = await sharp(buf, opts).rotate().flatten({ background: "#000" }).jpeg({ quality: L.fullQuality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    const display = await sharp(full.data)
      .resize({ width: L.displayLongEdge, height: L.displayLongEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    const thumb = await sharp(full.data)
      .resize({ width: L.thumbLongEdge, height: L.thumbLongEdge, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer();
    return { full: full.data, display, thumb, width: full.info.width, height: full.info.height };
  } catch {
    throw new HttpError(422, "undecodable", "We couldn't read this photo — it may be damaged. Please try a different copy.");
  }
}
