import type { Page } from "@playwright/test";

import { DEMO_COMPANY_ID, DEMO_MEMBERS, type DemoMember, expect, memberPage, test } from "./demo-seed";

type SeededView = {
  id: string;
  name: string;
  typeId: string;
  userId: string;
  viewMode: string;
  grouping: { field?: string; summaries?: Array<{ fieldId: string; aggregation: string }> } | null;
};

const AGGREGATION_LABELS: Record<string, string> = {
  sum: "Sum",
  average: "Average",
  min: "Minimum",
  max: "Maximum",
};

/** Opens a seeded saved view and checks it shows records, its groups and the configured group totals. */
async function expectViewShowsData(page: Page, view: SeededView, isMobile: boolean) {
  await page.goto(`/en/records/${view.typeId}?view=${view.id}`);
  await expect(page.locator("[data-joins-top-bar]").getByText(view.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^No records yet$|^No records match/)).toHaveCount(0);
  const records = page.locator("[data-row-id], [data-item-id]");
  await expect(records.first(), `${view.name} shows records`).toBeVisible();
  if (!view.grouping?.field) return;
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
  if (isMobile && (await groups.count()) === 0) return;
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
      (view) => view.typeId === rows[0]?.id && view.userId === DEMO_MEMBERS.maxBergmann.userId,
    );
    expect(views.length, `${list} has two to four saved views`).toBeGreaterThanOrEqual(2);
    expect(views.length).toBeLessThanOrEqual(4);
    for (const view of views) await expectViewShowsData(page, view, Boolean(testInfo.project.use.isMobile));
    expect(errors).toEqual([]);
  });
}

test("members open their personal seeded views with records", async ({ browser, database }, testInfo) => {
  const views = (await seededViews(database)).filter((view) => view.userId !== DEMO_MEMBERS.maxBergmann.userId);
  const owners = Object.entries(DEMO_MEMBERS) as Array<[DemoMember, { userId: string }]>;
  expect(views.map((view) => view.name).sort()).toEqual([
    "My interviews",
    "My open deals",
    "My open deals",
    "My queue",
    "My renewals",
  ]);
  for (const view of views) {
    const owner = owners.find(([, member]) => member.userId === view.userId);
    if (!owner) throw new Error(`The view ${view.name} belongs to no seeded member`);
    const member = await memberPage(browser, database, owner[0], testInfo);
    try {
      await expectViewShowsData(member.page, view, Boolean(testInfo.project.use.isMobile));
      expect(member.errors).toEqual([]);
    } finally {
      await member.close();
    }
  }
});
