import type { Metadata } from "next";
import { JoinForm } from "./JoinForm";

export const metadata: Metadata = { title: "AFTERLIFE · Join" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const party = sp.party === "demo" ? "demo" : "live";
  const code = typeof sp.code === "string" ? sp.code.slice(0, 32) : "";
  return <JoinForm party={party} initialCode={code} />;
}
