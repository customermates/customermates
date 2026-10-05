import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { test, expect } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

test("downloads generic records from the shared table with persisted typed values", async ({
  page,
  database,
  companyId,
}) => {
  const typeId = presetId(companyId, "service");
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const editor = page.getByRole("dialog");
  await editor
    .getByRole("textbox", { name: "Name", exact: false })
    .fill("Exported service");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();

  await page.locator("#records-transfer").click();
  const downloaded = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(`records-${typeId}.json`);
  const file = await download.path();
  expect(file).toBeTruthy();
  const exported = JSON.parse(await readFile(file!, "utf8"));
  const stored = await database.query(
    'SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, typeId],
  );
  expect(exported).toMatchObject({
    format: "customermates-records",
    version: 1,
    typeId,
    records: [{ ref: { typeId, recordId: stored.rows[0]?.id } }],
  });
  expect(exported.records).toHaveLength(1);
  await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);

  const importedId = randomUUID();
  const copy = {
    ...exported,
    records: exported.records.map(
      (record: (typeof exported.records)[number]) => ({
        ...record,
        ref: { ...record.ref, recordId: importedId },
      }),
    ),
  };
  await page.locator("#records-transfer").click();
  await page
    .getByRole("menuitem", { name: "Add from file", exact: true })
    .click();
  const importDialog = page.getByRole("dialog");
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: "service-copy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(copy)),
  });
  await expect(importDialog).toContainText(
    "1 record and 0 links are ready to import.",
  );
  await importDialog
    .getByRole("button", { name: "Import records", exact: true })
    .click();
  await expect(importDialog).not.toBeVisible();
  const copied = await database.query(
    'SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=$3',
    [companyId, typeId, importedId],
  );
  expect(copied.rows).toEqual([{ id: importedId }]);

  await expect(importDialog).toHaveCount(0);
  await page.locator("#records-transfer").click();
  await page
    .getByRole("menuitem", { name: "Add from file", exact: true })
    .click();
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: "service-update.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await importDialog
    .getByRole("button", { name: "Update matching IDs", exact: true })
    .click();
  await importDialog
    .getByRole("button", { name: "Import records", exact: true })
    .click();
  await expect(importDialog).not.toBeVisible();
  const updated = await database.query(
    'SELECT version FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=$3',
    [companyId, typeId, stored.rows[0]?.id],
  );
  expect(updated.rows[0]?.version).toBeGreaterThan(exported.records[0].version);
  await page.close();
});

test("exports a customer-created type through the same transfer menu", async ({
  page,
  database,
  companyId,
}) => {
  await page.goto(`/en/records/${presetId(companyId, "service")}`);
  if (!(await page.locator("#nav-add").isVisible()))
    await page.locator("#sidebar-trigger").click();
  await page.locator("#nav-add").click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Create list", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Name", exact: false })
    .first()
    .fill("Projects");
  await dialog
    .getByRole("button", { name: "Create list", exact: true })
    .first()
    .click();
  await expect(dialog).not.toBeVisible();
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  expect(typeId).toBeTruthy();

  await page.locator("#records-add").click();
  await dialog.getByRole("textbox").first().fill("Project Alpha");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.locator("#records-transfer").click();
  const downloaded = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(`records-${typeId}.json`);
  const file = await download.path();
  expect(file).toBeTruthy();
  const exported = JSON.parse(await readFile(file!, "utf8"));
  const stored = await database.query(
    'SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, typeId],
  );
  expect(exported).toMatchObject({
    typeId,
    records: [{ ref: { typeId, recordId: stored.rows[0]?.id } }],
  });
  expect(exported.records).toHaveLength(1);
  await page.close();
});

test("round-trips deal line items and their calculated total through the transfer menu", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(240000);
  const serviceTypeId = presetId(companyId, "service");
  const dealTypeId = presetId(companyId, "deal");
  const lineTypeId = presetId(companyId, "lineItem");
  const dialogs = page.getByRole("dialog");
  await page.goto(`/en/records/${serviceTypeId}`);
  await page.locator("#records-add").click();
  await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill("Transfer service");
  await dialogs.getByRole("textbox", { name: "Price", exact: false }).fill("1000");
  await dialogs.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialogs).not.toBeVisible();

  await page.goto(`/en/records/${dealTypeId}`);
  await page.locator("#records-add").click();
  await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill("Transfer opportunity");
  await dialogs.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialogs).not.toBeVisible();
  await page.getByRole("button", { name: "Transfer opportunity", exact: true }).click();
  await dialogs.getByRole("button", { name: "Add Line item", exact: true }).click();
  await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(2);
  const child = dialogs.last();
  await child.getByRole("textbox", { name: "Name", exact: false }).fill("Transfer line");
  await child.getByRole("textbox", { name: "Quantity", exact: false }).fill("2");
  await child.getByRole("combobox", { name: "Service", exact: true }).click();
  await page.getByRole("option", { name: "Transfer service", exact: true }).click();
  await child.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialogs).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialogs).not.toBeVisible();

  await page.locator("#records-transfer").click();
  const downloaded = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  const path = await (await downloaded).path();
  expect(path).toBeTruthy();
  const exported = JSON.parse(await readFile(path!, "utf8"));
  expect(exported.records.map((record: { ref: { typeId: string } }) => record.ref.typeId).sort()).toEqual(
    [dealTypeId, lineTypeId].sort(),
  );
  const replacements = new Map<string, string>(exported.records.map((row: { ref: { recordId: string } }) => [
    row.ref.recordId,
    randomUUID(),
  ]));
  const copyRef = (ref: { typeId: string; recordId: string }) => ({
    ...ref,
    recordId: replacements.get(ref.recordId) ?? ref.recordId,
  });
  const copy = {
    ...exported,
    records: exported.records.map((row: (typeof exported.records)[number]) => ({ ...row, ref: copyRef(row.ref) })),
    links: exported.links.map((link: (typeof exported.links)[number]) => ({
      ...link,
      source: copyRef(link.source),
      target: copyRef(link.target),
    })),
  };
  await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);
  await page.locator("#records-transfer").click();
  await page.getByRole("menuitem", { name: "Add from file", exact: true }).click();
  const importDialog = page.getByRole("dialog");
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: "deal-copy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(copy)),
  });
  await expect(importDialog).toContainText("2 records and 2 links are ready to import.");
  await importDialog.getByRole("button", { name: "Import records", exact: true }).click();
  await expect(importDialog).not.toBeVisible();
  const total = await database.query(
    'SELECT trim_scale("decimalValue")::text AS value FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
    [companyId, dealTypeId, replacements.get(exported.records[0].ref.recordId), presetId(companyId, "deal.totalValue")],
  );
  expect(total.rows).toEqual([{ value: "2000" }]);
  await page.close();
});
