import { headers } from "next/headers";
import { getDb } from "@/server/db";
import { storageKind } from "@/server/storage";
import { albumToken, isValidAlbumToken, ALBUM_LIMITS } from "@/server/album/config";
import { listPhotos } from "@/server/album/service";
import { guestTeam } from "@/server/album/guest";
import AlbumApp from "../AlbumApp";

export const dynamic = "force-dynamic";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="al-wrap al-notice-page">
      <p className="al-eyebrow">AFTERLIFE · Party album</p>
      <h1 className="al-h1">{title}</h1>
      <p className="al-lede">{body}</p>
    </main>
  );
}

export default async function AlbumPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ party?: string }> }) {
  const { token: raw } = await params;
  const sp = await searchParams;
  if (!albumToken()) return <Notice title="The album isn't open yet" body="The host hasn't switched on the photo album. Check back soon — and keep taking pictures!" />;
  let token = raw;
  try { token = decodeURIComponent(raw); } catch { /* keep */ }
  if (!isValidAlbumToken(token)) return <Notice title="This link isn't working" body="It may be incomplete or out of date. Please ask the host for the album link again." />;
  const party = sp.party === "demo" ? "demo" : "live";
  const db = await getDb();
  const [photos, team] = await Promise.all([listPhotos(db, party), guestTeam(db, party, (await headers()).get("cookie"))]);
  return (
    <AlbumApp
      token={token}
      party={party}
      initialPhotos={photos}
      defaultTakenBy={team?.teamName ?? ""}
      mode={storageKind() === "vercel-blob" ? "blob" : "local"}
      maxCaption={ALBUM_LIMITS.maxCaptionChars}
    />
  );
}
