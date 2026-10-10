import type { Locator, Page } from "@playwright/test";
import type { Client } from "pg";

import { presetId } from "../../features/records/crm-preset";
import { openConfigure, saveGeneral } from "./configure";
import { secondUser } from "./second-user";
import { expect, test } from "./fixtures";
import { collectErrors, itemMenu, openCustomize, openSidebar, sectionMenu, sidebarItem, sidebarOrder } from "./sidebar";

async function dragOnto(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Drag source and target must be visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 2, { steps: 2 });
  await page.mouse.up();
}

async function storedLayout(database: Client, userId: string) {
  const result = await database.query<{ settings: unknown }>(
    'SELECT settings FROM "P13n" WHERE "userId"=$1 AND "p13nId"=\'sidebar\'',
    [userId],
  );
  return result.rows[0]?.settings ?? null;
}

const DEFAULT_DATA = ["#Data", "Contacts", "Organizations", "Deals", "Services", "Tasks", "Configure"];

test("each person customizes their own sidebar and others keep the default", async ({
  page,
  browser,
  database,
  workspace,
  companyId,
}, testInfo) => {
  const errors = collectErrors(page);
  const touch = testInfo.project.name === "mobile";
  await page.goto("/en/dashboard");
  await page.waitForLoadState("networkidle");
  await openSidebar(page);
  const initial = await sidebarOrder(page);
  expect(initial).toEqual(expect.arrayContaining(["#Overview", "Dashboard"]));
  expect(initial).not.toContain("#Workspace");
  expect(initial).not.toContain("#Admin");
  expect(initial.slice(initial.indexOf("#Data"), initial.indexOf("#Data") + DEFAULT_DATA.length)).toEqual(DEFAULT_DATA);
  expect(initial).not.toContain("#CRM");

  await (await itemMenu(page, "Tasks")).getByRole("menuitem", { name: "Move up", exact: true }).click();
  if (touch) await (await itemMenu(page, "Deals")).getByRole("menuitem", { name: "Move up", exact: true }).click();
  else await dragOnto(page, sidebarItem(page, "Deals"), sidebarItem(page, "Contacts"));
  await expect
    .poll(async () => (await sidebarOrder(page)).filter((entry) => DEFAULT_DATA.includes(entry)))
    .toEqual(
      touch
        ? ["#Data", "Contacts", "Deals", "Organizations", "Tasks", "Services", "Configure"]
        : ["#Data", "Deals", "Contacts", "Organizations", "Tasks", "Services", "Configure"],
    );

  const menu = await itemMenu(page, "Organizations");
  await menu.getByRole("menuitem", { name: "Move to section", exact: true }).click();
  await page.getByRole("menuitem", { name: "New section", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Section name" });
  await name.fill("Accounts");
  await name.press("Enter");
  await expect(page.locator('[data-sidebar-section-label="Accounts"]')).toBeVisible();
  await (await itemMenu(page, "Contacts")).getByRole("menuitem", { name: "Move to section", exact: true }).click();
  await page.getByRole("menuitem", { name: "Accounts", exact: true }).click();
  await expect
    .poll(async () => {
      const order = await sidebarOrder(page);
      return order.slice(order.indexOf("#Accounts"), order.indexOf("#Accounts") + 3);
    })
    .toEqual(["#Accounts", "Organizations", "Contacts"]);

  await page
    .locator('[data-sidebar-section-label="Accounts"]')
    .getByRole("button", { name: "Accounts", exact: true })
    .click();
  await expect(sidebarItem(page, "Contacts")).toBeHidden();
  await (await itemMenu(page, "Inbox")).getByRole("menuitem", { name: "Hide from sidebar", exact: true }).click();
  await expect(sidebarItem(page, "Inbox")).toHaveCount(0);

  await expect.poll(() => storedLayout(database, workspace.userId)).toMatchObject({ hidden: ["inbox"] });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await openSidebar(page);
  await expect(page.locator('[data-sidebar-section-label="Accounts"]')).toBeVisible();
  await expect(sidebarItem(page, "Contacts")).toBeHidden();
  await expect(sidebarItem(page, "Inbox")).toHaveCount(0);

  await openCustomize(page);
  await page.getByRole("switch", { name: "Show Inbox" }).click();
  await page.keyboard.press("Escape");
  await openSidebar(page);
  await expect(sidebarItem(page, "Inbox")).toBeVisible();

  await (await sectionMenu(page, "Accounts")).getByRole("menuitem", { name: "Delete section", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Its items move to the top level of your sidebar");
  await expect(confirm).toContainText("Organizations");
  await expect(confirm).toContainText("Contacts");
  await confirm.getByRole("button", { name: "Delete section", exact: true }).click();
  await expect(page.locator('[data-sidebar-section-label="Accounts"]')).toHaveCount(0);
  await expect(sidebarItem(page, "Contacts")).toBeVisible();
  await expect(sidebarItem(page, "Organizations")).toBeVisible();

  const other = await secondUser(browser, database, companyId, testInfo);
  try {
    await other.page.goto("/en/dashboard");
    await other.page.waitForLoadState("networkidle");
    await openSidebar(other.page);
    expect(await sidebarOrder(other.page)).toEqual(initial);
    expect(other.errors).toEqual([]);
  } finally {
    await other.close();
  }

  await openCustomize(page);
  await page.getByRole("button", { name: "Reset to default", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset to default", exact: true }).click();
  await openSidebar(page);
  await expect.poll(() => sidebarOrder(page)).toEqual(initial);
  await expect.poll(() => storedLayout(database, workspace.userId)).toBeNull();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await openSidebar(page);
  expect(await sidebarOrder(page)).toEqual(initial);
  expect(errors).toEqual([]);
});

test("the list icon picker offers a searchable grid", async ({ page, database, companyId }) => {
  const errors = collectErrors(page);
  const taskId = presetId(companyId, "task");
  await openConfigure(page, taskId);
  await page.locator("#configure-general-icon").click();
  const search = page.getByRole("textbox", { name: "Search icons" });
  await expect(search).toBeFocused();
  await expect(page.getByRole("toolbar", { name: "Choose icon" }).getByRole("button")).toHaveCount(99);
  await search.fill("invoice");
  await expect(page.getByRole("toolbar", { name: "Choose icon" }).getByRole("button")).toHaveCount(1);
  await search.press("Enter");
  await expect(page.locator("#configure-general-icon")).toHaveText("Invoice");
  await saveGeneral(page);
  const stored = await database.query<{ icon: string }>(
    'SELECT definition->>\'icon\' AS icon FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2',
    [companyId, taskId],
  );
  expect(stored.rows[0]?.icon).toBe("receipt");
  expect(errors).toEqual([]);
});
