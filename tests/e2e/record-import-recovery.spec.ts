import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordExportSchema, type RecordExport } from "../../features/data-transfer/record-transfer.schema";
import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";

async function importState(database: Client, companyId: string, typeId: string, recordIds: string[]) {
  const result = await database.query(
    'SELECT (SELECT COUNT(*)::integer FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=ANY($3::text[])) AS records, (SELECT COUNT(*)::integer FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=ANY($3::text[])) AS values, (SELECT COUNT(*)::integer FROM "RecordEvent" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=ANY($3::text[])) AS events, (SELECT COUNT(*)::integer FROM "RecordMutationReceipt" WHERE "companyId"=$1) AS receipts',
    [companyId, typeId, recordIds],
  );
  return result.rows[0];
}

test("rejects malformed and invalid typed imports without partial records and accepts a corrected file in the same dialog", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  let expectedImportRejection = false;
  const importRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/records/import") importRequests.push(request.url());
  });
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (!isAppConsoleError(message)) return;
    if (
      expectedImportRejection &&
      message.location().url.endsWith("/api/v1/records/import") &&
      /400/.test(message.text())
    )
      return;
    errors.push(message.text());
  });
  const typeId = presetId(companyId, "service");
  const titleId = presetId(companyId, "service.name");
  const priceId = presetId(companyId, "service.amount");
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Import source service");
  await dialog.getByRole("textbox", { name: "Price", exact: false }).fill("12.125");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.locator("#records-transfer").click();
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: englishMessages.DataTransfer.export.action, exact: true }).click();
  const exportPath = await (await pendingDownload).path();
  if (!exportPath) throw new Error("Expected a local exported file");
  const exported = RecordExportSchema.parse(JSON.parse(await readFile(exportPath, "utf8")));
  const source = exported.records[0];
  if (!source) throw new Error("Expected exported source record");
  expect(exported.records).toHaveLength(1);
  const ids = [randomUUID(), randomUUID()];
  const names = ["Corrected import first", "Corrected import second"];
  const corrected: RecordExport = {
    ...exported,
    records: ids.map((recordId, index): RecordExport["records"][number] => ({
      ...source,
      ref: { typeId, recordId },
      fields: source.fields.map((field): RecordExport["records"][number]["fields"][number] =>
        field.fieldId === titleId
          ? { ...field, result: { state: "value", value: { kind: "text", value: names[index] } } }
          : field,
      ),
    })),
  };
  const invalid = {
    ...corrected,
    records: corrected.records.map((row, index) =>
      index === 1
        ? {
            ...row,
            fields: row.fields.map((field) =>
              field.fieldId === titleId
                ? { ...field, result: { state: "value", value: { kind: "decimal", value: "17", currency: null } } }
                : field,
            ),
          }
        : row,
    ),
  };
  expect(RecordExportSchema.safeParse(invalid).success).toBe(true);
  const baseline = await importState(database, companyId, typeId, ids);
  expect(baseline).toMatchObject({ records: 0, values: 0, events: 0 });
  await expect(page.locator('[data-slot="dropdown-menu-content"][aria-labelledby="records-transfer"]')).toHaveCount(0);
  await page.locator("#records-transfer").click();
  await expect(page.locator("#records-transfer")).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("menuitem", { name: englishMessages.DataTransfer.import.action, exact: true }).click();
  const fileInput = dialog.locator('input[type="file"]');
  const submit = dialog.getByRole("button", { name: englishMessages.DataTransfer.recordImport.submit, exact: true });
  await fileInput.setInputFiles({
    name: "malformed.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":'),
  });
  await expect(dialog.getByRole("alert")).toHaveText(englishMessages.DataTransfer.import.fileRejected);
  await expect(submit).toBeDisabled();
  expect(importRequests).toHaveLength(0);
  expect(await importState(database, companyId, typeId, ids)).toEqual(baseline);
  await fileInput.setInputFiles({
    name: "invalid-typed-batch.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog).toContainText("2 records and 0 links are ready to import.");
  expectedImportRejection = true;
  const rejected = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/records/import");
  await submit.click();
  expect((await rejected).status()).toBe(400);
  await expect(dialog.getByRole("alert")).toHaveText(englishMessages.DataTransfer.recordImport.failed);
  await expect(dialog).toBeVisible();
  expect(importRequests).toHaveLength(1);
  expect(await importState(database, companyId, typeId, ids)).toEqual(baseline);
  await page.screenshot({ path: testInfo.outputPath("rejected-import-no-partial-records.png"), fullPage: true });
  await fileInput.setInputFiles({
    name: "corrected-batch.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(corrected)),
  });
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog).not.toContainText("invalid-typed-batch.json");
  await expect(dialog).toContainText("corrected-batch.json");
  await expect(submit).toBeEnabled();
  const imported = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/records/import");
  await submit.click();
  expect((await imported).status()).toBe(200);
  await expect(dialog).not.toBeVisible();
  expectedImportRejection = false;
  expect(importRequests).toHaveLength(2);
  const persisted = await database.query(
    'SELECT record.id,title."textValue" AS title,trim_scale(price."decimalValue")::text AS price,price.currency FROM "CrmRecord" record JOIN "RecordValue" title ON title."companyId"=record."companyId" AND title."typeId"=record."typeId" AND title."recordId"=record.id AND title."fieldId"=$4 JOIN "RecordValue" price ON price."companyId"=record."companyId" AND price."typeId"=record."typeId" AND price."recordId"=record.id AND price."fieldId"=$5 WHERE record."companyId"=$1 AND record."typeId"=$2 AND record.id=ANY($3::text[]) ORDER BY title."textValue"',
    [companyId, typeId, ids, titleId, priceId],
  );
  expect(persisted.rows).toEqual(
    ids.map((id, index) => ({ id, title: names[index], price: "12.125", currency: "EUR" })),
  );
  const accepted = await importState(database, companyId, typeId, ids);
  expect(accepted.records).toBe(2);
  expect(accepted.receipts).toBe(baseline.receipts + 1);
  await page.reload();
  for (const name of names) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  expect((await importState(database, companyId, typeId, ids)).records).toBe(2);
  expect(errors).toEqual([]);
});
