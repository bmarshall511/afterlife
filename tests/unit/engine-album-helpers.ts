import { setMode, startParty } from "@/server/engine/control";
import { P } from "./engine-helpers";
/** Puts the test party into a running tribute-only break (interval) at time t. */
export async function setTributeOnly(t: number) {
  await setMode(P, "tribute_only", "test", t);
  await startParty(P, "test", t);
}
