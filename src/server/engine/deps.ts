import type { Db, Q } from "@/server/db";
import type { PublicSlide } from "@/shared/types";
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
  album?: AlbumSource;
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
      // v2 content API is recognised by caseSet(); until the content workstream lands it, use fixtures.
      if (typeof m.caseSet !== "function" || typeof m.allContent !== "function") throw new Error("src/content does not export the v2 API yet");
      const c: ContentSource = { allContent: m.allContent, publicQuestion: m.publicQuestion, revealInfo: m.revealInfo, generateFresh: m.generateFresh, caseSet: m.caseSet };
      return c;
    } catch (e) {
      // Never play placeholder questions at the real party.
      if (process.env.NODE_ENV === "production" && !process.env.VITEST) throw e;
      console.warn("[engine] src/content unavailable, using fixture pool:", (e as Error).message);
      return fixtureContent(12);
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

export interface AlbumSource {
  nextAlbumSlide(q: Q, partyId: string, now: number): Promise<PublicSlide | null>;
  isAlbumPhotoVisible(q: Q, partyId: string, id: string): Promise<boolean>;
}
const noAlbum: AlbumSource = { nextAlbumSlide: async () => null, isAlbumPhotoVisible: async () => false };
let albumP: Promise<AlbumSource> | null = null;
export function album(): Promise<AlbumSource> {
  if (o.album) return Promise.resolve(o.album);
  albumP ??= (async () => {
    try {
      const m: any = await import("@/server/album/queue");
      return { nextAlbumSlide: m.nextAlbumSlide, isAlbumPhotoVisible: m.isAlbumPhotoVisible };
    } catch (e) {
      console.warn("[engine] album queue unavailable:", (e as Error).message);
      return noAlbum;
    }
  })();
  return albumP;
}
