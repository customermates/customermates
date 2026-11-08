import type { Page } from "@playwright/test";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { companyPath } from "./app-paths";
import { applyPaletteSearch } from "./filter-palette";
import { collectPageErrors, expect, test } from "./fixtures";
import { openViewsMenu, openViewsMenuItem } from "./views-menu";
import { addBrowserWorkspace } from "./workspace";
import { e2eAppMode, expectHydrated } from "./workspace-switching";

const views = englishMessages.DataView.views;

function rail(page: Page) {
  return page.locator("[data-joins-top-bar]");
}

async function saveDuplicate(page: Page, expectedName: string, name: string) {
  await openViewsMenuItem(page, views.duplicate);
  const nameInput = page.getByPlaceholder(views.namePlaceholder);
  await expect(nameInput).toHaveValue(expectedName);
  await nameInput.fill(name);
  await page.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
  const chip = rail(page).getByRole("link", { name, exact: true });
  await expect(chip).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/[?&]view=[0-9a-f-]{36}/);
  return new URL(page.url()).searchParams.get("view");
}

test("duplicates the All view of a list with its unsaved search, and leaves All unchanged", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "organization");
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  const all = rail(page).locator("#global-data-views-all");
  await expect(all).toHaveAttribute("aria-current", "page");
  const allName = (await all.innerText()).trim();

  const menu = await openViewsMenu(page);
  expect((await menu.getByRole("menuitem").allInnerTexts()).map((label) => label.trim())).toEqual([
    views.duplicate,
    views.copyLink,
  ]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await applyPaletteSearch(page, "records-filter", "Kessler");
  const copyId = await saveDuplicate(page, views.duplicateName.replace("{name}", allName), "Kessler accounts");

  const saved = await database.query(
    'SELECT name,"searchTerm" FROM "DataView" WHERE id=$1 AND "companyId"=$2 AND "userId"=$3 AND "deletedAt" IS NULL',
    [copyId, companyId, workspace.userId],
  );
  expect(saved.rows).toEqual([{ name: "Kessler accounts", searchTerm: "Kessler" }]);

  await all.click();
  await expect(all).toHaveAttribute("aria-current", "page");
  await expect(page).not.toHaveURL(/[?&]view=/);
  await expect(page).not.toHaveURL(/searchTerm=/);
  expect(errors).toEqual([]);
});

test("duplicates the main dashboard with its widgets into a new view", async ({ page, database, companyId, workspace }) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const dialog = page.getByRole("dialog");
  await page.goto(companyPath(companyId, "/dashboard"));
  const main = rail(page).locator("#global-data-views-all");
  await expect(main).toHaveText("Main");
  await expect(main).toHaveAttribute("aria-current", "page");

  await page.locator("#dashboard-add-widget").click();
  await dialog.locator("#widget-starter-number").click();
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Main number");
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Main number", exact: true })).toBeVisible();
  const mainWidgets = await database.query<{ name: string }>(
    'SELECT name FROM "Widget" WHERE "companyId"=$1 AND "userId"=$2 AND "viewId" IS NULL AND "deletedAt" IS NULL ORDER BY name',
    [companyId, workspace.userId],
  );
  expect(mainWidgets.rows.map((row) => row.name)).toContain("Main number");

  const copyId = await saveDuplicate(page, views.duplicateName.replace("{name}", "Main"), "Main backup");
  await expect(page.getByRole("heading", { name: "Main number", exact: true })).toBeVisible();

  const copied = await database.query<{ name: string; userId: string }>(
    'SELECT name,"userId" FROM "Widget" WHERE "companyId"=$1 AND "viewId"=$2 AND "deletedAt" IS NULL ORDER BY name',
    [companyId, copyId],
  );
  expect(copied.rows).toEqual(mainWidgets.rows.map((row) => ({ name: row.name, userId: workspace.userId })));
  const stillMain = await database.query(
    'SELECT name FROM "Widget" WHERE "companyId"=$1 AND "userId"=$2 AND "viewId" IS NULL AND "deletedAt" IS NULL ORDER BY name',
    [companyId, workspace.userId],
  );
  expect(stillMain.rows).toEqual(mainWidgets.rows);

  await main.click();
  await expect(main).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Main number", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an operator in several workspaces sees the view they just created in the operator console", async ({
  page,
  database,
  workspace,
}) => {
  test.skip(e2eAppMode() !== "cloud", "The operator console is cloud only");
  const errors = collectPageErrors(page);
  await database.query('UPDATE "AuthUser" SET "isPlatformOperator"=true WHERE id=$1', [workspace.authUserId]);
  const busier = await addBrowserWorkspace(database, workspace, "Busier operator workspace");
  await database.query('UPDATE "User" SET "lastActiveAt"=NOW()+interval \'1 day\' WHERE id=$1', [busier.userId]);

  await page.goto("/en/operator/workspaces");
  await expectHydrated(page.locator("#operator-workspaces-filter"));
  await rail(page).getByRole("button", { name: views.createTitle, exact: true }).click();
  await page.getByPlaceholder(views.namePlaceholder).fill("Paying workspaces");
  await page.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
  const chip = rail(page).getByRole("link", { name: "Paying workspaces", exact: true });
  await expect(chip).toHaveAttribute("aria-current", "page");

  const saved = await database.query<{ userId: string }>(
    'SELECT "userId" FROM "DataView" WHERE name=$1 AND "companyId"=ANY($2::text[]) AND "deletedAt" IS NULL',
    ["Paying workspaces", [workspace.companyId, busier.companyId]],
  );
  expect(saved.rows).toEqual([{ userId: workspace.userId }]);
  await page.reload();
  await expect(rail(page).getByRole("link", { name: "Paying workspaces", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
