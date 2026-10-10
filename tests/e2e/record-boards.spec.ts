import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import type { Request } from "@playwright/test";
import { presetId } from "../../features/records/crm-preset";

test.use({ timezoneId: "America/Los_Angeles" });

test("moves a board card with the keyboard and restores relationship and date grouping", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  const pending = new Set<Request>();
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/en/records/")) pending.add(request);
  });
  page.on("requestfinished", (request) => pending.delete(request));
  page.on("requestfailed", (request) => pending.delete(request));
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const id = (key: string) => presetId(companyId, key);
  const closeAppearance = async () => {
    if (testInfo.project.name === "mobile") await page.locator('[data-slot="drawer-close"]').click();
    else await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Appearance", exact: true })).not.toBeVisible();
  };
  const typeId = id("deal");
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Keyboard opportunity");
  await dialog.getByRole("combobox", { name: "Stage", exact: true }).click();
  await page.getByRole("option", { name: "New", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Organizations", exact: true }).click();
  await page.getByRole("option", { name: "Example organization", exact: true }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const created = await database.query('SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [
    companyId,
    typeId,
  ]);
  const recordId = created.rows[0].id as string;
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.locator("#records-layout-board").click();
  await closeAppearance();
  const card = page.locator(`[data-item-id="${recordId}"]`);
  await expect(page.locator(`[data-group-key="value:${id("deal.stage.new")}"]`).locator(card)).toBeVisible();
  await expect(page.locator(`[data-group-key="value:${id("deal.stage.new")}"] [aria-label*="Stage probability: 10%"]`)).toBeVisible();
  await expect(page.locator(`[data-group-key="value:${id("deal.stage.lost")}"] [aria-label*="Stage probability: 0%"]`)).toBeVisible();
  await card.focus();
  await page.keyboard.press("Space");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Move record to New.", { exact: true })).toBeAttached();
  await card.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Move record to Qualified.", { exact: true })).toBeAttached();
  await page.keyboard.press("Space");
  await expect(card).not.toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => {
      const value = await database.query(
        'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
        [companyId, typeId, recordId, id("deal.stage")],
      );
      return value.rows[0]?.textValue;
    })
    .toBe(id("deal.stage.qualified"));
  await expect(page.locator(`[data-group-key="value:${id("deal.stage.qualified")}"]`).locator(card)).toBeVisible();
  await expect(card).toBeFocused();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("combobox", { name: "Group By", exact: true }).click();
  await page.getByRole("option", { name: "Organizations", exact: true }).click();
  await closeAppearance();
  await expect(page.locator('[data-slot="kanban-root"]')).toContainText("Example organization");
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(`relationship:${id("deal.organizations")}:outgoing`)));
  await expect
    .poll(async () => {
      const value = await database.query('SELECT grouping FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [
        companyId,
        `records:${typeId}`,
      ]);
      return value.rows[0]?.grouping;
    })
    .toEqual({ field: `relationship:${id("deal.organizations")}:outgoing` });
  await expect.poll(() => pending.size).toBe(0);
  await page.reload();
  await expect(page.locator('[data-slot="kanban-root"]')).toContainText("Example organization");
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("combobox", { name: "Group By", exact: true }).click();
  await page.getByRole("option", { name: "Created at · Month", exact: true }).click();
  await closeAppearance();
  await expect(card).toBeVisible();
  await expect
    .poll(async () => {
      const value = await database.query(
        'SELECT grouping,"viewMode" FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2',
        [companyId, `records:${typeId}`],
      );
      return value.rows[0];
    })
    .toEqual({ grouping: { field: "system:createdAt", bucket: "month" }, viewMode: "card" });
  await expect(page).toHaveURL(/groupBy=system%3AcreatedAt%3Amonth/);
  await expect.poll(() => pending.size).toBe(0);
  await page.reload();
  await expect(card).toBeVisible();
  const month = await database.query(
    "SELECT date_trunc('month', transaction_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS month",
  );
  const bucketLabel = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", timeZone: "UTC" }).format(
    month.rows[0].month,
  );
  await expect(page.locator("[data-group-key]").filter({ has: card })).toContainText(bucketLabel);
  await page.screenshot({ path: testInfo.outputPath("record-board.png"), fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});
