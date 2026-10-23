import type { Page } from "@playwright/test";
import { ALL_VIEW_KEY } from "../../core/data-view/data-view-keys";

import { appPath } from "./app-paths";
import { DEMO_COMPANY_ID, DEMO_SLUG, DEMO_CONTENT, DEMO_LISTS, DEMO_MEMBERS, demoId, expect, test } from "./demo-seed";
import { openSidebar } from "./sidebar";

type SeededView = {
  id: string;
  name: string;
  typeId: string;
  userId: string;
  viewMode: string;
  grouping: {
    field?: string;
    summaries?: Array<{ fieldId: string; aggregation: string }>;
  } | null;
};

const AGGREGATION_LABELS: Record<string, string> = {
  sum: "Sum",
  average: "Average",
  min: "Minimum",
  max: "Maximum",
};

/** Opens a seeded saved view and checks it shows records, its groups and the configured group totals. */
async function expectViewShowsData(page: Page, view: SeededView, isMobile: boolean) {
  await page.goto(appPath(DEMO_SLUG, `/records/${view.typeId}?view=${view.id}`));
  await expect(page.locator("[data-joins-top-bar]").getByText(view.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^No records yet$|^No records match/)).toHaveCount(0);
  const records = page.locator("[data-row-id], [data-item-id]");
  await expect(records.first(), `${view.name} shows records`).toBeVisible();
  // Phone rows show no group bands or group summaries (an accepted gap), so the phone checks stop at the records.
  if (!view.grouping?.field || isMobile) return;
  const summaries = view.grouping.summaries ?? [];
  if (view.viewMode === "card") {
    const columns = page.locator("[data-group-key]");
    await expect(columns.first(), `${view.name} shows board columns`).toBeVisible();
    if (summaries.length === 0) return;
    const totals = page.locator("[data-group-total]");
    await expect(totals.first(), `${view.name} shows column totals`).toBeVisible();
    for (const summary of summaries)
      await expect(totals.first()).toHaveAttribute(
        "aria-label",
        new RegExp(`${AGGREGATION_LABELS[summary.aggregation]}: `),
      );
    return;
  }
  const groups = page.locator('[data-slot="group-header-row"]');
  await expect(groups.first(), `${view.name} shows groups`).toBeVisible();
  if (summaries.length === 0) return;
  const totals = groups.first().locator('[aria-label*=" · "]');
  await expect(totals, `${view.name} shows group summaries`).toHaveCount(summaries.length);
  for (const [index, summary] of summaries.entries())
    await expect(totals.nth(index)).toHaveAttribute(
      "aria-label",
      new RegExp(` · ${AGGREGATION_LABELS[summary.aggregation]}: `),
    );
}

async function seededViews(database: import("pg").Client) {
  const { rows } = await database.query<SeededView>(
    `SELECT id, name, substring("surfaceKey" from 9) AS "typeId", "userId", "viewMode", grouping FROM "DataView"
     WHERE "companyId"=$1 AND id LIKE '1f100000-%' AND "surfaceKey" LIKE 'records:%' AND "deletedAt" IS NULL
     ORDER BY "surfaceKey", position`,
    [DEMO_COMPANY_ID],
  );
  return rows;
}

const LISTS = DEMO_LISTS;

for (const list of LISTS) {
  test(`every seeded ${list} view of the admin opens with records, groups and totals`, async ({
    page,
    database,
    errors,
  }, testInfo) => {
    const { rows } = await database.query<{ id: string }>(
      `SELECT id FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND "pluralLabel"=$2`,
      [DEMO_COMPANY_ID, list],
    );
    const views = (await seededViews(database)).filter(
      (view) => view.typeId === rows[0]?.id && view.userId === DEMO_MEMBERS.maxBergmann.userId,
    );
    const listKey = DEMO_CONTENT.lists.find(({ pluralLabel }) => pluralLabel === list)?.key;
    expect(
      views.map(({ name }) => name),
      `${list} has its seeded saved views`,
    ).toEqual(DEMO_CONTENT.views.filter((view) => view.list === listKey).map(({ name }) => name));
    expect(views.length).toBeGreaterThanOrEqual(1);
    for (const view of views) await expectViewShowsData(page, view, Boolean(testInfo.project.use.isMobile));
    expect(errors).toEqual([]);
  });
}

