import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { SOLUTION_CATALOG } from "../../core/solutions/solution-catalog";
import { presetId } from "../../features/records/crm-preset";
import { solutionContent } from "../../prisma/seeds/solutions/define-solution";
import { SOLUTION_DEFINITIONS } from "../../prisma/seeds/solutions/definitions";
import { appPath } from "./app-paths";
import { DEMO_COMPANY_ID, DEMO_SLUG, DEMO_STAGE_PROBABILITY, demoId, displayedNumber, expect, test } from "./demo-seed";

/**
 * Calculated fields of the seeded demo workspaces match a direct database computation from their inputs, and the record
 * page shows the same value. Records are picked deterministically (by id) among those the calculation applies to.
 */
type Value = { decimal: number | null; text: string | null; instant: Date | null; bool: boolean | null };
type Row = Record<string, Value | undefined>;

async function load(database: Client, typeKey: string, fieldKeys: string[], companyId = DEMO_COMPANY_ID) {
  const id = (key: string) => presetId(companyId, key);
  const ids = fieldKeys.map(id);
  const { rows } = await database.query<{
    recordId: string;
    fieldId: string;
    decimal: string | null;
    text: string | null;
    instant: Date | null;
    bool: boolean | null;
  }>(
    `SELECT r.id AS "recordId", v."fieldId", v."decimalValue"::text AS decimal, v."textValue" AS text,
       v."instantValue" AS instant, v."booleanValue" AS bool
     FROM "CrmRecord" r LEFT JOIN "RecordValue" v ON v."companyId"=r."companyId" AND v."typeId"=r."typeId"
       AND v."recordId"=r.id AND v."fieldId"=ANY($3) AND v.state='value'
     WHERE r."companyId"=$1 AND r."typeId"=$2 AND r."deletedAt" IS NULL ORDER BY r.id`,
    [companyId, id(typeKey), ids],
  );
  const records = new Map<string, Row>();
  for (const row of rows) {
    const record = records.get(row.recordId) ?? {};
    if (row.fieldId) {
      record[fieldKeys[ids.indexOf(row.fieldId)]] = {
        decimal: row.decimal === null ? null : Number(row.decimal),
        text: row.text,
        instant: row.instant,
        bool: row.bool,
      };
    }
    records.set(row.recordId, record);
  }
  return records;
}

/** Links of a relationship between live records: `[sourceId, targetId]`. */
async function linked(database: Client, relationKey: string) {
  const { rows } = await database.query<{ sourceId: string; targetId: string }>(
    `SELECT l."sourceId", l."targetId" FROM "RecordLink" l
     JOIN "CrmRecord" s ON s."companyId"=l."companyId" AND s."typeId"=l."sourceTypeId" AND s.id=l."sourceId"
     JOIN "CrmRecord" t ON t."companyId"=l."companyId" AND t."typeId"=l."targetTypeId" AND t.id=l."targetId"
     WHERE l."companyId"=$1 AND l."relationId"=$2 AND l."deletedAt" IS NULL AND s."deletedAt" IS NULL
       AND t."deletedAt" IS NULL ORDER BY l."sourceId", l."targetId"`,
    [DEMO_COMPANY_ID, demoId(relationKey)],
  );
  return rows.map(({ sourceId, targetId }) => [sourceId, targetId] as const);
}

const amount = (row: Row | undefined, key: string) => row?.[key]?.decimal ?? null;
const sum = (values: Array<number | null>) => values.reduce<number>((total, value) => total + (value ?? 0), 0);
const numbers = (text: string) => (text.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, "")));

/**
 * The value a record page shows for a calculated field: read-only output, or the input of a snapshot that allows a
 * manual override.
 */
