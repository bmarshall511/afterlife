import Link from "next/link";
import { Backdrop } from "@/components/Backdrop";
import { Wordmark } from "@/components/Brand";
import { Icon } from "@/components/Icon";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const qs = (await searchParams).party === "demo" ? "?party=demo" : "";
  return (
    <main className="landing">
      <Backdrop state="amber" drift variant="phone" dim="light" />
      <div className="landing-body">
        <Wordmark size="md" />
        <h1 className="landing-h">Play together.<br />Remember together.</h1>
        <p className="landing-p">A party game for families, between quiet moments for the people we miss.</p>
        <div className="landing-actions">
          <Link className="btn btn-primary" href={`/join${qs}`}>Play <Icon name="arrow" /></Link>
          <details className="remember">
            <summary><Icon name="heart" /> Remember someone</summary>
            <p>Your host shares a private upload link before the party. Open it to add a photo and a few words — it will appear on the TV between rounds. No game account needed.</p>
          </details>
          <Link className="landing-install" href={`/install${qs}`}>Install app</Link>
        </div>
      </div>
    </main>
  );
}
