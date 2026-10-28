export {};
// Capacity check: 20 teams / 60 polling phone clients + 1 TV against /api/state for DURATION_S seconds.
// Usage: BASE_URL=http://localhost:3200 ADMIN_PASSWORD=... npx tsx scripts/verify-capacity.ts
const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const DURATION = Number(process.env.DURATION_S ?? 120) * 1000;
const PARTY = "demo";

type Client = { cookie: string; ip: string; v?: number; captain: boolean };
const lat: number[] = []; const errs: Record<string, number> = {}; let n204 = 0, n200 = 0, answers = 0, answerErr: Record<string, number> = {};

async function post(path: string, body: unknown, cookie = "", ip = "10.1.1.1") {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", cookie, "x-forwarded-for": ip }, body: JSON.stringify(body) });
  return r;
}
const cookieOf = (r: Response) => (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

async function main() {
  const login = await post("/api/admin/login", { password: process.env.ADMIN_PASSWORD ?? "afterlife-dev" });
  const ac = cookieOf(login);
  const act = (b: object) => post("/api/admin/party", { party: PARTY, ...b }, ac);
  await act({ action: "reset", confirm: true });
  await act({ action: "settings", patch: { introMs: 8000, questionMs: 10000, revealMs: 3000, resultsMs: 4000, intervalMs: 6000, minViewMs: 2000, memoryExposeMs: 3000, memoryAnswerMs: 10000, familyPreferMs: 6000, familyPredictMs: 6000 } });
  const clients: Client[] = [];
  for (let t = 0; t < 20; t++) {
    const ip = `10.50.${t}.1`;
    const r = await post("/api/join", { party: PARTY, name: `Cap${t}` }, "", ip);
    const me = await r.json();
    clients.push({ cookie: cookieOf(r), ip, captain: true });
    for (let k = 0; k < 2; k++) {
      const r2 = await post("/api/join", { party: PARTY, name: `M${t}-${k}`, inviteCode: me.team.inviteCode }, "", ip);
      clients.push({ cookie: cookieOf(r2), ip, captain: false });
    }
  }
  console.log("joined clients:", clients.length);
  await new Promise((r) => setTimeout(r, 6000));
  await act({ action: "start" });
  const end = Date.now() + DURATION;
  const answered = new Set<string>();
  const phases = new Set<string>();
  async function loop(c: Client | null, interval: number) {
    let v: number | undefined;
    while (Date.now() < end) {
      const t0 = performance.now();
      try {
        const r = await fetch(`${BASE}/api/state?party=${PARTY}&audience=${c ? "phone" : "tv"}${v != null ? `&v=${v}` : ""}`, { headers: c ? { cookie: c.cookie, "x-forwarded-for": c.ip } : {} });
        lat.push(performance.now() - t0);
        if (r.status === 204) n204++;
        else if (r.ok) {
          n200++;
          const s = await r.json(); v = s.version; phases.add(s.phase.kind);
          if (c?.captain && s.phase.kind === "question" && s.question && s.phase.stage !== "expose") {
            const key = c.cookie + s.question.id + s.phase.stage;
            if (!answered.has(key)) {
              answered.add(key);
              const a = await post("/api/answer", { party: PARTY, questionId: s.question.id, stage: s.phase.stage, choice: Math.floor(Math.random() * s.question.options.length), requestId: crypto.randomUUID() }, c.cookie, c.ip);
              if (a.ok) answers++; else { const j = await a.json().catch(() => ({})); answerErr[j.code ?? a.status] = (answerErr[j.code ?? a.status] ?? 0) + 1; }
            }
          }
        } else errs[r.status] = (errs[r.status] ?? 0) + 1;
      } catch (e) { errs[(e as Error).message] = (errs[(e as Error).message] ?? 0) + 1; }
      await new Promise((r) => setTimeout(r, interval));
    }
  }
  await Promise.all([loop(null, 1000), ...clients.map((c) => loop(c, 1500))]);
  lat.sort((a, b) => a - b);
  const pct = (p: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(1);
  const st = await (await fetch(`${BASE}/api/state?party=${PARTY}`)).json();
  console.log(JSON.stringify({ requests: lat.length, n200, n204, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: lat[lat.length - 1].toFixed(1), errors: errs, answers, answerErr, phasesSeen: [...phases], finalVersion: st.version, finalPhase: st.phase.kind, setScores: st.lastSet?.scores?.length ?? null }, null, 1));
}
main();
