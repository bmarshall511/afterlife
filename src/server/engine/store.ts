import type { Q } from "@/server/db";
import type { EngineState, PartyRow, PhaseState } from "./types";
import { EngineError } from "./types";

export const PARTIES = ["live", "demo"] as const;
export function partyIdOf(v: unknown): "live" | "demo" {
  if (v == null || v === "") return "live";
  if (v === "live" || v === "demo") return v;
  throw new EngineError("invalid", "unknown party", 400);
}

export async function loadParty(q: Q, id: string, lock: boolean): Promise<PartyRow> {
  const rows = await q.query(
    `SELECT id, status, mode, settings, phase, version, set_seq, rng_seed, engine FROM party WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  if (!rows[0]) throw new EngineError("invalid", "unknown party", 404);
  const r = rows[0];
  return {
    ...r,
    phase: (r.phase ?? { kind: "ambient" }) as PhaseState,
    engine: (r.engine ?? {}) as EngineState,
    settings: r.settings ?? {},
  } as PartyRow;
}

/** Persist mutable party fields and bump version. */
export async function saveParty(q: Q, p: PartyRow) {
  p.version += 1;
  await q.query(
    `UPDATE party SET status=$2, mode=$3, settings=$4, phase=$5, version=$6, set_seq=$7, engine=$8, updated_at=now() WHERE id=$1`,
    [p.id, p.status, p.mode, JSON.stringify(p.settings), JSON.stringify(p.phase), p.version, p.set_seq, JSON.stringify(p.engine)],
  );
}

export async function audit(q: Q, partyId: string | null, actor: string, action: string, detail: unknown = {}) {
  await q.query(`INSERT INTO audit (party_id, actor, action, detail) VALUES ($1,$2,$3,$4)`, [partyId, actor, action, JSON.stringify(detail)]);
}

export const asIds = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : typeof v === "string" ? JSON.parse(v) : []);
