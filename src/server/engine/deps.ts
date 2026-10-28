import type { Db } from "@/server/db";
import { getDb } from "@/server/db";
import type { ContentSource, TributeSource } from "./types";
import { fixtureContent } from "./fixtures";

/**
 * Dependency injection for the engine. Tests and scripts/simulate.ts call setEngineDeps();
 * production resolves src/content and src/server/tributes/queue lazily.
 */
interface Overrides {
  db?: Db;
  content?: ContentSource;
  tributes?: TributeSource;
}
let o: Overrides = {};
export function setEngineDeps(d: Overrides) {
  o = { ...o, ...d };
}

export async function db(): Promise<Db> {
  return o.db ?? getDb();
}

let contentP: Promise<ContentSource> | null = null;
export function content(): Promise<ContentSource> {
  if (o.content) return Promise.resolve(o.content);
  contentP ??= (async () => {
    try {
      // @ts-ignore -- module provided by the content workstream
      const m: any = await import("@/content/index");
      return { allContent: m.allContent, publicQuestion: m.publicQuestion, revealInfo: m.revealInfo, generateFresh: m.generateFresh, toPublicRecord: m.toPublicRecord, revealStageMs: m.REVEAL_STAGE_MS };
    } catch (e) {
      console.warn("[engine] src/content unavailable, using fixture pool:", (e as Error).message);
      return fixtureContent();
    }
  })();
  return contentP;
}

const noTributes: TributeSource = { nextTribute: async () => null, isTributeVisible: async () => false };
let tribP: Promise<TributeSource> | null = null;
export function tributes(): Promise<TributeSource> {
  if (o.tributes) return Promise.resolve(o.tributes);
  tribP ??= (async () => {
    try {
      // @ts-ignore -- module provided by the tributes workstream
      const m: any = await import("@/server/tributes/queue");
      return { nextTribute: m.nextTribute, isTributeVisible: m.isTributeVisible };
    } catch (e) {
      console.warn("[engine] tributes queue unavailable:", (e as Error).message);
      return noTributes;
    }
  })();
  return tribP;
}
