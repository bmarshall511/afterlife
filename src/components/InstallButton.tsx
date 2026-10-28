"use client";
import { useState } from "react";
import InstallGuide from "@/app/install/InstallGuide";
import { Sheet } from "./Sheet";

/** "Install app" opens the guide in an in-app sheet rather than navigating to another page. */
export function InstallButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>Install app</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Install the app" size="full">
        <InstallGuide embedded onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
