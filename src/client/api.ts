"use client";
import type { MeView, PartyId, Stage, ApiError } from "@/shared/types";

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function partyFromLocation(): PartyId {
  if (typeof window === "undefined") return "live";
  return new URLSearchParams(window.location.search).get("party") === "demo" ? "demo" : "live";
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiFailure(0, "network", "Network unavailable");
  }
  if (!res.ok) {
    let body: Partial<ApiError> = {};
    try { body = await res.json(); } catch { /* ignore */ }
    throw new ApiFailure(res.status, body.code ?? "http_" + res.status, body.error ?? res.statusText);
  }
  return (await res.json()) as T;
}

export const api = {
  me: (party: PartyId) => call<MeView>(`/api/me?party=${party}`),
  join: (party: PartyId, name: string, inviteCode?: string) =>
    call<MeView>("/api/join", { method: "POST", body: JSON.stringify({ party, name, inviteCode: inviteCode || undefined }) }),
  answer: (party: PartyId, questionId: string, stage: Stage, choice: number, requestId: string) =>
    call<{ ok: true; saved: { kind: string; choice: number } }>("/api/answer", {
      method: "POST", body: JSON.stringify({ party, questionId, stage, choice, requestId }) }),
  team: (party: PartyId, action: "away" | "resume" | "claim_captain", extra: Record<string, unknown> = {}) =>
    call<MeView>("/api/team", { method: "POST", body: JSON.stringify({ party, action, confirm: true, ...extra }) }),
};

export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
