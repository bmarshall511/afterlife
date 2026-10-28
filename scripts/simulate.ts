/**
 * Accelerated party simulation with an injected fake clock.
 *   PGLITE_MEMORY=1 npx tsx scripts/simulate.ts [hours=4] [teams=20] [--fixture]
 * Uses src/content when available (else the engine fixture pool). Reports sets played, family mix,
 * content exhaustion behaviour and checks invariants. Exit code 1 on any invariant violation.
 */
process.env.PGLITE_MEMORY ??= "1";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const hours = Number(args[0] ?? 4);
  const nTeams = Number(args[1] ?? 20);
  const { getDb } = await import("../src/server/db");
  const { setEngineDeps } = await import("../src/server/engine/deps");
  const { fixtureContent } = await import("../src/server/engine/fixtures");
  const C = await import("../src/server/engine/control");
  const { join, submitAnswer, tick, computeStandings } = await import("../src/server/engine");
  const { loadParty } = await import("../src/server/engine/store");
  const d = await getDb();
  let contentLabel = "src/content";
  const { content } = await import("../src/server/engine/deps");
  const { buildSnapshot } = await import("../src/server/engine");
  if (process.argv.includes("--fixture")) {
    setEngineDeps({ content: fixtureContent(12) });
    contentLabel = "fixture(12/family)";
  } else {
    const m: any = await import("../src/content/index").catch(() => ({}));
    if (typeof m.caseSet !== "function") {
      setEngineDeps({ content: fixtureContent(12) });
      contentLabel = "fixture (src/content has no v2 API yet)";
    }
  }
  await content();
  setEngineDeps({ tributes: { nextTribute: async () => null, isTributeVisible: async () => false } });
  const P = "demo";
  const T0 = Date.UTC(2026, 10, 1, 18);
  await C.resetParty(P, "sim", {}, T0);

  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const teams: { memberId: string; teamId: string; away: boolean; joinAt: number; skill: number; joined: boolean }[] = [];
  for (let i = 0; i < nTeams; i++) teams.push({ memberId: "", teamId: "", away: false, joinAt: T0 + (i < 12 ? 0 : Math.floor(rand() * 3600_000)), skill: 0.4 + rand() * 0.5, joined: false });

  await C.startParty(P, "sim", T0);
  const end = T0 + hours * 3600_000;
  const errors: Record<string, number> = {};
  let answers = 0;
  let lastQ = "";
  let snap: any = null;
  let item: any = null;
  let doubledMarked = false;
  const started = Date.now();
  for (let t = T0; t < end; t += 1000) {
    for (const tm of teams) {
      if (!tm.joined && t >= tm.joinAt) {
        const r = await join(P, { name: `Sim${teams.indexOf(tm)}` }, t);
        Object.assign(tm, { memberId: r.me.member.id, teamId: r.me.team.id, joined: true });
      }
    }
    // presence: non-away members poll
    const present = teams.filter((x) => x.joined && !x.away).map((x) => x.memberId);
    if (t % 5000 === 0 && present.length) await d.query("UPDATE member SET last_seen=$1 WHERE id = ANY($2::uuid[])", [new Date(t).toISOString(), present]);
    await tick(P, t);
    const p = await loadParty(d, P, false);
    const ph = p.phase;
    if (!doubledMarked && t >= T0 + (hours * 3600_000) / 2) {
      await C.markFinalRound(P, "sim", true, t);
      doubledMarked = true;
    }
    if (ph.kind === "question" && ph.stage && ph.stage !== "clue") {
      const key = ph.questionId + ph.stage;
      if (key !== lastQ) {
        lastQ = key;
        snap = await buildSnapshot(d, P, t);
        item = (await d.query("SELECT private FROM question WHERE id=$1", [ph.questionId]))[0].private.item;
      }
      const input: any = snap?.question?.input;
      for (const tm of teams) {
        if (!input || !tm.joined || tm.away || rand() > 0.12) continue;
        const good = rand() < tm.skill;
        let value: unknown;
        switch (input.kind) {
          case "choice": value = good && typeof item.answer === "number" ? item.answer : Math.floor(rand() * input.options.length); break;
          case "order": value = good ? item.answer : [...input.items.map((x: any) => x.id)].sort(() => rand() - 0.5); break;
          case "number": { const tr = Number(item.answer); value = Math.max(input.min, Math.min(input.max, Math.round((good ? tr * (0.75 + rand() * 0.3) : input.min + rand() * (input.max - input.min)) / input.step) * input.step)); break; }
          case "percent": value = Math.floor(rand() * 101); break;
          case "text": value = rand() < 0.03 ? "what the f.u.c.k" : `verse ${Math.floor(rand() * 1e6)}`; break;
          case "vote": value = input.entries[Math.floor(rand() * input.entries.length)]?.id; break;
          case "assign": {
            if (good && rand() < 0.5) value = item.answer;
            else { const sl = [...input.slots.map((x: any) => x.id)].sort(() => rand() - 0.5); value = Object.fromEntries(input.people.map((pp: any, k: number) => [pp.id, sl[k]])); }
            break;
          }
        }
        try {
          await submitAnswer(P, tm.memberId, { questionId: ph.questionId, stage: ph.stage, value, requestId: `${tm.memberId}:${key}` }, t);
          answers++;
        } catch (e: any) {
          errors[e.code ?? "error"] = (errors[e.code ?? "error"] ?? 0) + 1;
        }
      }
    }
    // occasional away/resume at set boundaries
    if (ph.kind === "interval" && t % 60000 === 0) {
      const tm = teams[Math.floor(rand() * teams.length)];
      if (tm.joined) {
        tm.away = !tm.away;
        await d.query("UPDATE team SET status=$2 WHERE id=$1", [tm.teamId, tm.away ? "away" : "active"]);
      }
    }
  }
  // a short outage then catch-up
  await tick(P, end + 600_000);

  const sets = await d.query("SELECT id, seq, family, status, invalid_reason, eligible, doubled FROM game_set WHERE party_id=$1 ORDER BY seq", [P]);
  const fam: Record<string, number> = {};
  for (const s of sets) fam[s.family] = (fam[s.family] ?? 0) + 1;
  const violations: string[] = [];
  for (let i = 1; i < sets.length; i++) if (sets[i].family === sets[i - 1].family) violations.push(`same family twice at seq ${sets[i].seq}`);
  const social = (f: string) => f === "calavera" || f === "room";
  for (let i = 1; i < sets.length; i++) if (social(sets[i].family) && social(sets[i - 1].family)) violations.push(`social sets back-to-back at seq ${sets[i].seq}`);
  for (const s of sets) if (social(s.family) && s.status === "complete" && (s.eligible as string[]).length < 3) violations.push(`social set ${s.seq} with <3 eligible`);
  const doubledSets = sets.filter((s) => s.doubled).map((s) => s.seq);
  if (doubledSets.length !== 1) violations.push(`expected exactly one doubled set, got ${doubledSets}`);
  const overQ = await d.query(
    `SELECT COUNT(*)::int n FROM score_ledger l JOIN game_set g ON g.id=l.set_id JOIN question q ON q.id=l.question_id
      WHERE l.kind='question' AND (l.points < 0 OR l.points > (CASE WHEN g.family='case' THEN 300 ELSE 100 END) * (CASE WHEN g.doubled THEN 2 ELSE 1 END))`,
  );
  if (overQ[0].n) violations.push(`${overQ[0].n} ledger rows out of range`);
  const multiLock = await d.query(
    `SELECT COUNT(*)::int n FROM (SELECT a.team_id, q.set_id FROM answer a JOIN question q ON q.id=a.question_id JOIN game_set g ON g.id=q.set_id
      WHERE g.family='case' AND a.kind='answer' GROUP BY 1,2 HAVING COUNT(*) > 1) x`,
  );
  if (multiLock[0].n) violations.push(`${multiLock[0].n} case double-locks`);
  const clueAns = await d.query(`SELECT COUNT(*)::int n FROM answer WHERE kind='clue'`);
  if (clueAns[0].n) violations.push("answers in case clue stage");
  const voided = await d.query(`SELECT void_reason, COUNT(*)::int n FROM question WHERE party_id=$1 AND status='void' GROUP BY 1`, [P]);
  const dup = await d.query("SELECT question_id, team_id, COUNT(*) n FROM score_ledger WHERE kind='question' GROUP BY 1,2 HAVING COUNT(*) > 1");
  if (dup.length) violations.push(`${dup.length} duplicate ledger rows`);
  const badScore = await d.query("SELECT COUNT(*)::int n FROM set_score s JOIN game_set g ON g.id=s.set_id WHERE s.score < 0 OR s.score > (CASE WHEN g.doubled THEN 600 ELSE 300 END)");
  if (badScore[0].n) violations.push(`${badScore[0].n} set scores out of range`);
  const incomplete = await d.query(
    "SELECT g.seq FROM game_set g WHERE g.status='complete' AND (SELECT COUNT(*) FROM question q WHERE q.set_id=g.id AND q.status IN ('revealed','void')) <> 3",
  );
  if (incomplete.length) violations.push(`complete sets with unrevealed questions: ${incomplete.map((r) => r.seq)}`);
  const repeats = await d.query("SELECT content_id, COUNT(*) n FROM question WHERE party_id=$1 GROUP BY 1 HAVING COUNT(*) > 1", [P]);
  const firstRepeat = (await d.query(
    "SELECT MIN(g.seq) s FROM question q JOIN game_set g ON g.id=q.set_id WHERE q.content_id IN (SELECT content_id FROM question GROUP BY 1 HAVING COUNT(*)>1)",
  ))[0].s;
  const generated = (await d.query("SELECT COUNT(*)::int n FROM question WHERE content_id LIKE '%gen%' OR content_id LIKE '%fresh%'"))[0].n;
  const encores = (await d.query("SELECT COUNT(*)::int n FROM audit WHERE party_id=$1 AND action='encore'", [P]))[0].n;
  const standings = await computeStandings(d, P);
  if (standings.some((s) => s.total > 1800 || s.setsCounted > 5)) violations.push("standings over max");
  const lateEarly = await d.query(
    "SELECT COUNT(*)::int n FROM answer a JOIN question q ON q.id=a.question_id JOIN team t ON t.id=a.team_id WHERE t.created_at > q.opened_at",
  );
  if (lateEarly[0].n) violations.push(`${lateEarly[0].n} answers from late joiners`);
  const final = await loadParty(d, P, false);

  console.log(JSON.stringify({
    content: contentLabel,
    simulatedHours: hours,
    teams: nTeams,
    wallSeconds: Math.round((Date.now() - started) / 1000),
    setsTotal: sets.length,
    setsComplete: sets.filter((s) => s.status === "complete").length,
    invalidated: sets.filter((s) => s.status === "invalidated").map((s) => `${s.seq}:${s.invalid_reason}`),
    families: fam,
    doubledSets,
    voidQuestions: Object.fromEntries(voided.map((r) => [r.void_reason, r.n])),
    answersAccepted: answers,
    rejectedByCode: errors,
    contentRepeats: repeats.length,
    firstRepeatAtSet: firstRepeat ?? null,
    generatedInstances: generated,
    encoreAnnouncements: encores,
    afterOutagePhase: final.phase.kind,
    qualifiedTeams: standings.filter((s) => s.qualified).length,
    top3: standings.slice(0, 3).map((s) => `${s.rank ?? "-"} ${s.name} ${s.total}`),
    violations,
  }, null, 2));
  process.exit(violations.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
