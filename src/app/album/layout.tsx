import type { Metadata, Viewport } from "next";
import "./album.css";

export const metadata: Metadata = {
  title: "Party album",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const viewport: Viewport = { themeColor: "#000000", viewportFit: "cover" };

export default function AlbumLayout({ children }: { children: React.ReactNode }) {
  return <div className="al-root">{children}</div>;
}
