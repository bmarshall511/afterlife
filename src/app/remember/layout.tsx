import type { Metadata } from "next";
import "./remember.css";

export const metadata: Metadata = {
  title: "Share a remembrance",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RememberLayout({ children }: { children: React.ReactNode }) {
  return <div className="rm-root">{children}</div>;
}
