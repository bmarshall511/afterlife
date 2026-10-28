/** Validate all content: `npx tsx scripts/validate-content.ts`. Exits 1 on any problem. */
import { allContent, caseSet, generateFresh, publicQuestion, validateAll } from "../src/content/index";

try {
  const items = allContent();
  const by: Record<string, number> = {};
  for (const it of items) by[it.family] = (by[it.family] ?? 0) + 1;
  const fresh = Array.from({ length: 60 }, (_, i) => caseSet(`check-${i}`)).flat();
  const errs = validateAll(fresh, publicQuestion);
  if (!generateFresh("case", 1) || generateFresh("line", 1) !== null) errs.push("generateFresh contract");
  if (errs.length) throw new Error(errs.join("\n"));
  const sources = new Set(items.filter((i) => i.source).map((i) => i.source!.url));
  console.log(`OK: ${items.length} items`, by, `| case puzzles: ${by.case / 3} | sources: ${sources.size} | +${fresh.length / 3} fresh case puzzles valid`);
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}