test("the All view of every list shows records for the admin", async ({ page, database, errors }) => {
  const { rows } = await database.query<{ id: string; pluralLabel: string }>(
    `SELECT id, "pluralLabel" FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND "pluralLabel" = ANY($2)`,
    [DEMO_COMPANY_ID, LISTS],
  );
  expect(rows.map(({ pluralLabel }) => pluralLabel).sort()).toEqual([...LISTS].sort());
  for (const list of rows) {
    await page.goto(appPath(DEMO_SLUG, `/records/${list.id}?view=${ALL_VIEW_KEY}`));
    await expect(page.getByText(/^No records yet$|^No records match/)).toHaveCount(0);
    const records = page.locator("[data-row-id], [data-item-id]");
    await expect(records.first(), `${list.pluralLabel} All shows records`).toBeVisible();
    expect(await records.count(), `${list.pluralLabel} All shows more than 0 rows`).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test("the seeded views belong to Max: members start without saved views", async ({ database }) => {
  const views = await seededViews(database);
  expect(views.map(({ name }) => name).sort()).toEqual(DEMO_CONTENT.views.map(({ name }) => name).sort());
  expect(views.filter((view) => view.userId !== DEMO_MEMBERS.maxBergmann.userId)).toEqual([]);
});

test("seeded board views stay curated for an overview: at most five card chips", async ({
  page,
  database,
  errors,
}, testInfo) => {
  const deals = demoId("deal");
  const { rows: pipeline } = await database.query<{ id: string }>(
    `SELECT id FROM "DataView" WHERE "companyId"=$1 AND "surfaceKey"=$2 AND name=$3 AND "userId"=$4`,
    [DEMO_COMPANY_ID, `records:${deals}`, "Pipeline", DEMO_MEMBERS.maxBergmann.userId],
  );
  await page.goto(appPath(DEMO_SLUG, `/records/${deals}?view=${pipeline[0]?.id}`));
  const cards = page.locator("[data-item-id], [data-row-id]");
  await expect(cards.first()).toBeVisible();
  await expect(cards.first().locator("[data-chip-column]").first()).toBeVisible();
  for (const card of await cards.all())
    expect(
      await card.locator("[data-chip-column]").count(),
      "a Deals board card shows at most five chips",
    ).toBeLessThanOrEqual(5);
  // The when-chip shows the date of the deal's next step.
  await expect(page.locator(`[data-chip-column="${demoId("deal.nextStepDate")}"]`).first()).toContainText(/\d/);
  await page.screenshot({ path: testInfo.outputPath("deals-board.png") });

  const { rows: nextSteps } = await database.query<{ id: string }>(
    `SELECT id FROM "DataView" WHERE "companyId"=$1 AND "surfaceKey"=$2 AND name=$3`,
    [DEMO_COMPANY_ID, `records:${deals}`, "Next steps"],
  );
  await page.goto(appPath(DEMO_SLUG, `/records/${deals}?view=${nextSteps[0]?.id}`));
  await expect(page.locator("[data-row-id]").first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("deals-next-steps-table.png"),
  });
  expect(errors).toEqual([]);
});

test("opening a list and switching its views updates no component while another renders", async ({
  page,
  database,
  errors,
}) => {
  const deals = demoId("deal");
  const views = (await seededViews(database)).filter(
    (view) => view.typeId === deals && view.userId === DEMO_MEMBERS.maxBergmann.userId,
  );
  expect(views.length, "Deals has saved views to switch").toBeGreaterThanOrEqual(2);
  await page.goto(appPath(DEMO_SLUG, "/dashboard"));
  await openSidebar(page);
  await page.locator(`[id="nav-records:${deals}"]`).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(appPath(DEMO_SLUG, `/records/${deals}`));
  const rail = page.locator("#global-data-views");
  const records = page.locator("[data-row-id], [data-item-id]");
  await expect(records.first()).toBeVisible();
  for (const view of views) {
    const chip = rail.locator("a[data-view-chip]", { hasText: view.name }).first();
    await chip.click();
    await expect(chip).toHaveAttribute("aria-current", "page");
    await expect(records.first(), `${view.name} shows records`).toBeVisible();
  }
  const active = rail.locator('a[data-view-chip][aria-current="page"]');
  await expect(active).toHaveCount(1);
  await active.click();
  await expect(rail.locator('[data-focus-target^="view:"][aria-current="page"]')).toHaveCount(0);
  await expect(records.first()).toBeVisible();
  // Becoming visible again refreshes the route; wait for that refresh of this list.
  const refreshed = page.waitForResponse(
    (response) =>
      response.request().headers()["rsc"] === "1" && new URL(response.url()).pathname === appPath(DEMO_SLUG, `/records/${deals}`),
  );
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  expect((await refreshed).ok()).toBe(true);
  await expect(records.first()).toBeVisible();
  expect(errors.filter((error) => error.includes("Cannot update a component"))).toEqual([]);
  expect(errors).toEqual([]);
});
