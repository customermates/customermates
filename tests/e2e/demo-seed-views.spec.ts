import type { Page } from "@playwright/test";
import { ALL_VIEW_KEY } from "../../core/data-view/data-view-keys";

import {
  DEMO_COMPANY_ID,
  DEMO_MEMBERS,
  type DemoMember,
  demoId,
  expect,
  memberPage,
  settle,
  test,
} from "./demo-seed";
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
async function expectViewShowsData(
  page: Page,
  view: SeededView,
  isMobile: boolean,
) {
  // Let the previous view finish loading its lazy chunks, so leaving it does not abort them mid-load.
  await settle(page);
  await page.goto(`/en/records/${view.typeId}?view=${view.id}`);
  await expect(
    page
      .locator("[data-joins-top-bar]")
      .getByText(view.name, { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(/^No records yet$|^No records match/),
  ).toHaveCount(0);
  const records = page.locator("[data-row-id], [data-item-id]");
  await expect(records.first(), `${view.name} shows records`).toBeVisible();
  // Phone rows show no group bands or group summaries (an accepted gap), so the phone checks stop at the records.
  if (!view.grouping?.field || isMobile) return;
  const summaries = view.grouping.summaries ?? [];
  if (view.viewMode === "card") {
    const columns = page.locator("[data-group-key]");
    await expect(
      columns.first(),
      `${view.name} shows board columns`,
    ).toBeVisible();
    if (summaries.length === 0) return;
    const totals = page.locator("[data-group-total]");
    await expect(
      totals.first(),
      `${view.name} shows column totals`,
    ).toBeVisible();
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
  await expect(totals, `${view.name} shows group summaries`).toHaveCount(
    summaries.length,
  );
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

const LISTS = [
  "Contacts",
  "Organizations",
  "Deals",
  "Products and services",
  "Tasks",
  "Subscriptions",
  "Onboarding projects",
  "Tickets",
  "Campaigns",
  "Partners",
  "Open roles",
  "Candidates",
];

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
      (view) =>
        view.typeId === rows[0]?.id &&
        view.userId === DEMO_MEMBERS.maxBergmann.userId,
    );
    expect(
      views.length,
      `${list} has two to four saved views`,
    ).toBeGreaterThanOrEqual(2);
    expect(views.length).toBeLessThanOrEqual(4);
    for (const view of views)
      await expectViewShowsData(
        page,
        view,
        Boolean(testInfo.project.use.isMobile),
      );
    expect(errors).toEqual([]);
  });
}

