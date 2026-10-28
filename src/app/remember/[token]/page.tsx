import { isValidInvite } from "@/server/tributes/config";
import RememberForm from "./RememberForm";

export const dynamic = "force-dynamic";

export default async function RememberPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ party?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!isValidInvite(decodeURIComponent(token))) {
    return (
      <main className="rm-wrap">
        <p className="rm-eyebrow">Digital ofrenda</p>
        <h1 className="rm-h1">This link isn&apos;t working</h1>
        <p className="rm-lede">It may be incomplete or out of date. Please ask the host to send the upload link again.</p>
      </main>
    );
  }
  return (
    <main className="rm-wrap">
      <RememberForm token={decodeURIComponent(token)} party={sp.party === "demo" ? "demo" : "live"} />
    </main>
  );
}
