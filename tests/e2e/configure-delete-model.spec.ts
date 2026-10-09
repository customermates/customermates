import type { Page } from "@playwright/test";
import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import {
  addFromConfigure,
  configureDrawer,
  configureRow,
  createConfiguredList,
  deleteFromDrawer,
  deleteRecentlyDeletedPermanently,
  deleteSelectedList,
  followConfigureLink,
  openConfigure,
  openConfigureRow,
  openDrawerTab,
  openRecentlyDeleted,
  restoreRecentlyDeleted,
  saveDrawer,
  selectConfigureList,
} from "./configure";
import { expect, test } from "./fixtures";

async function readModel(database: Client, companyId: string) {
  const result = await database.query(
    'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0]?.snapshot);
}

async function addRecord(page: Page, name: string, value: string) {
  await page.locator("#records-add").click();
  const dialog = configureDrawer(page);
  await dialog.getByRole("textbox", { name, exact: false }).fill(value);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test("deletes fields to Recently deleted, explains blockers with deep links and cleans saved views", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  test.setTimeout(300000);
  const name = "Expedition logs";
  const typeId = await createConfiguredList(page, name);
  await addRecord(page, name, "Base camp");
  await followConfigureLink(page);
  const dialog = configureDrawer(page);
  await addFromConfigure(page, "Field");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Code");
  await saveDrawer(page);
  await addFromConfigure(page, "Calculated field");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Uppercase code");
  await dialog.locator("#valueType").click();
  await page.getByRole("option", { name: "Text", exact: true }).click();
  await openDrawerTab(page, "Calculation");
  const calculation = dialog.getByRole("region", { name: "Calculation", exact: true });
  await calculation.getByRole("combobox", { name: "Use", exact: true }).click();
  await page.getByRole("option", { name: "Field", exact: true }).click();
  await calculation.getByRole("combobox", { name: "Field", exact: true }).click();
  await page.getByRole("option", { name: "Code", exact: true }).click();
  await saveDrawer(page);
  const model = await readModel(database, companyId);
  const code = model.fields.find((field) => field.typeId === typeId && field.label === "Code");
  const upper = model.fields.find((field) => field.typeId === typeId && field.label === "Uppercase code");
  if (!code || !upper) throw new Error("Expected the configured fields");
  const viewId = randomUUID();
  await database.query(
    'INSERT INTO "DataView" (id,"companyId","userId","surfaceKey",name,filters,"columnOrder","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())',
    [
      viewId,
      companyId,
      workspace.userId,
      `records:${typeId}`,
      "Coded logs",
      JSON.stringify([{ field: code.id, operator: "contains", value: "ab" }]),
      JSON.stringify([model.types.find((type) => type.id === typeId)?.primaryFieldId, code.id]),
    ],
  );

  await openConfigureRow(page, "Fields", "Code");
  await dialog.getByRole("button", { name: "Used by", exact: false }).click();
  const blocking = dialog.locator('[data-used-by-group="blocking"]');
  const cleanedUp = dialog.locator('[data-used-by-group="cleaned"]');
  await expect(blocking).toContainText("Would block deletion");
  await expect(blocking.locator("[data-used-by-chip]")).toHaveText(["Uppercase code"]);
  await expect(cleanedUp).toContainText("Cleaned up on deletion");
  await expect(cleanedUp.locator("[data-used-by-chip]").filter({ hasText: "Coded logs" })).toHaveCount(1);
  await blocking.locator("[data-used-by-chip]").filter({ hasText: "Uppercase code" }).click();
  await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Uppercase code");
  await expect(page.locator(`[data-focus-target="field:${upper.id}"]`)).toHaveAttribute("data-focus-highlight", "");
  await expect(dialog.locator("#used-by")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await openConfigureRow(page, "Fields", "Code");
  await dialog.getByRole("button", { name: "Delete field", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Uppercase code calculates from Code.");
  await expect(confirmation.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await confirmation.locator("[data-confirmation-chip]").filter({ hasText: "Uppercase code" }).click();
  await expect(page).toHaveURL(new RegExp(`typeId=${typeId}`));
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Uppercase code");
  await expect(page.locator(`[data-focus-target="field:${upper.id}"]`)).toHaveAttribute("data-focus-highlight", "");
  await deleteFromDrawer(page, "Delete field");
  await expect(configureRow(page, "Fields", "Uppercase code")).toHaveCount(0);

  await openConfigureRow(page, "Fields", "Code");
  await dialog.getByRole("button", { name: "Delete field", exact: true }).click();
  await expect(confirmation).toContainText("Code is removed from the view Coded logs.");
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(configureRow(page, "Fields", "Code")).toHaveCount(0);
  const cleaned = await database.query('SELECT filters,"columnOrder" FROM "DataView" WHERE id=$1', [viewId]);
  expect(cleaned.rows[0].filters).toEqual([]);
  expect(cleaned.rows[0].columnOrder).not.toContain(code.id);

  await openRecentlyDeleted(page);
  const list = page.locator("[data-recently-deleted]");
  await expect(list.getByRole("button", { name: "Code", exact: true })).toBeVisible();
  await expect(list.getByRole("button", { name: "Uppercase code", exact: true })).toBeVisible();
  await restoreRecentlyDeleted(page, "Code");
  await restoreRecentlyDeleted(page, "Uppercase code");
  const restored = await readModel(database, companyId);
  expect(restored.fields.find((field) => field.id === code.id)?.archived).toBe(false);
  expect(restored.fields.find((field) => field.id === upper.id)?.archived).toBe(false);

  await openConfigure(page, typeId);
  await openConfigureRow(page, "Fields", "Uppercase code");
  await deleteFromDrawer(page, "Delete field");
  await openConfigureRow(page, "Fields", "Code");
  await deleteFromDrawer(page, "Delete field");
  await deleteRecentlyDeletedPermanently(page, "Uppercase code");
  await deleteRecentlyDeletedPermanently(page, "Code");
  const definitions = await database.query(
    'SELECT count(*)::int AS count FROM "RecordFieldDefinition" WHERE "companyId"=$1 AND id = ANY($2::text[])',
    [companyId, [code.id, upper.id]],
  );
  expect(definitions.rows[0].count).toBe(0);
});

test("deletes, restores and permanently deletes a relationship and a list", async ({ page, database, companyId }) => {
  test.setTimeout(300000);
  const name = "Field trips";
  const typeId = await createConfiguredList(page, name);
  await addRecord(page, name, "Alps");
  await followConfigureLink(page);
  const dialog = configureDrawer(page);
  await addFromConfigure(page, "Relationship");
  await dialog.getByRole("combobox", { name: "Link to", exact: true }).click();
  await page.getByRole("option", { name: "Organizations", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Label on this side", exact: false }).fill("Host organization");
  await dialog.getByRole("textbox", { name: "Label on the other side", exact: false }).fill(name);
  await saveDrawer(page);
  const relation = (await readModel(database, companyId)).relationships.find(
    (candidate) => candidate.sourceTypeId === typeId && candidate.sourceLabel === "Host organization",
  );
  if (!relation) throw new Error("Expected the configured relationship");

  await openConfigureRow(page, "Relationships", "Host organization");
  await deleteFromDrawer(page, "Delete relationship");
  await expect(configureRow(page, "Relationships", "Host organization")).toHaveCount(0);
  expect((await readModel(database, companyId)).relationships.find((item) => item.id === relation.id)?.archived).toBe(
    true,
  );
  await restoreRecentlyDeleted(page, `${name} → Organizations`);
  expect((await readModel(database, companyId)).relationships.find((item) => item.id === relation.id)?.archived).toBe(
    false,
  );

  await openConfigure(page);
  await selectConfigureList(page, name);
  await deleteSelectedList(page);
  const deleted = await readModel(database, companyId);
  expect(deleted.types.find((type) => type.id === typeId)?.archived).toBe(true);
  expect(deleted.relationships.find((item) => item.id === relation.id)?.archived).toBe(true);
  await openRecentlyDeleted(page);
  await expect(page.locator("[data-recently-deleted]").getByRole("button", { name, exact: true })).toBeVisible();
  await expect(
    page.locator("[data-recently-deleted]").getByRole("button", { name: `${name} → Organizations`, exact: true }),
  ).toHaveCount(0);
  await restoreRecentlyDeleted(page, name);
  const restored = await readModel(database, companyId);
  expect(restored.types.find((type) => type.id === typeId)?.archived).toBe(false);
  expect(restored.relationships.find((item) => item.id === relation.id)?.archived).toBe(false);

  await openConfigure(page);
  await selectConfigureList(page, name);
  await deleteSelectedList(page);
  await deleteRecentlyDeletedPermanently(page, name);
  const remaining = await database.query(
    'SELECT (SELECT count(*)::int FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2) AS types, (SELECT count(*)::int FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2) AS records',
    [companyId, typeId],
  );
  expect(remaining.rows[0]).toEqual({ types: 0, records: 0 });
});
