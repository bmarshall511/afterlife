import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const INVITE = process.env.TRIBUTE_INVITE_TOKEN ?? "dev-ofrenda-2026";
const SHOTS = "docs/screenshots/tributes-manage";

async function photo(seed: number) {
  return sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 60 + seed * 30, g: 110, b: 150 } } }).jpeg().toBuffer();
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: false });

async function noOverflow(page: Page, label: string) {
  for (const w of [320, 375, 430]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(150);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(o.sw, `${label} horizontal overflow at ${w}px`).toBeLessThanOrEqual(o.iw);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function addTribute(scope: Page, name: string, seed: number) {
  await scope.locator('input[type="file"]').first().setInputFiles({ name: `p${seed}.jpg`, mimeType: "image/jpeg", buffer: await photo(seed) });
  await expect(scope.getByLabel("Preview of how this will appear on the party TV")).toBeVisible();
  await scope.getByLabel("Their name").first().fill(name);
  await scope.getByPlaceholder(/Share a memory/).first().fill("Loved marigolds and loud music.");
  await scope.getByText("It's okay to show this photo").click();
  await scope.getByRole("button", { name: "Publish tribute" }).click();
  await expect(scope.getByText(`Thank you. ${name} is on the ofrenda.`)).toBeVisible();
}

test("controller Remember sheet: add, list, edit inline, remove", async ({ page }) => {
  const tag = `${test.info().project.name === "chromium" ? "C" : "W"}${Date.now() % 10000}`;
  await page.goto("/join?party=demo");
  await page.getByPlaceholder("e.g. Lucía").fill(`Tester${tag}`);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.waitForURL(/\/play/);
  await page.getByRole("button", { name: /Remember/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Remember someone" });
  await expect(sheet).toBeVisible();
  await addTribute(page, `Abuela ${tag}`, 1);
  const list = sheet.getByRole("region", { name: "Your tributes" });
  await expect(list.getByText(`Abuela ${tag}`)).toBeVisible();
  await expect(list.getByText("On the TV")).toBeVisible();
  await shot(page, "sheet-success-list");
  // back to the form: the family's list sits on top with "Add another"
  await sheet.getByRole("button", { name: "Add another" }).first().click();
  await expect(sheet.getByRole("heading", { name: /Your tributes · 1/ })).toBeVisible();
  await shot(page, "sheet-list-top");
  await noOverflow(page, "sheet");
  await list.getByRole("button", { name: `Edit Abuela ${tag}` }).click();
  await expect(sheet.getByText("Edit tribute")).toBeVisible();
  expect(page.url()).toMatch(/\/play/); // no navigation
  await sheet.getByLabel("Their name").filter({ visible: true }).fill(`Abuelita ${tag}`);
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet.getByText("Saved. The TV will show")).toBeVisible();
  await shot(page, "sheet-edit-inline");
  await sheet.getByRole("button", { name: "← Your tributes" }).click();
  await expect(list.getByText(`Abuelita ${tag}`)).toBeVisible();
  await list.getByRole("button", { name: `Remove Abuelita ${tag}` }).click();
  await shot(page, "sheet-remove-confirm");
  await list.getByRole("button", { name: "Yes, remove" }).click();
  await expect(sheet.getByText(`Abuelita ${tag}`)).toHaveCount(0);
});

test("/remember page: add, list, edit, remove; paste-link import", async ({ page, browser }) => {
  const tag = `${test.info().project.name === "chromium" ? "C" : "W"}${Date.now() % 10000}`;
  await page.goto(`/remember/${INVITE}?party=demo`);
  await shot(page, "page-empty");
  await addTribute(page, `Tío ${tag}`, 2);
  const list = page.getByRole("region", { name: "Your tributes" });
  await expect(list.getByText(`Tío ${tag}`)).toBeVisible();
  const editLink = await page.locator(".rm-link").innerText();
  await shot(page, "page-success-list");
  await noOverflow(page, "remember success");
  await list.getByRole("button", { name: `Edit Tío ${tag}` }).click();
  await page.getByLabel("Their name").filter({ visible: true }).fill(`Tío Beto ${tag}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved. The TV will show")).toBeVisible();
  await page.getByRole("button", { name: "← Your tributes" }).click();
  await expect(list.getByText(`Tío Beto ${tag}`)).toBeVisible();

  // a fresh device (no localStorage, no session) imports via pasted link
  const ctx2 = await browser.newContext({ ...test.info().project.use });
  const p2 = await ctx2.newPage();
  await p2.goto(`/remember/${INVITE}?party=demo`);
  await p2.getByRole("button", { name: "Have a private edit link? Paste it" }).click();
  await p2.getByLabel(/Paste a private edit link/).fill("not a link");
  await p2.getByRole("button", { name: "Add", exact: true }).click();
  await expect(p2.getByText("doesn't look like a private edit link")).toBeVisible();
  await p2.getByLabel(/Paste a private edit link/).fill(editLink);
  await p2.getByRole("button", { name: "Add", exact: true }).click();
  await expect(p2.getByText(`Added Tío Beto ${tag} to this device.`)).toBeVisible();
  await expect(p2.getByRole("region", { name: "Your tributes" }).getByText(`Tío Beto ${tag}`, { exact: true })).toBeVisible();
  await shot(p2, "page-paste-import");
  await noOverflow(p2, "remember list");
  await ctx2.close();

  await list.getByRole("button", { name: `Remove Tío Beto ${tag}` }).click();
  await list.getByRole("button", { name: "Yes, remove" }).click();
  await expect(page.getByText(`Tío Beto ${tag}`)).toHaveCount(0);
});
