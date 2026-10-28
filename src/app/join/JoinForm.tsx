"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MeView, PartyId } from "@/shared/types";
import { api, ApiFailure } from "@/client/api";
import { Backdrop } from "@/components/Backdrop";
import { Wordmark } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { Rejoin } from "./Rejoin";

export function JoinForm({ party, initialCode }: { party: PartyId; initialCode: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [showCode, setShowCode] = useState(!!initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<MeView | null>(null);
  const [rejoin, setRejoin] = useState(false);
  const qs = party === "demo" ? "?party=demo" : "";

  useEffect(() => { api.me(party).then(setExisting).catch(() => {}); }, [party]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Add a name so your family knows it’s you."); return; }
    setBusy(true); setError(null);
    try {
      await api.join(party, name.trim(), showCode ? code.trim() : undefined);
      router.push(`/play${qs}`);
    } catch (err) {
      const f = err as ApiFailure;
      setError(f.status === 0 ? "No connection. Check Wi‑Fi and try again." : f.code === "rate_limited" ? "Too many tries — wait a moment." :
        f.code.includes("invite") || f.code === "not_found" ? "That team code didn’t work. Check it with your family." : f.message || "Couldn’t join. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="phone">
      <Backdrop state="amber" variant="phone" dim="heavy" />
      <div className="ph-body ph-form-wrap">
        <Wordmark size="sm" />
        <h1 className="ph-h1">{showCode && code ? "Join your family" : "Join the game"}</h1>
        <p className="ph-p">One team per family. We’ll give you a name and color.</p>
        {existing && (
          <button className="btn btn-secondary" onClick={() => router.push(`/play${qs}`)}>
            Continue as {existing.member.name} · {existing.team.name} <Icon name="arrow" />
          </button>
        )}
        <form className="ph-form" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" autoCapitalize="words" enterKeyHint="go" placeholder="e.g. Lucía" />
          </label>
          {showCode && (
            <label className="field">
              <span>Team code</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={32} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="From your family’s invite" />
            </label>
          )}
          {error && <p className="form-error" role="alert"><Icon name="alert" /> {error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Joining…" : "Join"} {!busy && <Icon name="arrow" />}</button>
        </form>
        {!existing && (
          <button className="btn btn-ghost rj-open" onClick={() => setRejoin(true)}>
            <Icon name="people" /> Already playing? Get back in
          </button>
        )}
        {!showCode
          ? <button className="link-btn small" onClick={() => setShowCode(true)}>Have a team code?</button>
          : <button className="link-btn small" onClick={() => { setShowCode(false); setCode(""); }}>Start a new team instead</button>}
        <Rejoin party={party} open={rejoin} onClose={() => setRejoin(false)} onJoined={() => router.push(`/play${qs}`)} />
        <p className="ph-fine">No account, no app. Your phone remembers your team.</p>
      </div>
    </main>
  );
}
