import { adminRoute } from "@/server/admin/route";
import { json, parseParty } from "@/server/tributes/http";
import { publicBaseUrl } from "@/server/tributes/config";
import { albumPath } from "@/server/album/config";
import { counts, listPhotos } from "@/server/album/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?party -> {photos (published+hidden), counts, url} */
export const GET = adminRoute(async (req, { db }) => {
  const party = parseParty(new URL(req.url).searchParams.get("party"));
  const path = albumPath(party);
  return json({
    photos: await listPhotos(db, party, { includeHidden: true }),
    counts: await counts(db, party),
    url: path ? `${publicBaseUrl(req)}${path}` : null,
  });
});
