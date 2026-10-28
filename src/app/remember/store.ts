"use client";

export interface SavedTribute { id: string; token: string; name: string; createdAt: string }
const KEY = "afterlife.tributes";

export function loadSaved(): SavedTribute[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && typeof x.token === "string") : [];
  } catch {
    return [];
  }
}
export function saveTribute(t: SavedTribute) {
  try {
    localStorage.setItem(KEY, JSON.stringify([t, ...loadSaved().filter((x) => x.id !== t.id)].slice(0, 50)));
  } catch {}
}
export function forgetTribute(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadSaved().filter((x) => x.id !== id)));
  } catch {}
}
export const editPath = (id: string, token: string) => `/remember/edit/${id}#${token}`;
