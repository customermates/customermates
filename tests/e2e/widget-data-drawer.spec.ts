import type { Page } from "@playwright/test";

import { appPath } from "./app-paths";
import { DEMO_COMPANY_ID, DEMO_MEMBERS, DEMO_SLUG, demoId, expect, test } from "./demo-seed";

const DASHBOARD = appPath(DEMO_SLUG, "/dashboard");

const DEAL_SURFACE = `records:${demoId("deal")}`;
const USER_ID = DEMO_MEMBERS.maxBergmann.userId;

type Database = { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

async function openKpiDrawer(page: Page, database: Database, name: string) {
  const { rows } = await database.query(
    'SELECT id FROM "Widget" WHERE "companyId"=$1 AND "userId"=$2 AND name=$3 AND "viewId" IS NULL AND "deletedAt" IS NULL',
    [DEMO_COMPANY_ID, USER_ID, name],
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
  await page.goto(DASHBOARD);
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
  const snapshot = await database.query(
    'SELECT row_to_json(p) AS row FROM "P13n" p WHERE "companyId"=$1 AND "p13nId"=$2 AND "userId"=$3',
    [DEMO_COMPANY_ID, DEAL_SURFACE, USER_ID],
  );
  const before = await database.query(
    'SELECT id, "hiddenColumns", "columnOrder", "viewMode", grouping, filters FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2 AND "userId"=$3',
    [DEMO_COMPANY_ID, DEAL_SURFACE, USER_ID],
  );
  const savedHidden = async () =>
    (
      await database.query('SELECT "hiddenColumns" FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2 AND "userId"=$3', [
        DEMO_COMPANY_ID,
        DEAL_SURFACE,
        USER_ID,
      ])
    ).rows[0]?.hiddenColumns as string[] | undefined;
  try {
    await page.goto(DASHBOARD);
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
    const listState = await database.query(
      'SELECT "viewMode", grouping, filters FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2 AND "userId"=$3',
      [DEMO_COMPANY_ID, DEAL_SURFACE, USER_ID],
    );
    const { viewMode, grouping, filters } = before.rows[0] ?? {};
    if (before.rows[0]) expect(listState.rows[0]).toEqual({ viewMode, grouping, filters });

    await page.reload();
    drawer = await openKpiDrawer(page, database, "Open pipeline");
    await expect(drawer.getByRole("columnheader")).toHaveCount(visibleBefore - 1);
    await drawer.locator("#widget-data-display-options").click();
    await expect(page.locator(`[id="${toggleId}"]`)).not.toBeChecked();
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
  } finally {
    await database.query('DELETE FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2 AND "userId"=$3', [
      DEMO_COMPANY_ID,
      DEAL_SURFACE,
      USER_ID,
    ]);
    for (const { row } of snapshot.rows)
      await database.query('INSERT INTO "P13n" SELECT * FROM json_populate_record(NULL::"P13n", $1::json)', [
        JSON.stringify(row),
      ]);
  }
});
