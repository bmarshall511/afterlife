import type { Metadata, Viewport } from "next";
import { TvScreen } from "./TvScreen";

export const metadata: Metadata = { title: "AFTERLIFE · TV" };
export const viewport: Viewport = { themeColor: "#000000" };

export default async function TvPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const party = sp.party === "demo" ? "demo" : "live";
  const mock = process.env.NODE_ENV !== "production" && typeof sp.mock === "string" ? sp.mock : null;
  return <TvScreen party={party} mock={mock} />;
}
