"use client";

import { downloadZip } from "client-zip";

export interface ZipItem { url: string; name: string; lastModified?: string }
export interface ZipProgress { done: number; total: number; failed: number }

/**
 * Build a ZIP in the browser by fetching each full-quality URL (the server redirects to a short-lived
 * signed Blob URL). Streams to disk via the File System Access API when available (Chromium desktop);
 * otherwise assembles a Blob in memory (Safari/iOS: large albums may hit memory limits, and iOS saves
 * the .zip to Files rather than Photos).
 */
export async function downloadAllAsZip(items: ZipItem[], filename: string, onProgress: (p: ZipProgress) => void, signal?: AbortSignal): Promise<ZipProgress> {
  const p: ZipProgress = { done: 0, total: items.length, failed: 0 };
  onProgress({ ...p });
  async function* files() {
    for (const it of items) {
      if (signal?.aborted) return;
      try {
        const r = await fetch(it.url, { credentials: "same-origin", signal });
        if (!r.ok || !r.body) throw new Error(String(r.status));
        const buf = await r.arrayBuffer(); // fetch fully so a failure skips this file cleanly
        yield { name: it.name, input: new Uint8Array(buf), lastModified: it.lastModified ? new Date(it.lastModified) : undefined };
        p.done++;
      } catch {
        if (signal?.aborted) return;
        p.failed++;
      }
      onProgress({ ...p });
    }
  }
  const res = downloadZip(files());
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<WritableStream> }> };
  if (typeof w.showSaveFilePicker === "function" && window.self === window.top) {
    let handle;
    try {
      handle = await w.showSaveFilePicker({ suggestedName: filename, types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }] });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      handle = null;
    }
    if (handle) {
      await res.body!.pipeTo(await handle.createWritable(), { signal });
      return p;
    }
  }
  const blob = await res.blob();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return p;
}

export function zipName(createdAt: string, id: string, i: number) {
  const stamp = createdAt.slice(0, 19).replace(/[:T]/g, "-");
  return `${String(i + 1).padStart(3, "0")}-${stamp}-${id.slice(0, 8)}.jpg`;
}
