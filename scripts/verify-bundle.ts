/**
 * Production client-bundle secret scan. Run after `next build`:
 *   npx tsx scripts/verify-bundle.ts
 * Scans .next/static (everything shipped to browsers) for passwords, tokens and answer data.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { allContent } from "../src/content/index";

const ROOT = join(process.cwd(), ".next", "static");
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(ROOT);
const text = files.filter((f) => /\.(js|css|json|html|txt)$/.test(f)).map((f) => [f, readFileSync(f, "utf8")] as const);

const literal: Record<string, string> = {
  "admin password": process.env.ADMIN_PASSWORD ?? "afterlife-dev",
  "tribute invite token": process.env.TRIBUTE_INVITE_TOKEN ?? "e2e-invite-token-123456",
  "album invite token": process.env.ALBUM_INVITE_TOKEN ?? "e2e-album-token-123456",
  "dev album token": "dev-album-2026",
};
const names = ["ADMIN_PASSWORD", "TRIBUTE_INVITE_TOKEN", "ALBUM_INVITE_TOKEN", "DATABASE_URL", "BLOB_READ_WRITE_TOKEN", "session_hash", "postgres://"];

const problems: string[] = [];
for (const [label, v] of Object.entries(literal)) for (const [f, t] of text) if (t.includes(v)) problems.push(`${label} "${v}" in ${f}`);
// env var NAMES are only warnings (admin help text, @vercel/blob client lib); their VALUES are failures above
const warnings: string[] = [];
for (const n of names) for (const [f, t] of text) if (t.includes(n)) warnings.push(`identifier ${n} in ${f.split("/").pop()}`);

// answer data: explanations, answers serialised, calavera house lines, case solutions
let checked = 0;
for (const it of allContent()) {
  const probes: string[] = [];
  if (it.explanation && it.explanation.length > 25) probes.push(it.explanation.slice(0, 60));
  const d = it.data as any;
  for (const h of d?.house ?? []) if (typeof h === "string" && h.length > 20) probes.push(h.slice(0, 50));
  if (d?.why && typeof d.why === "string" && d.why.length > 20) probes.push(d.why.slice(0, 50));
  for (const p of probes) { checked++; for (const [f, t] of text) if (t.includes(p)) problems.push(`answer data of ${it.family}/${it.id} ("${p.slice(0, 30)}…") in ${f}`); }
}
for (const w of new Set(warnings)) console.log("warn: " + w);
console.log(`scanned ${text.length} files under .next/static, ${checked} answer-data probes`);
if (problems.length) { console.log("FAIL\n" + [...new Set(problems)].slice(0, 50).join("\n")); process.exit(1); }
console.log("PASS: no secrets or answer data in the client bundle");
