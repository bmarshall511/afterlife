import { adminRoute, body } from "@/server/admin/route";
import { callControl, loadContent } from "@/server/admin/engine";
import { HttpError, json, parseParty } from "@/server/tributes/http";
import { audit } from "@/server/tributes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const FAMILIES = ["memory", "truth", "difference", "reveal", "altar", "family"];

function enabledFamilies(settings: any): string[] {
  return Array.isArray(settings?.families) ? settings.families.filter((f: unknown) => typeof f === "string") : FAMILIES;
}

export const GET = adminRoute(async (req, { db }) => {
  const party = parseParty(new URL(req.url).searchParams.get("party"));
  const items = await loadContent();
  const overrides = new Map((await db.query("SELECT content_id, enabled FROM content_override")).map((r) => [r.content_id, r.enabled]));
  const p = await db.query("SELECT settings FROM party WHERE id = $1", [party]);
  const disabledFamilies = FAMILIES.filter((f) => !enabledFamilies(p[0]?.settings).includes(f));
  return json({
    disabledFamilies,
    items: items.map((it) => ({
      id: it.id, family: it.family, difficulty: it.difficulty, prompt: it.prompt, promptEs: it.promptEs ?? null,
      options: it.options, answer: it.answer, explanation: it.explanation, source: it.source ?? null,
      enabled: overrides.has(it.id) ? overrides.get(it.id) : it.enabled !== false,
    })),
  });
});

export const POST = adminRoute(async (req, { db, admin }) => {
  const b = await body(req);
  if (typeof b.contentId === "string") {
    if (typeof b.enabled !== "boolean" || b.contentId.length > 200) throw new HttpError(400, "invalid", "Invalid content toggle.");
    await db.query(
      `INSERT INTO content_override (content_id, enabled, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (content_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      [b.contentId, b.enabled],
    );
    await audit(db, null, admin.actor, "content.toggle", { id: b.contentId, enabled: b.enabled });
    return json({ ok: true });
  }
  if (typeof b.family === "string" && FAMILIES.includes(b.family) && typeof b.enabled === "boolean") {
    const party = parseParty(b.party);
    const p = await db.query("SELECT settings FROM party WHERE id = $1", [party]);
    const cur = enabledFamilies(p[0]?.settings);
    const next = b.enabled ? Array.from(new Set([...cur, b.family])) : cur.filter((f) => f !== b.family);
    // Engine reads party.settings.families (enabled list).
    await callControl("updateSettings", party, { families: next }, admin.actor);
    return json({ ok: true, families: next, disabledFamilies: FAMILIES.filter((f) => !next.includes(f)) });
  }
  throw new HttpError(400, "invalid", "Nothing to update.");
});
