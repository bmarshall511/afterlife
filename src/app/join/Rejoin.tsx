"use client";
import { useEffect, useState } from "react";
import type { PartyId } from "@/shared/types";
import { api, ApiFailure, type RejoinTeam } from "@/client/api";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";

/**
 * "Already playing? Get back in" — for a new phone, a closed browser, or an installed app on iPhone that starts fresh.
 * Pick your team, then your name. If you were the captain, this phone takes over submitting.
 */
export function Rejoin({ party, open, onClose, onJoined }: { party: PartyId; open: boolean; onClose: () => void; onJoined: () => void }) {
  const [teams, setTeams] = useState<RejoinTeam[] | null>(null);
  const [team, setTeam] = useState<RejoinTeam | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTeam(null); setError(null); setTeams(null);
    api.teams(party).then((r) => setTeams(r.teams)).catch(() => setError("Couldn’t load the teams. Check Wi‑Fi and try again."));
  }, [open, party]);

  async function go(opts: { asMemberId?: string; name?: string }) {
    if (!team) return;
    setBusy(true); setError(null);
    try {
      await api.rejoin(party, team.id, opts);
      onJoined();
    } catch (e) {
      const f = e as ApiFailure;
      setError(f.status === 0 ? "No connection. Check Wi‑Fi and try again." : f.message || "Couldn’t get you back in. Try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={team ? team.name : "Get back in"} size="full">
      {!team ? (
        <>
          <p className="ph-p">Pick your family’s team. You’ll keep all your points.</p>
          {!teams && !error && <div className="ph-spinner" aria-label="Loading teams" />}
          {teams && teams.length === 0 && <p className="ph-p">No teams have joined yet — start a new one instead.</p>}
          <ul className="rj-list">
            {teams?.map((t) => (
              <li key={t.id}>
                <button className="rj-row" onClick={() => setTeam(t)}>
                  <Avatar id={t.avatar} color={t.color} name={t.name} className="rj-av" />
                  <span className="rj-name">{t.name}</span>
                  <span className="rj-meta">{t.people.length} {t.people.length === 1 ? "person" : "people"}</span>
                  <Icon name="arrow" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="ph-p">Which one is you?</p>
          <ul className="rj-list">
            {team.people.map((p) => (
              <li key={p.memberId}>
                <button className="rj-row" disabled={busy} onClick={() => go({ asMemberId: p.memberId })}>
                  <span className="rj-name">{p.name}</span>
                  {p.captain && <span className="rj-cap"><Icon name="crown" /> Captain</span>}
                  <Icon name="arrow" />
                </button>
              </li>
            ))}
          </ul>
          <form className="ph-form rj-new" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) go({ name: newName.trim() }); }}>
            <label className="field">
              <span>Someone new on this team?</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} autoCapitalize="words" placeholder="Your name" />
            </label>
            <button className="btn btn-secondary" type="submit" disabled={busy || !newName.trim()}>Join {team.name}</button>
          </form>
          <p className="ph-fine">If you pick the captain, this phone becomes the one that locks in answers.</p>
          <button className="link-btn small" onClick={() => setTeam(null)}>← All teams</button>
        </>
      )}
      {error && <p className="form-error" role="alert"><Icon name="alert" /> {error}</p>}
    </Sheet>
  );
}
