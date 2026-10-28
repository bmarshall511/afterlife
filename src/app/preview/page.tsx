import type { Metadata } from "next";
import "./preview.css";

export const metadata: Metadata = { title: "AFTERLIFE · demo preview", robots: { index: false } };

/**
 * Host testing aid (demo party only): the TV and a player's phone side by side in one desktop tab.
 * The phone frame is a real player (it joins the demo party). Other families come from the TV's
 * "Add 3 bot families" button, or from private windows / real phones.
 */
export default function PreviewPage() {
  return (
    <main className="pv">
      <header className="pv-head">
        <h1>Demo preview</h1>
        <p>
          Left: the TV. Right: a player’s phone — join a team in it, then use the <b>Demo</b> panel on the TV (sign in at{" "}
          <a href="/admin" target="_blank" rel="noreferrer">/admin</a> first) to add bot families and step through games.
        </p>
      </header>
      <div className="pv-stage">
        <div className="pv-tv">
          <div className="pv-tv-scale">
            <iframe src="/tv?party=demo" title="TV" width={1920} height={1080} />
          </div>
        </div>
        <div className="pv-phone">
          <iframe src="/join?party=demo" title="Player phone" width={390} height={844} />
        </div>
      </div>
      <p className="pv-foot">
        Only one player fits per browser (phones share this browser’s sign-in). For a second real player, open{" "}
        <code>/join?party=demo</code> in a private window or on your phone.
      </p>
    </main>
  );
}
