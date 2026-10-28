import QRCode from "qrcode";
import { adminRoute } from "@/server/admin/route";
import { HttpError, parseParty } from "@/server/tributes/http";
import { inviteToken, publicBaseUrl } from "@/server/tributes/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** QR download for public URLs built from PUBLIC_BASE_URL. ?target=join|tv|remember&format=png|svg&party= */
export const GET = adminRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  const party = parseParty(sp.get("party"));
  const target = sp.get("target") ?? "join";
  const base = publicBaseUrl(req);
  const q = party === "demo" ? "?party=demo" : "";
  let url: string;
  if (target === "join") url = `${base}/join${q}`;
  else if (target === "tv") url = `${base}/tv${q}`;
  else if (target === "remember") {
    const t = inviteToken();
    if (!t) throw new HttpError(503, "not_configured", "TRIBUTE_INVITE_TOKEN is not configured.");
    url = `${base}/remember/${encodeURIComponent(t)}${q}`;
  } else throw new HttpError(400, "invalid", "Unknown QR target.");
  const opts = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#000000", light: "#ffffff" } };
  const filename = `afterlife-${target}${party === "demo" ? "-demo" : ""}`;
  const download = sp.get("download") === "1" ? `attachment; filename="${filename}` : `inline; filename="${filename}`;
  if (sp.get("format") === "svg") {
    const svg = await QRCode.toString(url, { ...opts, type: "svg" });
    return new Response(svg, { headers: { "content-type": "image/svg+xml", "content-disposition": `${download}.svg"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  const png = await QRCode.toBuffer(url, { ...opts, type: "png", width: 1024 });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "content-disposition": `${download}.png"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
});
