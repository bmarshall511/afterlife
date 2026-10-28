import type { Metadata } from "next";
import { PlayScreen } from "./PlayScreen";

export const metadata: Metadata = { title: "AFTERLIFE · Play" };

export default async function PlayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const party = sp.party === "demo" ? "demo" : "live";
  const mock = process.env.NODE_ENV !== "production" && typeof sp.mock === "string" ? sp.mock : null;
  return <PlayScreen party={party} mock={mock} />;
}
