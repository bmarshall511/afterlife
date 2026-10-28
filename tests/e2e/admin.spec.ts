import { expect, request, test } from "@playwright/test";
import sharp from "sharp";
import { admin, adminAction, apiGuest, apiJoin, BASE, INVITE, isAnswerStage, resetDemo, snapshot, waitPhase } from "./helpers";

test.describe.configure({ mode: "serial" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ROUTES: [string, string][] = [
  ["GET", "/api/admin/party?party=demo"], ["POST", "/api/admin/party"],
  ["GET", "/api/admin/teams?party=demo"], ["POST", "/api/admin/teams"],
  ["GET", "/api/admin/diagnostics?party=demo"], ["GET", "/api/admin/qr?party=demo"],
  ["GET", "/api/admin/content"], ["POST", "/api/admin/content"], ["GET", "/api/admin/session"],
  ["GET", "/api/admin/tributes?party=demo"], ["GET", "/api/admin/tributes/export?party=demo"],
  ["GET", "/api/admin/tributes/00000000-0000-0000-0000-000000000000"],
  ["PATCH", "/api/admin/tributes/00000000-0000-0000-0000-000000000000"],
  ["DELETE", "/api/admin/tributes/00000000-0000-0000-0000-000000000000?confirm=1"],
  ["GET", "/api/admin/tributes/00000000-0000-0000-0000-000000000000/download"],
];

test("5a. every admin route rejects unauthenticated callers; bad password rejected", async () => {
  const anon = await request.newContext({ baseURL: BASE });
  for (const [m, u] of ROUTES) {
    const r = await anon.fetch(u, { method: m, data: m === "GET" ? undefined : { party: "demo", action: "reset", confirm: true } });
    expect(r.status(), `${m} ${u}`).toBe(401);
  }
  // forged cookie
  const forged = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: "al_admin=forged" } });
  expect((await forged.get("/api/admin/session")).status()).toBe(401);
  const bad = await anon.post("/api/admin/login", { data: { password: "wrong" } });
  expect(bad.status()).toBeGreaterThanOrEqual(400);
  const a = await admin();
  expect((await a.get("/api/admin/session")).status()).toBe(200);
  expect((await a.post("/api/admin/logout")).status()).toBeLessThan(300);
  expect((await a.get("/api/admin/session")).status()).toBe(401);
});

test("5b. pause freezes countdown, resume restores remaining; skip advances", async () => {
  const a = await admin();
  await resetDemo(a, { introMs: 8000, questionMs: 30000, revealMs: 3000, minViewMs: 1500, memoryExposeMs: 3000, memoryAnswerMs: 30000 });
  const g = await apiGuest();
  await apiJoin(g, "Pausa");
  await adminAction(a, "start");
  const s = await waitPhase(a, isAnswerStage, 30_000);
  const before = s.phase.endsAt - s.serverNow;
  expect((await adminAction(a, "pause")).status).toBe(200);
  await sleep(4000);
  const p = await snapshot(a);
  expect(p.status).toBe("paused");
  expect(p.question?.id).toBe(s.question.id);
  expect((await adminAction(a, "resume")).status).toBe(200);
  const r = await snapshot(a);
  const after = r.phase.endsAt - r.serverNow;
  expect(Math.abs(after - before), `remaining before=${before} after=${after}`).toBeLessThan(1500);
  expect((await adminAction(a, "skip")).status).toBe(200);
  const k = await snapshot(a);
  expect(k.phase.kind !== "question" || k.question?.id !== s.question.id).toBe(true);
});

test("5c. demo reset leaves live tributes intact", async () => {
  const a = await admin();
  const g = await apiGuest();
  const buf = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#884422" } }).jpeg().toBuffer();
  const live = await g.post("/api/tributes", { multipart: { token: INVITE, party: "live", personName: "Live Keepsake", consent: "true", photo: { name: "a.jpg", mimeType: "image/jpeg", buffer: buf } } });
  expect(live.status()).toBe(201);
  const { id } = await live.json();
  await resetDemo(a);
  const liveReset = await adminAction(a, "reset", { confirm: true }, "live");
  expect(liveReset.status).toBe(403);
  const list = await (await a.get("/api/admin/tributes?party=live")).text();
  expect(list).toContain(id);
  expect((await g.get(`/api/tributes/photo/${id}?size=thumb`)).status()).toBe(200);
});
