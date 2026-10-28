import { APIRequestContext, Browser, BrowserContext, expect, request } from "@playwright/test";

export const BASE = process.env.BASE_URL ?? "http://localhost:3200";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "afterlife-dev";
export const INVITE = process.env.TRIBUTE_INVITE_TOKEN ?? "e2e-invite-token-123456";
export const PARTY = "demo";

let ipSeq = Math.floor(Math.random() * 200);
/** distinct fake IP per API context so join rate limits don't collide across tests */
export const fakeIp = () => `10.9.${++ipSeq % 250}.${Math.floor(Math.random() * 250)}`;

export async function admin(): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  const r = await ctx.post("/api/admin/login", { data: { password: ADMIN_PASSWORD } });
  expect(r.status(), await r.text()).toBe(200);
  return ctx;
}

export async function adminAction(a: APIRequestContext, action: string, extra: Record<string, unknown> = {}, party = PARTY) {
  const r = await a.post("/api/admin/party", { data: { party, action, ...extra } });
  return { status: r.status(), body: await r.json().catch(() => null) };
}

export const ALBUM = process.env.ALBUM_INVITE_TOKEN ?? "e2e-album-token-123456";

/** v2 pacing: every stage >= 6 s so presence/eligibility works. */
export const FAST: Record<string, number> = {
  introMs: 7000, revealMs: 7000, calaveraRevealMs: 7000, resultsMs: 7000, intervalMs: 8000, minViewMs: 1500,
  lineAnswerMs: 30000, closestAnswerMs: 30000, loteriaAnswerMs: 30000, roomAnswerMs: 25000, roomGuessMs: 25000,
  calaveraWriteMs: 45000, calaveraVoteMs: 30000, caseClueMs: 6000, caseAnswerMs: 30000,
  tributeDwellMinMs: 6000, tributeDwellMaxMs: 7000, intervalTributeMs: 7000,
};

export async function resetDemo(a: APIRequestContext, settings: Record<string, unknown> = FAST) {
  const r = await adminAction(a, "reset", { confirm: true });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const s = await adminAction(a, "settings", { patch: settings });
  expect(s.status, JSON.stringify(s.body)).toBe(200);
}

export async function snapshot(ctx: APIRequestContext, party = PARTY): Promise<any> {
  const r = await ctx.get(`/api/state?party=${party}`);
  expect(r.status()).toBe(200);
  return r.json();
}

export async function apiGuest(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
}

export async function apiJoin(ctx: APIRequestContext, name: string, inviteCode?: string, party = PARTY) {
  const r = await ctx.post("/api/join", { data: { party, name, inviteCode } });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return r.json();
}

export async function me(ctx: APIRequestContext, party = PARTY) {
  const r = await ctx.get(`/api/me?party=${party}`);
  return { status: r.status(), body: await r.json().catch(() => null) };
}

export async function waitPhase(ctx: APIRequestContext, pred: (s: any) => boolean, timeoutMs = 60_000, party = PARTY): Promise<any> {
  const end = Date.now() + timeoutMs;
  let s: any;
  while (Date.now() < end) {
    s = await snapshot(ctx, party);
    if (pred(s)) return s;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("waitPhase timeout; last=" + JSON.stringify(s?.phase));
}

/** a question stage where phones have an input */
export const isAnswerStage = (s: any) => s.phase.kind === "question" && !!s.question && !!s.question.input;

export async function newPhone(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": fakeIp() }, ...opts });
}

export async function adminTeams(a: APIRequestContext, party = PARTY) {
  const r = await a.get(`/api/admin/teams?party=${party}`);
  return r.json();
}
