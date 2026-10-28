import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { getDb } from "@/server/db";
import { storageKind } from "@/server/storage";
import { HttpError, errorResponse, json } from "@/server/tributes/http";
import { ALBUM_CONTENT_TYPES, ALBUM_LIMITS, parseRawPathname } from "@/server/album/config";
import { requireAlbumToken, uploadRateLimit } from "@/server/album/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Presigned client-upload route for `uploadPresigned()` from @vercel/blob/client (private store, OIDC).
 * clientPayload = JSON {token, party}. Issues a PUT-only delegation scoped to the exact raw pathname.
 * No onUploadCompleted webhook: the browser calls /api/album/finalize after the upload resolves.
 */
export async function POST(req: Request) {
  try {
    if (storageKind() !== "vercel-blob") throw new HttpError(409, "local_mode", "Direct uploads are not configured; use /api/album/upload.");
    const body = (await req.json().catch(() => null)) as HandleUploadPresignedBody | null;
    if (!body || typeof body !== "object") throw new HttpError(400, "invalid", "Invalid request.");
    // We never register upload-completed callbacks (the browser calls /api/album/finalize), so only
    // presigned-URL requests are accepted here.
    if ((body as { type?: unknown }).type !== "blob.generate-presigned-url") throw new HttpError(400, "invalid", "Invalid request.");
    const db = await getDb();
    const result = await handleUploadPresigned({
      body,
      // The SDK requires a webhook key up front even though it is only used to verify upload-completed
      // callbacks, which are rejected above. A real key can be supplied via BLOB_WEBHOOK_PUBLIC_KEY.
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || "unused:no-upload-completed-callbacks",
      request: req,
      getSignedToken: async (pathname, clientPayload) => {
        let p: { token?: unknown; party?: unknown } = {};
        try { p = JSON.parse(clientPayload ?? "{}"); } catch { /* invalid */ }
        requireAlbumToken(p.token);
        const parsed = parseRawPathname(pathname);
        if (!parsed || parsed.party !== (p.party === "demo" ? "demo" : "live")) throw new HttpError(400, "invalid_upload", "Invalid upload name.");
        await uploadRateLimit(db, req, "token");
        const validUntil = Date.now() + 15 * 60 * 1000;
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: ALBUM_CONTENT_TYPES,
          maximumSizeInBytes: ALBUM_LIMITS.maxBytes,
          validUntil,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: ALBUM_CONTENT_TYPES,
            maximumSizeInBytes: ALBUM_LIMITS.maxBytes,
            validUntil,
            addRandomSuffix: false,
            allowOverwrite: false,
          },
        };
      },
    });
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
