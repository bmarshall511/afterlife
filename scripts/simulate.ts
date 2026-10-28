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
  if (process.argv.includes("--fixture")) {
    setEngineDeps({ content: fixtureContent(10, { fresh: true }) });
    contentLabel = "fixture(10/family, fresh)";
  } else {
    try {
      // @ts-ignore -- optional at time of writing
      await import("../src/content/index");
    } catch {
      setEngineDeps({ content: fixtureContent(10, { fresh: true }) });
      contentLabel = "fixture (src/content missing)";
    }
  }
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
    if (ph.kind === "question" && ph.stage && ph.stage !== "expose") {
      const key = ph.questionId + ph.stage;
      if (key !== lastQ) lastQ = key;
      const qrow = (await d.query("SELECT private, public FROM question WHERE id=$1", [ph.questionId]))[0];
      const n = qrow.public.options.length;
      for (const tm of teams) {
        if (!tm.joined || tm.away || rand() > 0.12) continue;
        const correct = qrow.private.answer;
        const choice = correct != null && rand() < tm.skill ? correct : Math.floor(rand() * n);
        try {
          await submitAnswer(P, tm.memberId, { questionId: ph.questionId, stage: ph.stage, choice, requestId: `${tm.memberId}:${key}` }, t);
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

  const sets = await d.query("SELECT seq, family, status, invalid_reason, eligible FROM game_set WHERE party_id=$1 ORDER BY seq", [P]);
  const fam: Record<string, number> = {};
  for (const s of sets) fam[s.family] = (fam[s.family] ?? 0) + 1;
  const violations: string[] = [];
  for (let i = 1; i < sets.length; i++) if (sets[i].family === sets[i - 1].family) violations.push(`same family twice at seq ${sets[i].seq}`);
  for (const s of sets) if (s.family === "family" && s.status === "complete" && (s.eligible as string[]).length < 3) violations.push(`family set ${s.seq} with <3 eligible`);
  const dup = await d.query("SELECT question_id, team_id, COUNT(*) n FROM score_ledger WHERE kind='question' GROUP BY 1,2 HAVING COUNT(*) > 1");
  if (dup.length) violations.push(`${dup.length} duplicate ledger rows`);
  const badScore = await d.query("SELECT COUNT(*)::int n FROM set_score WHERE score < 0 OR score > 300 OR score % 50 <> 0 AND NOT normalized");
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
  if (standings.some((s) => s.total > 1500 || s.setsCounted > 5)) violations.push("standings over max");
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