test("the All view of every list shows records for the admin", async ({
  page,
  database,
  errors,
}) => {
  const { rows } = await database.query<{ id: string; pluralLabel: string }>(
    `SELECT id, "pluralLabel" FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND "pluralLabel" = ANY($2)`,
    [DEMO_COMPANY_ID, LISTS],
  );
  expect(rows.map(({ pluralLabel }) => pluralLabel).sort()).toEqual(
    [...LISTS].sort(),
  );
  for (const list of rows) {
    await settle(page);
    await page.goto(`/en/records/${list.id}?view=${ALL_VIEW_KEY}`);
    await expect(
      page.getByText(/^No records yet$|^No records match/),
    ).toHaveCount(0);
    const records = page.locator("[data-row-id], [data-item-id]");
    await expect(
      records.first(),
      `${list.pluralLabel} All shows records`,
    ).toBeVisible();
    expect(
      await records.count(),
      `${list.pluralLabel} All shows more than 0 rows`,
    ).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test("members open their personal seeded views with records", async ({
  browser,
  database,
}, testInfo) => {
  const views = (await seededViews(database)).filter(
    (view) => view.userId !== DEMO_MEMBERS.maxBergmann.userId,
  );
  const owners = Object.entries(DEMO_MEMBERS) as Array<
    [DemoMember, { userId: string }]
  >;
  expect(views.map((view) => view.name).sort()).toEqual([
    "My interviews",
    "My open deals",
    "My open deals",
    "My queue",
    "My renewals",
  ]);
  for (const view of views) {
    const owner = owners.find(([, member]) => member.userId === view.userId);
    if (!owner)
      throw new Error(`The view ${view.name} belongs to no seeded member`);
    const member = await memberPage(browser, database, owner[0], testInfo);
    try {
      await expectViewShowsData(
        member.page,
        view,
        Boolean(testInfo.project.use.isMobile),
      );
      expect(member.errors).toEqual([]);
    } finally {
      await member.close();
    }
  }
});

test("seeded views and pins stay curated for an overview: at most five card chips and five pins", async ({
  page,
  database,
  errors,
}, testInfo) => {
  const deals = demoId("deal");
  const { rows: pipeline } = await database.query<{ id: string }>(
    `SELECT id FROM "DataView" WHERE "companyId"=$1 AND "surfaceKey"=$2 AND name='Pipeline' AND "userId"=$3`,
    [DEMO_COMPANY_ID, `records:${deals}`, DEMO_MEMBERS.maxBergmann.userId],
  );
  await page.goto(`/en/records/${deals}?view=${pipeline[0]?.id}`);
  const card = page.locator("[data-item-id], [data-row-id]").first();
  await expect(card).toBeVisible();
  await expect(card.locator("[data-chip-column]").first()).toBeVisible();
  const chips = await card.locator("[data-chip-column]").count();
  expect(
    chips,
    "a Deals board card shows at most five chips",
  ).toBeLessThanOrEqual(5);
  // The when-chip shows the date the deal was opened (open deals have no close date yet).
  await expect(
    card.locator(`[data-chip-column="${demoId("deal.openedOn")}"]`),
  ).toContainText(/\d/);
  await page.screenshot({ path: testInfo.outputPath("deals-board.png") });

  await settle(page);
  const { rows: forecast } = await database.query<{ id: string }>(
    `SELECT id FROM "DataView" WHERE "companyId"=$1 AND "surfaceKey"=$2 AND name='Forecast'`,
    [DEMO_COMPANY_ID, `records:${deals}`],
  );
  await page.goto(`/en/records/${deals}?view=${forecast[0]?.id}`);
  await expect(page.locator("[data-row-id]").first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("deals-forecast-table.png"),
  });

  const { rows: pins } = await database.query<{
    p13nId: string;
    pinned: number;
  }>(
    `SELECT "p13nId", jsonb_array_length("detailOptions"->'starredFieldIds')::int AS pinned FROM "P13n"
     WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId" LIKE 'record-detail:%'`,
    [DEMO_COMPANY_ID, DEMO_MEMBERS.maxBergmann.userId],
  );
  expect(pins.length, "every list pins fields on its record page").toBe(
    LISTS.length,
  );
  for (const { p13nId, pinned } of pins)
    expect(pinned, `${p13nId} pins at most five fields`).toBeLessThanOrEqual(5);

  await settle(page);
  const { rows: record } = await database.query<{ id: string }>(
    `SELECT "recordId" AS id FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2 ORDER BY "recordId" LIMIT 1`,
    [DEMO_COMPANY_ID, demoId("deal.closeDate")],
  );
  await page.goto(`/en/records/${deals}/${record[0]?.id}`);
  // Pinned fields show even when empty, so the band settles on exactly the deal pins.
  const dealPins =
    pins.find(({ p13nId }) => p13nId === `record-detail:${deals}`)?.pinned ?? 0;
  expect(dealPins, "a deal pins three to five fields").toBeGreaterThanOrEqual(
    3,
  );
  await expect(
    page.locator("[data-record-chip-row] [data-chip-column]"),
  ).toHaveCount(dealPins);
  const openedOn = page.locator(
    `[data-record-chip-row] [data-chip-column="${demoId("deal.openedOn")}"]`,
  );
  await expect(openedOn).toContainText(/\d/);
  await page.screenshot({ path: testInfo.outputPath("deal-record.png") });
  expect(errors).toEqual([]);
});

test("opening a list and switching its views updates no component while another renders", async ({
  page,
  database,
  errors,
}) => {
  const deals = demoId("deal");
  const views = (await seededViews(database)).filter(
    (view) =>
      view.typeId === deals && view.userId === DEMO_MEMBERS.maxBergmann.userId,
  );
  expect(
    views.length,
    "Deals has saved views to switch",
  ).toBeGreaterThanOrEqual(2);
  await page.goto("/en/dashboard");
  await openSidebar(page);
  await page.locator(`[id="nav-records:${deals}"]`).click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`/en/records/${deals}`);
  const rail = page.locator("#global-data-views");
  const records = page.locator("[data-row-id], [data-item-id]");
  await expect(records.first()).toBeVisible();
  for (const view of views) {
    await settle(page);
    const chip = rail
      .locator("a[data-view-chip]", { hasText: view.name })
      .first();
    await chip.click();
    await expect(chip).toHaveAttribute("aria-current", "page");
    await expect(records.first(), `${view.name} shows records`).toBeVisible();
  }
  await settle(page);
  const all = page.locator("#global-data-views-all");
  await all.click();
  await expect(all).toHaveAttribute("aria-current", "page");
  await expect(records.first()).toBeVisible();
  await settle(page);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await settle(page);
  await expect(records.first()).toBeVisible();
  expect(
    errors.filter((error) => error.includes("Cannot update a component")),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
