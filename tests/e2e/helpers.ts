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

export const FAST = {
  introMs: 8000, questionMs: 15000, memoryExposeMs: 3000, revealMs: 3000, resultsMs: 3000,
  intervalMs: 6000, minViewMs: 1500, familyPreferMs: 5000, tributeDwellMinMs: 4000, tributeDwellMaxMs: 5000,
};

export async function resetDemo(a: APIRequestContext, settings: Record<string, number> = FAST) {
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

export const isAnswerStage = (s: any) => s.phase.kind === "question" && !!s.question && (s.phase.stage === "answer" || s.phase.stage == null) && s.question.options?.length > 0;

export async function newPhone(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": fakeIp() }, ...opts });
}

export async function adminTeams(a: APIRequestContext, party = PARTY) {
  const r = await a.get(`/api/admin/teams?party=${party}`);
  return r.json();
}
