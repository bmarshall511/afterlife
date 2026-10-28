"use client";

import { useEffect, useState } from "react";
import AddTribute from "../AddTribute";
import MyTributes from "../MyTributes";
import { useMine } from "../useMine";

type Tab = "add" | "mine";

/**
 * Remember screen with two distinct states behind a segmented control: "Add someone" | "Your tributes · N".
 * Opens on "Your tributes" when the family/device already has some. Both panes stay mounted, so switching is
 * instant and an in-progress tribute isn't lost.
 * `inApp`: shown inside the game controller sheet (tributes link to the family; no edit-link box, no page header).
 */
export default function RememberForm({ token, party, inApp = false }: { token: string; party: "live" | "demo"; inApp?: boolean }) {
  const { list, setList, reload, error } = useMine(party);
  const [tab, setTab] = useState<Tab | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const n = list?.length ?? 0;

  useEffect(() => {
    if (tab === null && list !== null) setTab(list.length > 0 ? "mine" : "add");
  }, [list, tab]);

  const show = (t: Tab) => { setTab(t); if (t === "mine") setOpenId(null); };

  return (
    <div className={`rv-root${inApp ? " in-app" : ""}`}>
      {!inApp ? (
        <header className="rv-head">
          <p className="rm-eyebrow">Digital ofrenda</p>
          <h1 className="rm-h1">Remember someone with us</h1>
        </header>
      ) : null}
      <div className="rv-seg" role="tablist" aria-label="Remember" hidden={tab === "mine" && !!openId}>
        <button type="button" role="tab" id="rv-tab-add" aria-controls="rv-panel-add" aria-selected={tab === "add"} onClick={() => show("add")}>Add someone</button>
        <button type="button" role="tab" id="rv-tab-mine" aria-controls="rv-panel-mine" aria-selected={tab === "mine"} onClick={() => show("mine")}>
          Your tributes{n ? ` · ${n}` : ""}
        </button>
        <span className="rv-seg-thumb" data-tab={tab ?? "add"} aria-hidden="true" />
      </div>
      {tab === null ? <p className="rm-muted">Loading…</p> : null}
      <div role="tabpanel" id="rv-panel-add" aria-labelledby="rv-tab-add" hidden={tab !== "add"}>
        <AddTribute token={token} party={party} inApp={inApp} onPublished={() => reload()} onSeeMine={() => show("mine")} />
      </div>
      <div role="tabpanel" id="rv-panel-mine" aria-labelledby="rv-tab-mine" hidden={tab !== "mine"}>
        <MyTributes party={party} list={list} setList={setList} reload={reload} error={error}
          onAdd={() => show("add")} openId={openId} onOpenChange={setOpenId} />
      </div>
    </div>
  );
}
