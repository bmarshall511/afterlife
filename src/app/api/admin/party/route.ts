import { adminRoute, body } from "@/server/admin/route";
import { callControl } from "@/server/admin/engine";
import { HttpError, json, parseParty } from "@/server/tributes/http";
import { inviteToken, publicBaseUrl } from "@/server/tributes/config";
import { deleteObject } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRoute(async (req, { db }) => {
  const party = parseParty(new URL(req.url).searchParams.get("party"));
  const rows = await db.query("SELECT id, status, mode, settings, phase, version, set_seq, paused_at, updated_at FROM party WHERE id = $1", [party]);
  const base = publicBaseUrl(req);
  const tok = inviteToken();
  const q = party === "demo" ? "?party=demo" : "";
  return json({
    party: rows[0] ?? null,
    urls: {
      join: `${base}/join${q}`,
      tv: `${base}/tv${q}`,
      remember: tok ? `${base}/remember/${encodeURIComponent(tok)}${q}` : null,
    },
    publicBaseUrlConfigured: !!process.env.PUBLIC_BASE_URL,
  });
});

const ACTIONS = ["start", "pause", "resume", "skip", "invalidate", "extend", "mode", "settings", "end", "reset", "final_round"] as const;

export const POST = adminRoute(async (req, { db, admin }) => {
  const b = await body(req);
  const party = parseParty(b.party);
  const actor = admin.actor;
  const action = String(b.action ?? "");
  if (!(ACTIONS as readonly string[]).includes(action)) throw new HttpError(400, "invalid", "Unknown action.");
  let result: unknown;
  switch (action) {
    case "start": result = await callControl("startParty", party, actor); break;
    case "pause": result = await callControl("pauseParty", party, actor); break;
    case "resume": result = await callControl("resumeParty", party, actor); break;
    case "skip": result = await callControl("skipQuestion", party, actor); break;
    case "invalidate": {
      if (b.confirm !== true) throw new HttpError(400, "confirm_required", "Please confirm invalidating the current set.");
      let setId = typeof b.setId === "string" ? b.setId : null;
      if (!setId) {
        const r = await db.query("SELECT phase->>'setId' AS sid FROM party WHERE id = $1", [party]);
        setId = r[0]?.sid ?? null;
      }
      if (!setId) throw new HttpError(409, "no_set", "There is no set running right now.");
      result = await callControl("invalidateSet", party, setId, String(b.reason || "host"), actor);
      break;
    }
    case "extend": {
      const ms = Math.round(Number(b.ms));
      if (!Number.isFinite(ms) || ms <= 0 || ms > 60 * 60 * 1000) throw new HttpError(400, "invalid", "Extend by 1 second to 60 minutes.");
      result = await callControl("extendInterval", party, ms, actor);
      break;
    }
    case "mode": {
      if (b.mode !== "normal" && b.mode !== "tribute_only") throw new HttpError(400, "invalid", "Mode must be normal or tribute_only.");
      result = await callControl("setMode", party, b.mode, actor);
      break;
    }
    case "settings": {
      const patch = b.patch && typeof b.patch === "object" ? b.patch : null;
      if (!patch) throw new HttpError(400, "invalid", "Missing settings patch.");
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (!/^[a-zA-Z]{2,40}$/.test(k)) continue;
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) clean[k] = v;
        else if (Array.isArray(v) && v.every((x) => typeof x === "string")) clean[k] = v;
        else if (typeof v === "string" && v.length < 100) clean[k] = v;
      }
      result = await callControl("updateSettings", party, clean, actor);
      break;
    }
    case "final_round":
      // Marks the NEXT set "Last chance" (points ×2). {on:false} cancels a pending mark.
      result = await callControl("markFinalRound", party, actor, b.on !== false);
      break;
    case "end":
      if (b.confirm !== true) throw new HttpError(400, "confirm_required", "Please confirm ending the party.");
      result = await callControl("endParty", party, actor);
      break;
    case "reset": {
      if (b.confirm !== true) throw new HttpError(400, "confirm_required", "Please confirm the reset.");
      if (party !== "demo") throw new HttpError(403, "live_reset_forbidden", "Only demo data can be reset from admin. Real tributes and scores are never reset here.");
      // Demo tributes: delete stored photos first (engine reset handles game tables).
      const ts = await db.query("SELECT id, photo_key, thumb_key, original_key FROM tribute WHERE party_id = 'demo'");
      for (const t of ts) await Promise.all([deleteObject(t.photo_key), deleteObject(t.thumb_key), deleteObject(t.original_key)].map((p) => p.catch(() => {})));
      await db.query("DELETE FROM tribute WHERE party_id = 'demo'");
      // Demo album photos too (live photos are never touched here).
      const ps = await db.query("SELECT full_key, display_key, thumb_key FROM album_photo WHERE party_id = 'demo'");
      for (const a of ps) await Promise.all([deleteObject(a.full_key), deleteObject(a.display_key), deleteObject(a.thumb_key)].map((p) => p.catch(() => {})));
      await db.query("DELETE FROM album_photo WHERE party_id = 'demo'");
      result = await callControl("resetParty", "demo", actor);
      break;
    }
  }
  return json({ ok: true, result: result ?? null });
});
