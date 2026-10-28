"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MeView, PartyId } from "@/shared/types";
import { api, ApiFailure } from "./api";

export interface MeState { me: MeView | null; status: "loading" | "ready" | "anonymous" | "error"; refresh: () => void; setMe: (m: MeView) => void }

/** GET /api/me; refreshes whenever `version` (snapshot version) changes. */
export function useMe(party: PartyId, version: number | undefined, mock?: string | null): MeState {
  const [me, setMeState] = useState<MeView | null>(null);
  const [status, setStatus] = useState<MeState["status"]>("loading");
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (mock && process.env.NODE_ENV !== "production") {
      const m = await import("./mocks"); setMeState(m.mockMe(mock)); setStatus("ready"); return;
    }
    if (inflight.current) return;
    inflight.current = true;
    try { setMeState(await api.me(party)); setStatus("ready"); }
    catch (e) {
      if (e instanceof ApiFailure && e.status === 401) setStatus("anonymous");
      else setStatus((s) => (s === "ready" ? s : "error"));
    } finally { inflight.current = false; }
  }, [party, mock]);

  useEffect(() => { refresh(); }, [refresh, version]);
  return { me, status, refresh, setMe: (m) => { setMeState(m); setStatus("ready"); } };
}
