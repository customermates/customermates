import type { Client } from "pg";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  collectErrors,
  itemMenu,
  openCustomize,
  openSidebar,
  sectionMenu,
  sidebarItem,
  sidebarOrder,
  sidebarSection,
} from "./sidebar";

async function storedLayout(database: Client, userId: string) {
  const result = await database.query<{ settings: unknown }>(
    'SELECT settings FROM "P13n" WHERE "userId"=$1 AND "p13nId"=\'sidebar\'',
    [userId],
  );
  return result.rows[0]?.settings ?? null;
}

async function nameNewSection(page: Page, name: string) {
  const input = page.getByRole("textbox", { name: "Section name" });
  await expect(input).toBeFocused();
  await input.fill(name);
  await input.press("Enter");
  await expect(sidebarSection(page, name)).toBeVisible();
}

test("deleting a personal section asks first and returns its items to their default place", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectErrors(page);
  const touch = testInfo.project.name === "mobile";
  await page.goto("/en/dashboard");
  await page.waitForLoadState("networkidle");
  await openSidebar(page);
  const initial = await sidebarOrder(page);

  await (await itemMenu(page, "Contacts")).getByRole("menuitem", { name: "Move to section", exact: true }).click();
  await page.getByRole("menuitem", { name: "New section", exact: true }).click();
  await nameNewSection(page, "Pipeline");
  await (await itemMenu(page, "Deals")).getByRole("menuitem", { name: "Move to section", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pipeline", exact: true }).click();
  await (await itemMenu(page, "Deals")).getByRole("menuitem", { name: "Hide from sidebar", exact: true }).click();
  await expect(sidebarItem(page, "Deals")).toHaveCount(0);

  if (touch) await (await sectionMenu(page, "Pipeline")).getByRole("menuitem", { name: "Delete section" }).click();
  else {
    await sidebarSection(page, "Pipeline")
      .getByRole("button", { name: "Pipeline", exact: true })
      .click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Delete section", exact: true }).click();
  }
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Delete section “Pipeline”?");
  await expect(confirm).toContainText("hidden items stay hidden");
  await expect(confirm).toContainText("Contacts moves back to Data");
  await expect(confirm).toContainText("Deals moves back to Data");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(sidebarSection(page, "Pipeline")).toBeVisible();

  await (await sectionMenu(page, "Pipeline")).getByRole("menuitem", { name: "Delete section", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete section", exact: true }).click();
  await expect(sidebarSection(page, "Pipeline")).toHaveCount(0);
  await openSidebar(page);
  const order = await sidebarOrder(page);
  expect(order.slice(order.indexOf("#Data"), order.indexOf("#Data") + 3)).toEqual([
    "#Data",
    "Contacts",
    "Organizations",
  ]);
  await expect(sidebarItem(page, "Deals")).toHaveCount(0);
  await expect
    .poll(() => storedLayout(database, workspace.userId))
    .toMatchObject({ hidden: [expect.stringMatching(/^records:/)] });

  const dialog = await openCustomize(page);
  await expect(dialog.getByRole("switch", { name: "Show Deals" })).not.toBeChecked();
  await dialog.getByRole("switch", { name: "Show Deals" }).click();
  await page.getByRole("button", { name: "Reset to default", exact: true }).click();
  const reset = page.getByRole("alertdialog");
  await expect(reset).toContainText("Other people's sidebars are not affected.");
  await reset.getByRole("button", { name: "Reset to default", exact: true }).click();
  await expect.poll(() => storedLayout(database, workspace.userId)).toBeNull();
  await openSidebar(page);
  await expect.poll(() => sidebarOrder(page)).toEqual(initial);
  expect(errors).toEqual([]);
});

test("the customize dialog creates, renames and deletes empty personal sections", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectErrors(page);
  await page.goto("/en/dashboard");
  await page.waitForLoadState("networkidle");

  let dialog = await openCustomize(page);
  await expect(page.getByRole("button", { name: "Reset to default", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New section", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await nameNewSection(page, "Later");
  await expect(sidebarSection(page, "Later")).toContainText("Drag items here or use Move to section");

  dialog = await openCustomize(page);
  const later = dialog.locator('[data-customize-section="Later"]');
  await expect(later).toContainText("Drag items here or use Move to section");
  await later.getByRole("button", { name: "Options for Later", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await nameNewSection(page, "Someday");

  dialog = await openCustomize(page);
  await dialog
    .locator('[data-customize-section="Someday"]')
    .getByRole("button", { name: "Options for Someday" })
    .click();
  await page.getByRole("menuitem", { name: "Delete section", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("The section is empty, so no items move.");
  await confirm.getByRole("button", { name: "Delete section", exact: true }).click();
  await openSidebar(page);
  await expect(sidebarSection(page, "Someday")).toHaveCount(0);
  await expect
    .poll(async () => JSON.stringify(await storedLayout(database, workspace.userId)))
    .not.toContain("Someday");
  expect(errors).toEqual([]);
});
