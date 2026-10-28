import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

const INVITE = process.env.TRIBUTE_INVITE_TOKEN ?? "dev-ofrenda-2026";
const SHOTS = "docs/screenshots/tributes-manage/v2";

const photo = (seed: number) =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 60 + seed * 30, g: 110, b: 150 } } }).jpeg().toBuffer();
const proj = () => (test.info().project.name === "chromium" ? "chromium" : "webkit");
async function shot(page: Page, name: string, width = 375) {
  await page.setViewportSize({ width, height: 812 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${proj()}-${name}-${width}.png` });
}
async function noOverflow(page: Page, label: string) {
  for (const w of [320, 375, 430]) {
    await page.setViewportSize({ width: w, height: 812 });
    await page.waitForTimeout(120);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(o.sw, `${label}: horizontal overflow at ${w}px`).toBeLessThanOrEqual(o.iw);
  }
  await page.setViewportSize({ width: 375, height: 812 });
}
const tab = (s: Locator | Page, name: RegExp) => s.getByRole("tab", { name });

async function addTribute(scope: Locator | Page, name: string, seed: number) {
  const panel = scope.locator("#rv-panel-add");
  await panel.locator('input[type="file"]').setInputFiles({ name: `p${seed}.jpg`, mimeType: "image/jpeg", buffer: await photo(seed) });
  await expect(panel.getByLabel("Preview of how this will appear on the party TV")).toBeVisible();
  await panel.getByLabel("Their name").fill(name);
  await panel.getByPlaceholder(/Share a memory/).fill("Loved marigolds and loud music.");
  await panel.getByText("It's okay to show this photo").click();
  await panel.getByRole("button", { name: "Publish tribute" }).click();
  await expect(panel.getByRole("heading", { name: `${name} is on the ofrenda` })).toBeVisible();
}

test("controller sheet: default tab, add → success → your tributes → open → edit → back → remove", async ({ page }) => {
  const tag = `${proj()[0].toUpperCase()}${Date.now() % 10000}`;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/join?party=demo");
  await page.getByPlaceholder("e.g. Lucía").fill(`Tester${tag}`);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.waitForURL(/\/play/);
  await page.getByRole("button", { name: /Remember/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Remember someone" });
  await expect(tab(sheet, /Add someone/)).toHaveAttribute("aria-selected", "true"); // N = 0
  await shot(page, "sheet-add");
  await addTribute(sheet, `Abuela ${tag}`, 1);
  await expect(sheet.getByText("Save your edit link")).toHaveCount(0); // in-app: no edit-link box
  await shot(page, "sheet-success");
  await sheet.getByRole("button", { name: "See your tributes" }).click();
  await expect(tab(sheet, /Your tributes · 1/)).toHaveAttribute("aria-selected", "true");
  const card = sheet.getByRole("button", { name: `Open Abuela ${tag}` });
  await expect(card).toContainText("On the TV");
  await shot(page, "sheet-list");
  await shot(page, "sheet-list", 320);
  await noOverflow(page, "sheet list");

  // reopen: default tab is now "Your tributes"
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: /Remember/ }).first().click();
  await expect(tab(sheet, /Your tributes · 1/)).toHaveAttribute("aria-selected", "true");

  await sheet.getByRole("button", { name: `Open Abuela ${tag}` }).click();
  await expect(sheet.getByText("Edit tribute")).toBeVisible();
  expect(page.url()).toMatch(/\/play/);
  await sheet.locator("#rv-panel-mine").getByLabel("Their name").fill(`Abuelita ${tag}`);
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet.getByText("Saved. The TV will show")).toBeVisible();
  await shot(page, "sheet-detail");
  await noOverflow(page, "sheet detail");
  await sheet.getByRole("button", { name: "Your tributes", exact: true }).click();
  await expect(sheet.getByRole("button", { name: `Open Abuelita ${tag}` })).toBeVisible();
  await sheet.getByRole("button", { name: `Open Abuelita ${tag}` }).click();
  await sheet.getByRole("button", { name: "Remove tribute" }).click();
  await sheet.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(sheet.getByText(/No tributes yet/)).toBeVisible();
  await expect(tab(sheet, /^Your tributes$/)).toBeVisible();
  await shot(page, "sheet-empty");
  await sheet.locator("#rv-panel-mine").getByRole("button", { name: "Add someone" }).click();
  await expect(tab(sheet, /Add someone/)).toHaveAttribute("aria-selected", "true");
});

test("/remember page: add → success (edit link) → your tributes → edit → remove; paste import; default tab", async ({ page, browser }) => {
  const tag = `${proj()[0].toUpperCase()}${Date.now() % 10000}`;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/remember/${INVITE}?party=demo`);
  await expect(tab(page, /Add someone/)).toHaveAttribute("aria-selected", "true");
  await shot(page, "page-add");
  await noOverflow(page, "page add");
  await addTribute(page, `Tío ${tag}`, 2);
  await page.getByText("Save your edit link").click();
  const editLink = await page.getByLabel("Private edit link").inputValue();
  expect(editLink).toMatch(/\/remember\/edit\/[0-9a-f-]{36}#/);
  await shot(page, "page-success");
  await page.getByRole("button", { name: "See your tributes" }).click();
  await expect(page.getByRole("button", { name: `Open Tío ${tag}` })).toBeVisible();

  // reload: device has a saved tribute → opens on "Your tributes"
  await page.reload();
  await expect(tab(page, /Your tributes · 1/)).toHaveAttribute("aria-selected", "true");
  await shot(page, "page-list");
  await shot(page, "page-list", 320);
  await page.getByRole("button", { name: `Open Tío ${tag}` }).click();
  await page.locator("#rv-panel-mine").getByLabel("Their name").fill(`Tío Beto ${tag}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved. The TV will show")).toBeVisible();
  await shot(page, "page-detail");
  await page.getByRole("button", { name: "Your tributes", exact: true }).click();
  await expect(page.getByRole("button", { name: `Open Tío Beto ${tag}` })).toBeVisible();

  // a fresh device: empty manage state, then import by pasted link
  const ctx2 = await browser.newContext({ ...test.info().project.use });
  const p2 = await ctx2.newPage();
  await p2.setViewportSize({ width: 375, height: 812 });
  await p2.goto(`/remember/${INVITE}?party=demo`);
  await expect(tab(p2, /Add someone/)).toHaveAttribute("aria-selected", "true");
  await tab(p2, /Your tributes/).click();
  await expect(p2.getByText(/No tributes yet/)).toBeVisible();
  await shot(p2, "page-empty");
  await p2.getByRole("button", { name: "Have a private edit link? Paste it" }).click();
  await p2.getByLabel(/Paste a private edit link/).fill("not a link");
  await p2.getByRole("button", { name: "Add", exact: true }).click();
  await expect(p2.getByText("doesn't look like a private edit link")).toBeVisible();
  await p2.getByLabel(/Paste a private edit link/).fill(editLink);
  await p2.getByRole("button", { name: "Add", exact: true }).click();
  await expect(p2.getByText(`Added Tío Beto ${tag} to this device.`)).toBeVisible();
  await expect(p2.getByRole("button", { name: `Open Tío Beto ${tag}` })).toBeVisible();
  await expect(tab(p2, /Your tributes · 1/)).toBeVisible();
  await shot(p2, "page-paste-import");
  await noOverflow(p2, "page list");
  await ctx2.close();

  await page.getByRole("button", { name: `Open Tío Beto ${tag}` }).click();
  await page.getByRole("button", { name: "Remove tribute" }).click();
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(page.getByText(/No tributes yet/)).toBeVisible();
});
