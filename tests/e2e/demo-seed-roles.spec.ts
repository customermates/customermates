import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { DEMO_COMPANY_ID, DEMO_MEMBERS, type DemoMember, demoId, expect, memberPage, test } from "./demo-seed";
import { openSidebar } from "./sidebar";

/**
 * The seeded roles: each member sees the lists their role grants, deals follow the role's visibility, fields of
 * read-only lists explain why they cannot be edited, and only the admin can change the configuration.
 */
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

async function firstRecord(database: Client, typeKey: string, assignee?: DemoMember) {
  const { rows } = await database.query<{ id: string }>(
    `SELECT r.id FROM "CrmRecord" r WHERE r."companyId"=$1 AND r."typeId"=$2 AND r."deletedAt" IS NULL
       AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM "RecordAssignment" a WHERE a."companyId"=r."companyId"
         AND a."typeId"=r."typeId" AND a."recordId"=r.id AND a."userId"=$3))
     ORDER BY r.id LIMIT 1`,
    [DEMO_COMPANY_ID, demoId(typeKey), assignee ? DEMO_MEMBERS[assignee].userId : null],
  );
  if (!rows[0]) throw new Error(`No seeded ${typeKey} record${assignee ? ` assigned to ${assignee}` : ""}`);
  return rows[0].id;
}

async function expectSidebarLists(page: Page, visible: string[]) {
  await openSidebar(page);
  const items = page.locator("[data-sidebar-item]");
  for (const list of LISTS)
    await expect(items.filter({ has: page.getByText(list, { exact: true }) }), list).toHaveCount(
      visible.includes(list) ? 1 : 0,
    );
  await expect(items.filter({ has: page.getByText("Configure", { exact: true }) })).toHaveCount(0);
}

/** Configure opens as a read-only map for members: no list or field can be added and no list has actions. */
async function expectReadOnlyConfigure(page: Page) {
  await page.goto("/en/configure");
  await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Add to / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Configure actions", exact: true })).toHaveCount(0);
}

async function openRecord(page: Page, typeKey: string, recordId: string) {
  await page.goto(`/en/records/${demoId(typeKey)}/${recordId}`);
  const main = page.getByRole("main");
  const overview = main.getByRole("tab", { name: "Overview", exact: true });
  if (await overview.isVisible()) await overview.click();
  const name = main.locator(`[data-entity-field="${demoId(`${typeKey}.name`)}"] input`).first();
  await expect(name).toBeVisible();
  return name;
}

async function expectEditable(page: Page, typeKey: string, recordId: string) {
  const name = await openRecord(page, typeKey, recordId);
  await expect(name, `${typeKey} name is editable`).not.toHaveAttribute("readonly", "");
}

async function expectReadOnly(page: Page, typeKey: string, recordId: string) {
  const name = await openRecord(page, typeKey, recordId);
  await expect(name, `${typeKey} name is read-only`).toHaveAttribute("readonly", "");
  await name.focus();
  await expect(page.getByRole("tooltip", { name: "You can't edit this field", exact: true })).toBeVisible();
}

