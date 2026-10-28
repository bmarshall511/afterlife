import { adminRoute, body } from "@/server/admin/route";
import { callControl } from "@/server/admin/engine";
import { HttpError, json, parseParty } from "@/server/tributes/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/answers?party=&setId= → calavera entries (with authors + hidden flag) of the current/given set. */
export const GET = adminRoute(async (req) => {
  const url = new URL(req.url);
  const party = parseParty(url.searchParams.get("party"));
  const setId = url.searchParams.get("setId");
  if (setId && !/^[0-9a-f-]{36}$/i.test(setId)) throw new HttpError(400, "invalid", "Bad set id.");
  return json(await callControl("listEntries", party, setId || null));
});

/** POST /api/admin/answers {party, action:"hide", answerId, hidden?:boolean=true} → hide/unhide a calavera entry. */
export const POST = adminRoute(async (req, { admin }) => {
  const b = await body(req);
  const party = parseParty(b.party);
  if (b.action !== "hide") throw new HttpError(400, "invalid", "Unknown action.");
  const answerId = String(b.answerId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(answerId)) throw new HttpError(400, "invalid", "Missing entry.");
  const result = await callControl("hideEntry", party, answerId, b.hidden !== false, admin.actor);
  return json({ ok: true, result });
});
