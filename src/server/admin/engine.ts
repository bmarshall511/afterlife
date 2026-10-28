import { HttpError } from "@/server/tributes/http";

type Fn = (...args: unknown[]) => Promise<unknown>;

/**
 * Calls an engine control function from src/server/engine/control.ts (owned by the engine workstream).
 * Loaded lazily so admin auth/tributes keep working even if a control function is missing.
 */
export async function callControl(name: string, ...args: unknown[]): Promise<unknown> {
  const mod = (await import("@/server/engine/control")) as unknown as Record<string, unknown>;
  const fn = mod[name];
  if (typeof fn !== "function") throw new HttpError(501, "not_implemented", `Engine control "${name}" is not available yet.`);
  return (fn as Fn)(...args);
}

export async function loadContent(): Promise<Array<Record<string, any>>> {
  const mod = (await import("@/content/index")) as unknown as Record<string, unknown>;
  const fn = mod.allContent;
  if (typeof fn !== "function") throw new HttpError(501, "not_implemented", "Content allContent() is not available yet.");
  return (fn as () => Array<Record<string, any>>)();
}