test("the sales lead sees every deal, campaigns and partners, and reads subscriptions", async ({
  browser,
  database,
}, testInfo) => {
  const member = await memberPage(browser, database, "sofiaRossi", testInfo);
  try {
    await member.page.goto("/en/dashboard");
    await expectSidebarLists(member.page, [
      "Contacts",
      "Organizations",
      "Deals",
      "Products and services",
      "Tasks",
      "Subscriptions",
      "Onboarding projects",
      "Campaigns",
      "Partners",
    ]);
    await expectEditable(member.page, "deal", await firstRecord(database, "deal", "claraNeumann"));
    await expectReadOnly(member.page, "subscription", await firstRecord(database, "subscription"));
    await expectReadOnlyConfigure(member.page);
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});

test("an account executive works only their own deals and reads subscriptions", async ({
  browser,
  database,
}, testInfo) => {
  const { rows } = await database.query<{ count: string }>(
    `SELECT count(*) FROM "RecordAssignment" a JOIN "CrmRecord" r ON r."companyId"=a."companyId"
       AND r."typeId"=a."typeId" AND r.id=a."recordId"
     WHERE a."companyId"=$1 AND a."typeId"=$2 AND a."userId"=$3 AND r."deletedAt" IS NULL`,
    [DEMO_COMPANY_ID, demoId("deal"), DEMO_MEMBERS.claraNeumann.userId],
  );
  const own = Number(rows[0].count);
  expect(own).toBeGreaterThan(5);
  const member = await memberPage(browser, database, "claraNeumann", testInfo);
  try {
    await member.page.goto("/en/dashboard");
    await expectSidebarLists(member.page, [
      "Contacts",
      "Organizations",
      "Deals",
      "Products and services",
      "Tasks",
      "Subscriptions",
      "Campaigns",
      "Partners",
    ]);
    await member.page.goto(`/en/records/${demoId("deal")}`);
    const rowsShown = member.page.locator("[data-row-id], [data-item-id]");
    await expect(rowsShown.first()).toBeVisible();
    await expect(rowsShown, "only the deals assigned to Clara").toHaveCount(own);
    await expectEditable(member.page, "deal", await firstRecord(database, "deal", "claraNeumann"));
    await expectReadOnly(member.page, "subscription", await firstRecord(database, "subscription"));
    await expectReadOnlyConfigure(member.page);
    expect(member.errors).toEqual([]);

    // Another rep's deal stays private: its record page does not show it.
    const foreign = await firstRecord(database, "deal", "sofiaRossi");
    const { rows: names } = await database.query<{ name: string }>(
      `SELECT "textValue" AS name FROM "RecordValue" WHERE "companyId"=$1 AND "recordId"=$2 AND "fieldId"=$3`,
      [DEMO_COMPANY_ID, foreign, demoId("deal.name")],
    );
    await member.page.goto(`/en/records/${demoId("deal")}/${foreign}`);
    await expect(member.page.getByRole("main")).toBeVisible();
    await expect(member.page.getByText(names[0].name, { exact: true })).toHaveCount(0);
  } finally {
    await member.close();
  }
});

test("customer success runs subscriptions and tickets and reads deals", async ({ browser, database }, testInfo) => {
  const member = await memberPage(browser, database, "elenaHoffmann", testInfo);
  try {
    await member.page.goto("/en/dashboard");
    await expectSidebarLists(member.page, [
      "Contacts",
      "Organizations",
      "Deals",
      "Products and services",
      "Tasks",
      "Subscriptions",
      "Onboarding projects",
      "Tickets",
    ]);
    await expectEditable(member.page, "subscription", await firstRecord(database, "subscription"));
    await expectEditable(member.page, "ticket", await firstRecord(database, "ticket"));
    await expectReadOnly(member.page, "deal", await firstRecord(database, "deal", "sofiaRossi"));
    await expectReadOnlyConfigure(member.page);
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});

test("support handles tickets and reads the accounts behind them, without deals", async ({
  browser,
  database,
}, testInfo) => {
  const member = await memberPage(browser, database, "kianRahimi", testInfo);
  try {
    await member.page.goto("/en/dashboard");
    await expectSidebarLists(member.page, ["Contacts", "Organizations", "Tasks", "Subscriptions", "Tickets"]);
    await expectEditable(member.page, "ticket", await firstRecord(database, "ticket"));
    await expectReadOnly(member.page, "organization", await firstRecord(database, "organization"));
    await expectReadOnly(member.page, "subscription", await firstRecord(database, "subscription"));
    await expectReadOnlyConfigure(member.page);
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});

test("people and operations run hiring without customer or deal data", async ({ browser, database }, testInfo) => {
  const member = await memberPage(browser, database, "lauraFischer", testInfo);
  try {
    await member.page.goto("/en/dashboard");
    await expectSidebarLists(member.page, ["Tasks", "Open roles", "Candidates"]);
    await expectEditable(member.page, "candidate", await firstRecord(database, "candidate"));
    await expectEditable(member.page, "openRole", await firstRecord(database, "openRole"));
    await expectReadOnlyConfigure(member.page);
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});

test("the admin sees every list and can change the configuration", async ({ page, errors }) => {
  await page.goto("/en/dashboard");
  await openSidebar(page);
  for (const list of LISTS)
    await expect(page.locator("[data-sidebar-item]").getByText(list, { exact: true })).toBeVisible();
  await expect(page.locator("[data-sidebar-item]").getByText("Configure", { exact: true })).toBeVisible();
  await page.goto("/en/configure");
  await expect(page.getByRole("button", { name: "Add to Deals", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
