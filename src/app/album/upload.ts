"use client";

const MAX_BYTES = 25 * 1024 * 1024;
const DIRECT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_CANVAS_PIXELS = 16_000_000; // iOS Safari canvas limit is ~16.7 MP

export type UploadMode = "blob" | "local";

export class UploadError extends Error {
  constructor(message: string, public retryable = true, public status = 0) { super(message); }
}

function randomId() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function looksHeic(f: File) {
  return /image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
}

/**
 * Prepare a file for upload. JPEG/PNG/WebP go as-is (the server applies orientation and strips
 * metadata). HEIC/HEIF and other browser-decodable formats are converted to a high-quality JPEG
 * on a canvas (Safari decodes HEIC natively). Videos are rejected.
 */
export async function prepare(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
  if (file.type.startsWith("video/")) throw new UploadError("Videos can't be added — photos only.", false);
  if (DIRECT_TYPES.has(file.type) && !looksHeic(file)) {
    if (file.size > MAX_BYTES) throw new UploadError("This photo is larger than 25 MB.", false);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    return { blob: file, type: file.type, ext };
  }
  if (file.type && !file.type.startsWith("image/")) throw new UploadError("That file isn't a photo.", false);
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      src = await new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
        img.src = url;
      });
    } catch {
      throw new UploadError(looksHeic(file)
        ? "This browser can't open iPhone (HEIC) photos. Try Safari, or set Camera › Formats to “Most Compatible”."
        : "We couldn't open this photo.", false);
    }
  }
  const w = (src as HTMLImageElement).naturalWidth || src.width;
  const h = (src as HTMLImageElement).naturalHeight || src.height;
  const s = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (w * h)));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext("2d");
  if (!ctx) throw new UploadError("We couldn't prepare this photo.");
  ctx.drawImage(src, 0, 0, c.width, c.height);
  if ("close" in src) src.close();
  for (const q of [0.92, 0.85, 0.75]) {
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));
    if (!b) break;
    if (b.size <= MAX_BYTES) return { blob: b, type: "image/jpeg", ext: "jpg" };
  }
  throw new UploadError("We couldn't prepare this photo.", false);
}

function rawPathname(party: string, ext: string) {
  return `album-raw/${party}/${randomId()}.${ext}`;
}

async function readError(r: Response, fallback: string) {
  const d = await r.json().catch(() => ({}));
  return typeof d?.error === "string" ? d.error : fallback;
}

/** Upload raw bytes. Returns the raw pathname for finalize. Progress 0..1. */
export async function uploadRaw(mode: UploadMode, prepared: { blob: Blob; type: string; ext: string }, token: string, party: string, onProgress: (f: number) => void, signal?: AbortSignal): Promise<string> {
  const pathname = rawPathname(party, prepared.ext);
  if (mode === "blob") {
    const { uploadPresigned } = await import("@vercel/blob/client");
    try {
      await uploadPresigned(pathname, prepared.blob, {
        access: "private",
        handleUploadUrl: "/api/album/upload-token",
        clientPayload: JSON.stringify({ token, party }),
        contentType: prepared.type,
        abortSignal: signal,
        onUploadProgress: (e) => onProgress(e.percentage / 100),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      const m = (e as Error)?.message ?? "";
      if (/content type/i.test(m)) throw new UploadError("Only photos can be added.", false);
      if (/too large|size/i.test(m)) throw new UploadError("This photo is larger than 25 MB.", false);
      if (/invalid_link|valid/i.test(m)) throw new UploadError("This album link isn't valid any more.", false);
      throw new UploadError("Upload failed — check your connection and try again.");
    }
    return pathname;
  }
  const fd = new FormData();
  fd.set("token", token);
  fd.set("party", party);
  fd.set("pathname", pathname);
  fd.set("photo", prepared.blob, `photo.${prepared.ext}`);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/album/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = "Upload failed.";
      try { msg = JSON.parse(xhr.responseText).error ?? msg; } catch { /* keep */ }
      reject(new UploadError(msg, xhr.status >= 500 || xhr.status === 429));
    };
    xhr.onerror = () => reject(new UploadError("Upload failed — check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(fd);
  });
  return pathname;
}

export async function finalize(body: { pathname: string; caption: string; takenBy: string; party: string; token: string }) {
  let r: Response;
  try {
    r = await fetch("/api/album/finalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  } catch {
    throw new UploadError("Couldn't reach the server — try again.");
  }
  if (!r.ok) throw new UploadError(await readError(r, "Processing failed."), r.status >= 500 || r.status === 429 || r.status === 404, r.status);
  return (await r.json()).photo;
}
