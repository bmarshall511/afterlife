import type { Row } from "@/server/db";
import { getObject, signedGetUrl } from "@/server/storage";

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
export { notFound as albumNotFound };

const SECURE = { "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" };

export function downloadName(row: Row) {
  const d = new Date(row.created_at);
  const stamp = isNaN(d.getTime()) ? "photo" : d.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `afterlife-${stamp}-${String(row.id).slice(0, 8)}.jpg`;
}

/** Stream a derivative (display/thumb are well under the 4.5 MB response limit). */
export async function streamDerivative(row: Row, size: "thumb" | "display", cache: string) {
  const data = await getObject(size === "thumb" ? row.thumb_key : row.display_key);
  if (!data) return notFound();
  return new Response(new Uint8Array(data), {
    headers: { "content-type": size === "thumb" ? "image/webp" : "image/jpeg", "content-length": String(data.length), "cache-control": cache, "content-disposition": "inline", ...SECURE },
  });
}

/** Full quality: 302 to a short-lived signed Blob URL (never proxied: may exceed 4.5 MB); locally streamed. */
export async function serveFull(row: Row, attachment: boolean) {
  const signed = await signedGetUrl(row.full_key, 10 * 60 * 1000);
  if (signed) return new Response(null, { status: 302, headers: { location: signed, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  const data = await getObject(row.full_key);
  if (!data) return notFound();
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(data.length),
      "cache-control": "private, no-store",
      "content-disposition": `${attachment ? "attachment" : "inline"}; filename="${downloadName(row)}"`,
      ...SECURE,
    },
  });
}
