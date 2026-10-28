/** Validate all content: `npx tsx scripts/validate-content.ts`. Exits 1 on any problem. */
import { allContent, generateFresh, validateAll } from "../src/content/index";
import type { GameFamily } from "../src/shared/types";

try {
  const items = allContent();
  const by: Record<string, number> = {};
  for (const it of items) by[it.family] = (by[it.family] ?? 0) + 1;
  const fresh = (["memory", "difference", "reveal", "altar"] as GameFamily[]).flatMap((f) =>
    Array.from({ length: 50 }, (_, i) => generateFresh(f, `check-${i}`)!));
  const errs = validateAll(fresh);
  if (errs.length) throw new Error(errs.join("\n"));
  console.log(`OK: ${items.length} items`, by, `+ ${fresh.length} fresh generator samples valid`);
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}
