/** Demo party only: load a few sample party photos so the album and the TV photo breaks can be previewed. */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Q } from "@/server/db";
import { putObject } from "@/server/storage";
import { finalizePhoto } from "./service";

const SAMPLES = [
  { file: "Yg88bW3-bcs.jpg", caption: "The calavera centrepiece survived the night", by: "Photo: Brian Wegman / Unsplash" },
  { file: "GlyF8XdJJSc.jpg", caption: "Best headpiece of the party — no contest", by: "Photo: Roger Ce / Unsplash" },
  { file: "QmP_dzOq634.jpg", caption: "Catrina brought pan dulce for everyone", by: "Photo: Roger Ce / Unsplash" },
  { file: "1aJuPtQJX_I.jpg", caption: "Purple flowers, perfect eyeliner", by: "Photo: Fili Santillán / Unsplash" },
  { file: "m9J7HgjuJMY.jpg", caption: "Field trip to the big parade", by: "Photo: Luis / Unsplash" },
  { file: "Qpq46LVK7qw.jpg", caption: "The skeletons who never leave the bench", by: "Photo: Edgar Cavazos / Unsplash" },
];

export async function addDemoPhotos(q: Q) {
  const dir = path.join(process.cwd(), "demo-assets", "party-photos");
  let added = 0;
  for (const s of SAMPLES) {
    const buf = await fs.readFile(path.join(dir, s.file));
    const pathname = `album-raw/demo/${randomBytes(12).toString("base64url")}.jpg`;
    await putObject(pathname, buf, "image/jpeg");
    await finalizePhoto(q, { partyId: "demo", pathname, caption: s.caption, takenBy: s.by });
    added++;
  }
  return { added };
}
