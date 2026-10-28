import fs from "node:fs/promises";
import path from "node:path";

/**
 * Photo object storage. Production: Vercel Blob (private access) when BLOB_READ_WRITE_TOKEN is set.
 * Local/dev/test: files under .data/blobs (or BLOBS_DIR). Keys are random, never exposed to clients;
 * photos are streamed through /api/tributes/photo/[id].
 */
export type StorageKind = "vercel-blob" | "local";

export function storageKind(): StorageKind {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return "vercel-blob";
  // Never fall back to the (ephemeral, read-only) local filesystem on Vercel.
  if (process.env.VERCEL) throw new Error("No Blob store connected: connect a private Vercel Blob store to this project.");
  return "local";
}

function localDir() {
  return path.resolve(process.cwd(), process.env.BLOBS_DIR ?? path.join(".data", "blobs"));
}

function safeKey(key: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..") || key.startsWith("/")) throw new Error("invalid storage key");
  return key;
}

export async function putObject(key: string, data: Buffer, contentType: string): Promise<void> {
  safeKey(key);
  if (storageKind() === "vercel-blob") {
    const { put } = await import("@vercel/blob");
    await put(key, data, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const file = path.join(localDir(), key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

export async function getObject(key: string): Promise<Buffer | null> {
  safeKey(key);
  if (storageKind() === "vercel-blob") {
    const { get } = await import("@vercel/blob");
    const r = await get(key, { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  }
  try {
    return await fs.readFile(path.join(localDir(), key));
  } catch {
    return null;
  }
}

export async function deleteObject(key: string | null | undefined): Promise<void> {
  if (!key) return;
  safeKey(key);
  if (storageKind() === "vercel-blob") {
    const { del } = await import("@vercel/blob");
    await del(key);
    return;
  }
  await fs.rm(path.join(localDir(), key), { force: true });
}

/* ---- Additive helpers (album workstream). Existing functions above are unchanged. ---- */

/** Like getObject, but bypasses the Blob CDN cache (read-after-write for fresh client uploads). */
export async function getObjectFresh(key: string): Promise<Buffer | null> {
  safeKey(key);
  if (storageKind() !== "vercel-blob") return getObject(key);
  const { get } = await import("@vercel/blob");
  try {
    const r = await get(key, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  } catch (e) {
    if ((e as { name?: string })?.name === "BlobNotFoundError") return null;
    throw e;
  }
}

/**
 * Short-lived presigned GET URL for a private blob (Vercel Signed URLs: issueSignedToken + presignUrl).
 * Returns null in local mode (callers stream the file instead).
 */
export async function signedGetUrl(key: string, ttlMs = 10 * 60 * 1000): Promise<string | null> {
  safeKey(key);
  if (storageKind() !== "vercel-blob") return null;
  const { issueSignedToken, presignUrl } = await import("@vercel/blob");
  const validUntil = Date.now() + ttlMs;
  const token = await issueSignedToken({ pathname: key, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname: key, access: "private", validUntil });
  return presignedUrl;
}