async function shown(page: Page, typeKey: string, recordId: string, fieldKey: string) {
  await page.goto(appPath(DEMO_SLUG, `/records/${demoId(typeKey)}/${recordId}`));
  const main = page.getByRole("main");
  const overview = main.getByRole("tab", { name: "Overview", exact: true });
  if (await overview.isVisible()) await overview.click();
  const field = main.locator(`[data-entity-field="${demoId(fieldKey)}"]`);
  const output = field.locator('[data-field-state="read-only"], input').first();
  await expect(output).toBeVisible();
  if (await field.locator('[data-field-state="read-only"]').count()) {
    await expect(output).not.toHaveText("");
    return output.innerText();
  }
  await expect(output).not.toHaveValue("");
  return output.inputValue();
}

async function expectShownAmount(page: Page, typeKey: string, recordId: string, fieldKey: string, expected: number) {
  const text = await shown(page, typeKey, recordId, fieldKey);
  expect(displayedNumber(text), `${fieldKey} of ${recordId} shows "${text}"`).toBeCloseTo(expected, 1);
}

test("a deal's value is the sum of its line item amounts", async ({ page, database, errors }) => {
  const deals = await load(database, "deal", ["deal.totalValue"]);
  const lineItems = await load(database, "lineItem", ["lineItem.amount"]);
  const itemsOf = await linked(database, "lineItem.deal");
  const value = (dealId: string) =>
    sum(itemsOf.filter(([, deal]) => deal === dealId).map(([item]) => amount(lineItems.get(item), "lineItem.amount")));
  for (const [id, row] of deals)
    expect(amount(row, "deal.totalValue") ?? 0, `value of deal ${id}`).toBeCloseTo(value(id), 2);
  const lines = (dealId: string) => itemsOf.filter(([, deal]) => deal === dealId).length;
  const multiLine = [...deals.keys()].find((id) => lines(id) >= 2 && value(id) > 0);
  expect(multiLine, "a deal with two or more line items").toBeTruthy();
  await expectShownAmount(page, "deal", multiLine as string, "deal.totalValue", value(multiLine as string));
  expect(errors).toEqual([]);
});

test("a line item's amount is its quantity times the price of its service", async ({
  page,
  database,
  errors,
}, testInfo) => {
  const lineItems = await load(database, "lineItem", [
    "lineItem.quantity",
    "lineItem.pricingMode",
    "lineItem.effectivePrice",
    "lineItem.amount",
  ]);
  const services = await load(database, "service", ["service.amount"]);
  const serviceOf = new Map((await linked(database, "lineItem.service")).map(([item, service]) => [item, service]));
  const dealOf = new Map((await linked(database, "lineItem.deal")).map(([item, deal]) => [item, deal]));
  expect(lineItems.size).toBeGreaterThan(0);
  for (const [id, row] of lineItems) {
    const price = amount(services.get(serviceOf.get(id) ?? ""), "service.amount");
    expect(price, `service price of line item ${id}`).not.toBeNull();
    if (row["lineItem.pricingMode"]?.text !== "saved") {
      expect(amount(row, "lineItem.effectivePrice"), `unit price of line item ${id}`).toBeCloseTo(
        price ?? Number.NaN,
        2,
      );
    }
    expect(amount(row, "lineItem.amount"), `amount of line item ${id}`).toBeCloseTo(
      (amount(row, "lineItem.quantity") ?? 0) * (amount(row, "lineItem.effectivePrice") ?? 0),
      2,
    );
  }
  const [lineId, line] =
    [...lineItems].find(([, row]) => (amount(row, "lineItem.quantity") ?? 0) > 1) ?? [...lineItems][0];
  const expected = amount(line, "lineItem.amount") ?? Number.NaN;
  await page.goto(appPath(DEMO_SLUG, `/records/${demoId("deal")}/${dealOf.get(lineId)}`));
  const main = page.getByRole("main");
  const overview = main.getByRole("tab", { name: "Overview", exact: true });
  if (await overview.isVisible()) await overview.click();
  const row = main
    .getByRole("region", { name: "Line items", exact: true })
    .locator(`[data-row-id="${lineId}"], [data-item-id="${lineId}"]`);
  await expect(row).toBeVisible();
  // Phones show the sub-list as rows without the amount column; the shown amount is a desktop check.
  if (!testInfo.project.use.isMobile) {
    await expect
      .poll(async () => numbers(await row.innerText()).some((number) => Math.abs(number - expected) < 0.01))
      .toBe(true);
  }
  expect(errors).toEqual([]);
});

