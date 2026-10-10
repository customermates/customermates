import type { Locator, Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";

const SERVICE = "Shared live catalogue price";

async function openRowMenu(page: Page, row: Locator, name: string) {
  await expect(async () => {
    await row.hover();
    await row.getByRole("button", { name: `More actions for ${name}`, exact: true }).click();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 2000 });
  }).toPass();
}

async function deleteService(page: Page, typeId: string) {
  await page.goto(`/en/records/${typeId}`);
  await openRowMenu(page, page.getByRole("row").filter({ hasText: SERVICE }), SERVICE);
  await page.getByRole("menuitem", { name: englishMessages.Common.actions.delete, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: englishMessages.Common.actions.delete, exact: true })
    .click();
}

test("moves a high fan-out delete to Trash in the background with one toast that ends in Undo, then restores it in the background from the record", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(420000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const id = (key: string) => presetId(companyId, key);
  await page.goto(`/en/records/${id("service")}`);
  await page.locator("#records-add").click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Shared live catalogue price");
  await editor.getByRole("textbox", { name: "Price", exact: false }).fill("10");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();
  const service = (
    await database.query('SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [companyId, id("service")])
  ).rows[0].id;
  const deals = Array.from({ length: 600 }, () => randomUUID());
  const lines = deals.map(() => randomUUID());
  await database.query("BEGIN");
  try {
    for (const [kind, refs] of [
      ["deal", deals],
      ["lineItem", lines],
    ] as const) {
      await database.query(
        'INSERT INTO "CrmRecord" ("companyId","typeId",id,"updatedAt") SELECT $1,$2,ref,NOW() FROM UNNEST($3::text[]) ref',
        [companyId, id(kind), refs],
      );
      await database.query(
        'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"textValue","schemaRevision","updatedAt") SELECT $1,$2,ref,$4,\'value\',$5::text || ordinal,1,NOW() FROM UNNEST($3::text[]) WITH ORDINALITY AS row(ref,ordinal)',
        [companyId, id(kind), refs, id(`${kind}.name`), kind === "deal" ? "Fan-out deal " : "Line "],
      );
      for (const [field, value, currency] of kind === "deal"
        ? [
            ["deal.totalValue", "10", "EUR"],
            ["deal.totalQuantity", "1", null],
          ]
        : [
            ["lineItem.quantity", "1", null],
            ["lineItem.effectivePrice", "10", "EUR"],
            ["lineItem.amount", "10", "EUR"],
          ]) {
        await database.query(
          'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"decimalValue",currency,"schemaRevision","updatedAt") SELECT $1,$2,ref,$4,\'value\',$5::numeric,$6,1,NOW() FROM UNNEST($3::text[]) ref',
          [companyId, id(kind), refs, id(field!), value, currency],
        );
      }
    }
    await database.query(
      'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"textValue","schemaRevision","updatedAt") SELECT $1,$2,ref,$4,\'value\',\'live\',1,NOW() FROM UNNEST($3::text[]) ref',
      [companyId, id("lineItem"), lines, id("lineItem.pricingMode")],
    );
    await database.query(
      'INSERT INTO "RecordLink" ("companyId",id,"relationId","sourceTypeId","sourceId","targetTypeId","targetId","updatedAt") SELECT $1,gen_random_uuid()::text,$2,$3,line,$4,deal,NOW() FROM UNNEST($5::text[],$6::text[]) AS row(line,deal)',
      [companyId, id("lineItem.deal"), id("lineItem"), id("deal"), lines, deals],
    );
    await database.query(
      'INSERT INTO "RecordLink" ("companyId",id,"relationId","sourceTypeId","sourceId","targetTypeId","targetId","updatedAt") SELECT $1,gen_random_uuid()::text,$2,$3,line,$4,$5,NOW() FROM UNNEST($6::text[]) line',
      [companyId, id("lineItem.service"), id("lineItem"), id("service"), service, lines],
    );
    for (const [kind, refs, field] of [
      ["lineItem", lines, "lineItem.effectivePrice"],
      ["lineItem", lines, "lineItem.amount"],
      ["deal", deals, "deal.totalValue"],
    ] as const)
      await database.query(
        'INSERT INTO "RecordValueDependency" ("companyId","typeId","recordId","fieldId","sourceTypeId","sourceId") SELECT $1,$2,ref,$4,$5,$6 FROM UNNEST($3::text[]) ref',
        [companyId, id(kind), refs, id(field), id("service"), service],
      );
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }

  const serviceRow = () =>
    database.query('SELECT "deletedAt" FROM "CrmRecord" WHERE "companyId"=$1 AND id=$2', [companyId, service]);

  await deleteService(page, id("service"));
  const toasts = page.locator("[data-sonner-toast]");
  await expect(toasts.filter({ hasText: "Moving 1 item to Trash" })).toBeVisible();
  await expect(toasts.filter({ hasText: englishMessages.Common.notifications.deleted })).toHaveCount(0);
  const undoToast = toasts.filter({ hasText: englishMessages.Trash.movedToTrash });
  await expect(undoToast).toBeVisible({ timeout: 120000 });
  await expect(toasts.filter({ hasText: "Moving 1 item to Trash" })).toHaveCount(0);
  expect((await serviceRow()).rows[0].deletedAt).not.toBeNull();

  await expect(undoToast.getByRole("button", { name: englishMessages.Trash.undo, exact: true })).toBeVisible();

  await page.goto(`/en/records/${id("service")}/${service}`);
  const banner = page.locator("[data-record-trash-banner]");
  await expect(banner).toContainText(englishMessages.Trash.inTrash);
  await page.getByRole("button", { name: englishMessages.Trash.restore, exact: true }).click();
  await expect(banner).toContainText(englishMessages.Trash.restoring);
  await expect(banner).toBeVisible();
  await expect(banner).not.toBeVisible({ timeout: 120000 });
  expect((await serviceRow()).rows[0].deletedAt).toBeNull();
  expect(errors).toEqual([]);
});
