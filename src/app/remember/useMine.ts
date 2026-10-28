"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSaved } from "./store";

export interface MyTribute {
  id: string;
  personName: string;
  remembrance: string;
  attribution: string;
  status: "published" | "hidden";
  thumbUrl: string;
  photoUrl: string;
  createdAt: string;
  canEdit: boolean;
  via: "team" | "token";
}

export async function fetchMine(party: string, items: { id: string; token: string }[]) {
  const r = await fetch("/api/tributes/mine", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ party, items }),
    cache: "no-store",
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Couldn't load your tributes.");
  return d as { tributes: MyTribute[]; unknown: string[]; hasSession: boolean };
}

/** Tributes this family (guest session) or this device (saved edit links) can manage. null = loading. */
export function useMine(party: "live" | "demo") {
  const [list, setList] = useState<MyTribute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const d = await fetchMine(party, loadSaved().map(({ id, token }) => ({ id, token })));
      setList(d.tributes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your tributes.");
      setList((l) => l ?? []);
    }
  }, [party]);
  useEffect(() => { reload(); }, [reload]);
  return { list, setList, error, reload };
}