test("weighted value is the deal value times the probability of its stage", async ({ page, database, errors }) => {
  const deals = await load(database, "deal", ["deal.stage", "deal.totalValue", "deal.weightedValue"]);
  const probability = (row: Row) => DEMO_STAGE_PROBABILITY.get(row["deal.stage"]?.text ?? "") ?? Number.NaN;
  const weighted = (row: Row) => ((amount(row, "deal.totalValue") ?? 0) * probability(row)) / 100;
  for (const [id, row] of deals)
    expect(amount(row, "deal.weightedValue") ?? 0, `weighted value of deal ${id}`).toBeCloseTo(weighted(row), 2);
  const partial = [...deals].find(([, row]) => probability(row) > 0 && probability(row) < 100 && weighted(row) > 0);
  expect(partial, "an open deal with a value").toBeTruthy();
  const [id, row] = partial as [string, Row];
  await expectShownAmount(page, "deal", id, "deal.weightedValue", weighted(row));
  expect(errors).toEqual([]);
});

test("without a Services list a deal keeps its entered value, and its weighted value follows the stage", async ({
  database,
}) => {
  const solution = SOLUTION_CATALOG.find(({ id }) => id === "whatsapp-crm");
  if (!solution) throw new Error("The catalog has no WhatsApp solution");
  const companyId = solution.companyIds.en;
  const content = solutionContent(SOLUTION_DEFINITIONS[solution.id], "en");
  expect(content.lists.map(({ key }) => key)).not.toContain("service");
  expect(content.dealValue).toBeUndefined();
  const probabilities = new Map(
    content.stages.map((stage) => [presetId(companyId, `deal.stage.${stage.key}`), stage.probability ?? 0]),
  );
  const deals = await load(database, "deal", ["deal.stage", "deal.totalValue", "deal.weightedValue"], companyId);
  const seeded = (content.records.deal ?? []).map(({ values }) => Number(values.totalValue));
  expect([...deals.values()].map((row) => amount(row, "deal.totalValue")).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
    seeded.sort((a, b) => a - b),
  );
  for (const [id, row] of deals) {
    const probability = probabilities.get(row["deal.stage"]?.text ?? "") ?? Number.NaN;
    expect(amount(row, "deal.weightedValue") ?? 0, `weighted value of deal ${id}`).toBeCloseTo(
      ((amount(row, "deal.totalValue") ?? 0) * probability) / 100,
      2,
    );
  }
});

test("a consultants engagement calculates its fee from day rate and days", async ({ database }) => {
  const solution = SOLUTION_CATALOG.find(({ id }) => id === "consultants");
  if (!solution) throw new Error("The catalog has no consultants solution");
  const companyId = solution.companyIds.en;
  const content = solutionContent(SOLUTION_DEFINITIONS[solution.id], "en");
  expect(content.dealValue).toEqual({ kind: "product", left: "deal.dayRate", right: "deal.daysEstimated" });
  const deals = await load(
    database,
    "deal",
    ["deal.dayRate", "deal.daysEstimated", "deal.totalValue", "deal.weightedValue"],
    companyId,
  );
  expect(deals.size).toBe(content.records.deal?.length);
  for (const [id, row] of deals) {
    expect(amount(row, "deal.totalValue") ?? 0, `fee of engagement ${id}`).toBeCloseTo(
      (amount(row, "deal.dayRate") ?? 0) * (amount(row, "deal.daysEstimated") ?? 0),
      2,
    );
  }
});
