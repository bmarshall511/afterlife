import { describe, expect, it, beforeEach } from "vitest";
import { P, T0, newTeam, setup } from "./engine-helpers";
import { join, listTeamsForRejoin, buildMe } from "@/server/engine";
import { addDemoBots } from "@/server/engine/demobots";

describe("get back in from the join page", () => {
  let d: any;
  beforeEach(async () => { d = await setup(); });

  it("lists teams and people without invite codes, hides demo bots", async () => {
    const a = await newTeam("Ana");
    await join(P, { name: "Beto", inviteCode: a.invite }, T0);
    await addDemoBots(P, 2, T0);
    const teams = await listTeamsForRejoin(P);
    expect(teams.map((t) => t.name)).toEqual(["Ana's Family"]);
    expect(teams[0].people.map((p) => p.name).sort()).toEqual(["Ana", "Beto"]);
    expect(teams[0].people.find((p) => p.name === "Ana")!.captain).toBe(true);
    expect(JSON.stringify(teams)).not.toContain(a.invite);
  });

  it("picking the captain on a new phone moves captaincy there; the old phone can no longer submit", async () => {
    const a = await newTeam("Ana");
    const before = (await listTeamsForRejoin(P))[0];
    const r = await join(P, { name: "", teamId: before.id, asMemberId: before.people[0].memberId }, T0 + 1000);
    expect(r.me.member.name).toBe("Ana");
    expect(r.me.member.isCaptain).toBe(true);
    expect(r.me.team.id).toBe(a.teamId);
    expect((await buildMe(d, P, a.memberId, T0 + 2000)).member.isCaptain).toBe(false);
    // list still shows one "Ana", now pointing at the new device
    const after = (await listTeamsForRejoin(P))[0];
    expect(after.people.filter((p) => p.name === "Ana")).toHaveLength(1);
    expect(after.people[0].memberId).toBe(r.me.member.id);
  });

  it("someone new can join a picked team without a code, as a non-captain", async () => {
    const a = await newTeam("Ana");
    const r = await join(P, { name: "Cora", teamId: a.teamId }, T0 + 1000);
    expect(r.me.team.id).toBe(a.teamId);
    expect(r.me.member.isCaptain).toBe(false);
  });

  it("rejects bot teams and people from another team", async () => {
    const a = await newTeam("Ana");
    const b = await newTeam("Beto");
    await expect(join(P, { name: "", teamId: a.teamId, asMemberId: b.memberId }, T0)).rejects.toMatchObject({ status: 404 });
    const bots = await d.query("SELECT id FROM team WHERE bot");
    expect(bots.length).toBe(0);
    await addDemoBots(P, 1, T0);
    const bot = (await d.query("SELECT id FROM team WHERE bot"))[0];
    await expect(join(P, { name: "X", teamId: bot.id }, T0)).rejects.toMatchObject({ status: 404 });
  });
});
