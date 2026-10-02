import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { test, expect } from "./fixtures";

test("keeps complete reads and a blocked form draft while a high-fan-out price update publishes through the worker", async ({
  page,
  context,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
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
  const snapshot = async () =>
    (
      await database.query(
        `SELECT s."activeOperationId",
    (SELECT trim_scale("decimalValue")::text FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4) AS price,
    (SELECT COUNT(*)::integer FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$5 AND "fieldId"=$6) AS count,
    (SELECT trim_scale(MIN("decimalValue"))::text FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$5 AND "fieldId"=$6) AS minimum,
    (SELECT trim_scale(MAX("decimalValue"))::text FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$5 AND "fieldId"=$6) AS maximum
    FROM "RecordSchemaState" s WHERE s."companyId"=$1`,
        [companyId, id("service"), service, id("service.amount"), id("deal"), id("deal.totalValue")],
      )
    ).rows[0];
  expect(await snapshot()).toEqual({ activeOperationId: null, price: "10", count: 600, minimum: "10", maximum: "10" });
  const draft = await context.newPage();
  await draft.goto(`/en/records/${id("deal")}/${deals[0]}`);
  await expect(draft.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  const name = draft.getByRole("main").getByRole("textbox", { name: "Name", exact: false });
  await name.fill("Retained during recalculation");
  await expect(draft.getByRole("main").getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  const errors: string[] = [];
  for (const browserPage of [page, draft])
    browserPage.on("pageerror", (error) => {
      if (error.message !== "ResizeObserver loop completed with undelivered notifications.") errors.push(error.message);
    });
  await page.getByRole("button", { name: "Shared live catalogue price", exact: true }).click();
  await editor.getByRole("textbox", { name: "Price", exact: false }).fill("20");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.getByRole("status").filter({ hasText: "Existing data remains available" })).toBeVisible();
  expect((await snapshot()).activeOperationId).toBeTruthy();
  await draft.getByRole("main").getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    draft.getByText(
      "The workspace is updating its data model. Your draft is preserved; try again when the update finishes.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(name).toHaveValue("Retained during recalculation");
  await draft.screenshot({ path: testInfo.outputPath("draft-during-recalculation.png"), animations: "disabled" });
  let completeReads = 0;
  await expect
    .poll(
      async () => {
        const state = await snapshot();
        expect(state.count).toBe(600);
        if (state.activeOperationId) {
          expect({ price: state.price, minimum: state.minimum, maximum: state.maximum }).toEqual({
            price: "10",
            minimum: "10",
            maximum: "10",
          });
          completeReads += 1;
          return false;
        }
        expect({ price: state.price, minimum: state.minimum, maximum: state.maximum }).toEqual({
          price: "20",
          minimum: "20",
          maximum: "20",
        });
        return true;
      },
      { timeout: 180000, intervals: [100, 250, 500, 1000] },
    )
    .toBe(true);
  expect(completeReads).toBeGreaterThan(0);
  await expect(editor).not.toBeVisible({ timeout: 15000 });
  await expect(name).toHaveValue("Retained during recalculation");
  const persistedName = await database.query(
    'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
    [companyId, id("deal"), deals[0], id("deal.name")],
  );
  expect(persistedName.rows).toEqual([{ textValue: "Fan-out deal 1" }]);
  const operation = await database.query('SELECT state FROM "RecordOperation" WHERE "companyId"=$1', [companyId]);
  expect(operation.rows).toEqual([{ state: "completed" }]);
  expect(errors).toEqual([]);
  await draft.close();
});
