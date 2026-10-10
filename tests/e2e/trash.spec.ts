import type { Page } from "@playwright/test";

import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

async function addServices(page: Page, typeId: string, names: string[]) {
  await page.goto(`/en/records/${typeId}`);
  const dialog = page.getByRole("dialog");
  for (const name of names) {
    await page.locator("#records-add").click();
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
    await dialog.getByRole("textbox", { name: "Price", exact: false }).fill("10");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
}

async function deleteFromRow(page: Page, name: string) {
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
  await row.hover();
  await row.getByRole("button", { name: `More actions for ${name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("It moves to Trash");
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
}

function trashRow(page: Page, name: string) {
  return page.getByRole("row").filter({ hasText: name });
}

test("undoes a record delete from the toast", async ({ page, companyId }, testInfo) => {
  const errors = collectErrors(page);
  const typeId = presetId(companyId, "service");
  await addServices(page, typeId, ["Undo Service"]);
  await deleteFromRow(page, "Undo Service");
  await expect(page.getByRole("link", { name: "Undo Service", exact: true })).not.toBeVisible();
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Moved to Trash" });
  await expect(toast).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("trash-undo-toast.png"), animations: "disabled" });
  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "1 item restored" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Undo Service", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("restores a deleted record from Trash and shows a trashed record read only", async ({
  page,
  companyId,
}, testInfo) => {
  const errors = collectErrors(page);
  const typeId = presetId(companyId, "service");
  await addServices(page, typeId, ["Restore Service"]);
  await deleteFromRow(page, "Restore Service");

  await page.locator("#nav-trash").click();
  await expect(page).toHaveURL(/\/en\/trash/);
  const row = trashRow(page, "Restore Service");
  await expect(row).toContainText("Record in Services");
  await expect(row).toContainText("Browser Administrator");
  await expect(row).toContainText("Deletes permanently in 30 days");
  for (const [width, height, name] of [
    [1280, 800, "desktop"],
    [390, 844, "phone"],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.screenshot({ path: testInfo.outputPath(`trash-page-${name}-${scheme}.png`), animations: "disabled" });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });

  await row.getByRole("link", { name: "Restore Service", exact: false }).first().click();
  const banner = page.locator("[data-record-trash-banner]");
  await expect(banner).toContainText("In Trash");
  await expect(banner).toContainText("Deletes permanently in 30 days");
  await expect(page.getByRole("main").getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(page.getByRole("main").locator("[aria-busy=true]")).toHaveCount(0);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: testInfo.outputPath(`trash-record-banner-${scheme}.png`), animations: "disabled" });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask AI", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Customize", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(banner).not.toBeVisible();

  await page.goto(`/en/records/${typeId}`);
  await expect(page.getByRole("link", { name: "Restore Service", exact: true })).toBeVisible();
  await page.goto("/en/trash");
  await expect(trashRow(page, "Restore Service")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("deletes a record permanently after confirming what disappears", async ({ page, companyId, database }) => {
  const errors = collectErrors(page);
  const typeId = presetId(companyId, "service");
  await addServices(page, typeId, ["Gone Service"]);
  await deleteFromRow(page, "Gone Service");
  await page.goto("/en/trash");
  const row = trashRow(page, "Gone Service");
  await row.hover();
  await row.getByRole("button", { name: "More actions for Gone Service", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete permanently", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Delete Gone Service permanently?");
  await expect(confirmation).toContainText("Services: 1 record");
  await expect(confirmation).toContainText("This cannot be undone.");
  await confirmation.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(row).toHaveCount(0);
  const remaining = await database.query(
    'SELECT count(*)::int AS count FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2 AND "textValue"=$3',
    [companyId, presetId(companyId, "service.name"), "Gone Service"],
  );
  expect(remaining.rows[0].count).toBe(0);
  expect(errors).toEqual([]);
});

test("restores and deletes permanently in bulk and empties the trash", async ({ page, companyId }, testInfo) => {
  const errors = collectErrors(page);
  const typeId = presetId(companyId, "service");
  const names = ["Bulk One", "Bulk Two", "Bulk Three", "Bulk Four"];
  await addServices(page, typeId, names);
  for (const name of names) await deleteFromRow(page, name);

  await page.goto("/en/trash");
  await expect(page.locator("#trash-empty")).toBeVisible();
  const select = async (selected: string[]) => {
    for (const name of selected) await trashRow(page, name).getByRole("checkbox").check();
    await expect(page.locator("[data-trash-mass-actions]")).toContainText(`${selected.length} ${selected.length === 1 ? "item" : "items"} selected`);
  };
  await select(["Bulk One", "Bulk Two"]);
  await page.screenshot({ path: testInfo.outputPath("trash-bulk-selection.png"), animations: "disabled" });
  await page.locator("[data-trash-mass-actions]").getByRole("button", { name: "Restore", exact: true }).click();
  await expect(trashRow(page, "Bulk One")).toHaveCount(0);
  await expect(trashRow(page, "Bulk Two")).toHaveCount(0);

  await select(["Bulk Three"]);
  await page
    .locator("[data-trash-mass-actions]")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Delete 1 item permanently?");
  await confirmation.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(trashRow(page, "Bulk Three")).toHaveCount(0);

  await page.locator("#trash-empty").click();
  await expect(confirmation).toContainText("Empty trash?");
  await expect(confirmation.getByRole("button", { name: "Delete permanently", exact: true })).toBeDisabled();
  await confirmation.getByRole("textbox").fill("empty trash");
  await confirmation.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(page.getByText("Trash is empty", { exact: true })).toBeVisible();
  await expect(page.locator("#trash-empty")).toHaveCount(0);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: testInfo.outputPath(`trash-empty-${scheme}.png`), animations: "disabled" });
  }

  await page.goto(`/en/records/${typeId}`);
  for (const name of ["Bulk One", "Bulk Two"])
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  for (const name of ["Bulk Three", "Bulk Four"])
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
