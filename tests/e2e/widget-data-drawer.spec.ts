import type { Page } from "@playwright/test";

import { DEMO_COMPANY_ID, demoId, expect, test } from "./demo-seed";

const DEAL_SURFACE = `records:${demoId("deal")}`;

type Database = { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

async function openKpiDrawer(page: Page, database: Database, name: string) {
  const { rows } = await database.query(
    'SELECT id FROM "Widget" WHERE "companyId"=$1 AND name=$2 AND "viewId" IS NULL AND "deletedAt" IS NULL',
    [DEMO_COMPANY_ID, name],
  );
  const card = page.locator(`[data-focus-target="widget:${rows[0].id as string}"]`);
  await card.scrollIntoViewIfNeeded();
  await card.locator('[data-slot="widget-number"]').click();
  const drawer = page.getByRole("dialog", { name, exact: true });
  await expect(drawer.locator("[data-linked-records-table] [data-row-id]").first()).toBeVisible();
  return drawer;
}

test("a single-number widget drawer shows the count once and pages 25 records", async ({ page, database, errors }) => {
  test.setTimeout(120000);
  await page.goto("/en/dashboard");
  const drawer = await openKpiDrawer(page, database, "Open pipeline");
  const summary = (await drawer.locator("[data-linked-records-summary]").textContent()) ?? "";
  const total = Number(/(\d+) contributing records?$/u.exec(summary)?.[1]);
  expect(total).toBeGreaterThan(0);
  await expect(drawer.locator("[data-widget-detail-chart]")).toHaveCount(0);
  await expect(drawer.locator('[data-slot="widget-number"]')).toHaveCount(0);
  await expect(drawer.locator("[data-linked-records-table] [data-row-id]")).toHaveCount(Math.min(total, 25));
  await expect(drawer.getByRole("combobox").filter({ hasText: /^25$/u })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("a widget drawer keeps its table appearance after a reload", async ({ page, database, errors }) => {
  test.setTimeout(180000);
  const before = await database.query(
    'SELECT id, "hiddenColumns", "columnOrder" FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2',
    [DEMO_COMPANY_ID, DEAL_SURFACE],
  );
  const savedHidden = async () =>
    (
      await database.query('SELECT "hiddenColumns" FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [
        DEMO_COMPANY_ID,
        DEAL_SURFACE,
      ])
    ).rows[0]?.hiddenColumns as string[] | undefined;
  try {
    await page.goto("/en/dashboard");
    let drawer = await openKpiDrawer(page, database, "Open pipeline");
    const headers = drawer.getByRole("columnheader");
    const visibleBefore = await headers.count();
    await drawer.locator("#widget-data-display-options").click();
    const toggle = page.getByRole("checkbox", { checked: true, disabled: false }).last();
    const toggleId = await toggle.getAttribute("id");
    await toggle.uncheck();
    await page.keyboard.press("Escape");
    await expect(headers).toHaveCount(visibleBefore - 1);
    const hiddenBefore = (before.rows[0]?.hiddenColumns as string[] | undefined)?.length ?? 0;
    await expect.poll(async () => (await savedHidden())?.length ?? 0).toBeGreaterThan(hiddenBefore);

    await page.reload();
    drawer = await openKpiDrawer(page, database, "Open pipeline");
    await expect(drawer.getByRole("columnheader")).toHaveCount(visibleBefore - 1);
    await drawer.locator("#widget-data-display-options").click();
    await expect(page.locator(`[id="${toggleId}"]`)).not.toBeChecked();
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
  } finally {
    const [row] = before.rows as { id: string; hiddenColumns: string[]; columnOrder: string[] }[];
    if (row)
      await database.query('UPDATE "P13n" SET "hiddenColumns"=$2, "columnOrder"=$3 WHERE id=$1', [
        row.id,
        row.hiddenColumns,
        row.columnOrder,
      ]);
    else
      await database.query('DELETE FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [DEMO_COMPANY_ID, DEAL_SURFACE]);
  }
});
