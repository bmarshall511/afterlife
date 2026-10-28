import QRCode from "qrcode";
import { adminRoute } from "@/server/admin/route";
import { HttpError, parseParty } from "@/server/tributes/http";
import { publicBaseUrl } from "@/server/tributes/config";
import { albumPath } from "@/server/album/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Album link QR. ?party=&format=png|svg&download=1 */
export const GET = adminRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  const party = parseParty(sp.get("party"));
  const path = albumPath(party);
  if (!path) throw new HttpError(503, "not_configured", "ALBUM_INVITE_TOKEN is not configured.");
  const url = `${publicBaseUrl(req)}${path}`;
  const opts = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#000000", light: "#ffffff" } };
  const name = `afterlife-album${party === "demo" ? "-demo" : ""}`;
  const disp = `${sp.get("download") === "1" ? "attachment" : "inline"}; filename="${name}`;
  const h = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (sp.get("format") === "svg") {
    return new Response(await QRCode.toString(url, { ...opts, type: "svg" }), { headers: { ...h, "content-type": "image/svg+xml", "content-disposition": `${disp}.svg"` } });
  }
  const png = await QRCode.toBuffer(url, { ...opts, type: "png", width: 1024 });
  return new Response(new Uint8Array(png), { headers: { ...h, "content-type": "image/png", "content-disposition": `${disp}.png"` } });
});
