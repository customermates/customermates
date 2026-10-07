import type { Page } from "@playwright/test";
import {
  addFromConfigure,
  configureDrawer,
  configureRow,
  configureTopBar,
  createConfiguredList,
  followConfigureLink,
  openConfigureRow,
  openListAction,
  saveDrawer,
  setShowArchivedParts,
} from "./configure";
import { expect, test } from "./fixtures";

async function confirmPermanentDeletion(page: Page, name: string, impact: string) {
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText(`Delete ${name} permanently?`);
  await expect(confirmation).toContainText(impact);
  const confirm = confirmation.getByRole("button", { name: "Delete", exact: true });
  await expect(confirm).toBeDisabled();
  await confirmation.getByRole("textbox").fill(`${name} draft`);
  await expect(confirm).toBeDisabled();
  await confirmation.getByRole("textbox").fill(name);
  await confirm.click();
  await expect(confirmation).not.toBeVisible();
}

test("permanently deletes an archived field and then the archived list", async ({ page, database, companyId }) => {
  test.setTimeout(300000);
  const name = "Expedition logs";
  const typeId = await createConfiguredList(page, name);
  await page.locator("#records-add").click();
  const dialog = configureDrawer(page);
  await dialog.getByRole("textbox", { name, exact: false }).fill("Base camp");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await followConfigureLink(page);
  await addFromConfigure(page, "Field");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Code");
  await saveDrawer(page);
  await openConfigureRow(page, "Fields", "Code");
  await expect(dialog.getByRole("button", { name: "Delete field permanently", exact: true })).toHaveCount(0);
  await dialog.getByRole("switch", { name: "Archive field", exact: true }).check();
  await saveDrawer(page);

  await setShowArchivedParts(page, true);
  await openConfigureRow(page, "Fields", "Code");
  await dialog.getByRole("button", { name: "Delete field permanently", exact: true }).click();
  await confirmPermanentDeletion(page, "Code", "No stored data uses it.");
  await expect(dialog).not.toBeVisible();
  await expect(configureRow(page, "Fields", "Code")).toHaveCount(0);
  const fields = await database.query(
    'SELECT count(*)::int AS count FROM "RecordFieldDefinition" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, typeId],
  );
  expect(fields.rows[0].count).toBe(2);

  await openListAction(page, "Archive list");
  await saveDrawer(page);
  await configureTopBar(page).getByRole("button", { name: "List actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete list permanently", exact: true }).click();
  await confirmPermanentDeletion(page, name, "1 record");
  await expect(page).toHaveURL((url) => url.pathname === "/en/configure" && !url.searchParams.has("typeId"));
  await expect(page.locator("[data-configure-graph] [data-configure-node]").first()).toBeAttached();
  const remaining = await database.query(
    'SELECT (SELECT count(*)::int FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2) AS types, (SELECT count(*)::int FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2) AS records',
    [companyId, typeId],
  );
  expect(remaining.rows[0]).toEqual({ types: 0, records: 0 });
});
