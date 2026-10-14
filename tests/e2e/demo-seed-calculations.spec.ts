import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { DEMO_COMPANY_ID, demoId, displayedNumber, expect, test } from "./demo-seed";

/**
 * Calculated fields of the seeded workspace match a direct database computation from their inputs, and the record
 * page shows the same value. Records are picked deterministically (by id) among those the calculation applies to.
 */
type Value = { decimal: number | null; text: string | null; instant: Date | null; bool: boolean | null };
type Row = Record<string, Value | undefined>;

const DAY = 86_400_000;

async function load(database: Client, typeKey: string, fieldKeys: string[]) {
  const ids = fieldKeys.map(demoId);
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
    [DEMO_COMPANY_ID, demoId(typeKey), ids],
  );
  const records = new Map<string, Row>();
  for (const row of rows) {
    const record = records.get(row.recordId) ?? {};
    if (row.fieldId)
      record[fieldKeys[ids.indexOf(row.fieldId)]] = {
        decimal: row.decimal === null ? null : Number(row.decimal),
        text: row.text,
        instant: row.instant,
        bool: row.bool,
      };
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
const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);

/**
 * The value a record page shows for a calculated field: read-only output, or the input of a snapshot that allows a
 * manual override.
 */
async function shown(page: Page, typeKey: string, recordId: string, fieldKey: string) {
  await page.goto(`/en/records/${demoId(typeKey)}/${recordId}`);
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

test("subscription ARR is the flat annual price or seats times the monthly seat price times twelve", async ({
  page,
  database,
  errors,
}) => {
  const subscriptions = await load(database, "subscription", [
    "subscription.annualPrice",
    "subscription.seats",
    "subscription.pricePerSeat",
    "subscription.arr",
  ]);
  const expected = (row: Row) =>
    amount(row, "subscription.annualPrice") ??
    (amount(row, "subscription.seats") ?? 0) * (amount(row, "subscription.pricePerSeat") ?? 0) * 12;
  for (const [id, row] of subscriptions)
    expect(amount(row, "subscription.arr"), `ARR of subscription ${id}`).toBeCloseTo(expected(row), 2);
  const entries = [...subscriptions];
  const perSeat = entries.find(([, row]) => amount(row, "subscription.annualPrice") === null);
  const flat = entries.find(([, row]) => amount(row, "subscription.annualPrice") !== null);
  expect(perSeat, "a per-seat subscription").toBeTruthy();
  for (const [id, row] of [perSeat, flat].filter((entry) => entry !== undefined))
    await expectShownAmount(page, "subscription", id, "subscription.arr", expected(row));
  expect(errors).toEqual([]);
});

test("organization ARR and open pipeline roll up their subscriptions and open deals", async ({
  page,
  database,
  errors,
}) => {
  const organizations = await load(database, "organization", ["organization.arr", "organization.openPipeline"]);
  const subscriptions = await load(database, "subscription", ["subscription.arr"]);
  const deals = await load(database, "deal", ["deal.totalValue", "deal.stage", "deal.openValue"]);
  const stage = (key: string) => demoId(`deal.stage.${key}`);
  const closed = new Set([stage("won"), stage("lost")]);
  const openValue = (row: Row | undefined) =>
    closed.has(row?.["deal.stage"]?.text ?? "") ? 0 : (amount(row, "deal.totalValue") ?? 0);
  for (const [id, row] of deals)
    expect(amount(row, "deal.openValue"), `open value of deal ${id}`).toBeCloseTo(openValue(row), 2);

  const subscriptionLinks = await linked(database, "subscription.organization");
  const dealLinks = await linked(database, "deal.organizations");
  const arr = (organizationId: string) =>
    sum(
      subscriptionLinks
        .filter(([, target]) => target === organizationId)
        .map(([source]) => amount(subscriptions.get(source), "subscription.arr")),
    );
  const pipeline = (organizationId: string) =>
    sum(dealLinks.filter(([, target]) => target === organizationId).map(([source]) => openValue(deals.get(source))));
  for (const [id, row] of organizations) {
    expect(amount(row, "organization.arr") ?? 0, `ARR of organization ${id}`).toBeCloseTo(arr(id), 2);
    expect(amount(row, "organization.openPipeline") ?? 0, `open pipeline of organization ${id}`).toBeCloseTo(
      pipeline(id),
      2,
    );
  }
  const counts = (links: ReadonlyArray<readonly [string, string]>, id: string) =>
    links.filter(([, target]) => target === id).length;
  const multiSubscription = [...organizations.keys()].find((id) => counts(subscriptionLinks, id) >= 2);
  const withPipeline = [...organizations.keys()].find((id) => pipeline(id) > 0);
  expect(multiSubscription, "an organization with two or more subscriptions").toBeTruthy();
  expect(withPipeline, "an organization with open pipeline").toBeTruthy();
  await expectShownAmount(
    page,
    "organization",
    multiSubscription as string,
    "organization.arr",
    arr(multiSubscription as string),
  );
  await expectShownAmount(
    page,
    "organization",
    withPipeline as string,
    "organization.openPipeline",
    pipeline(withPipeline as string),
  );
  expect(errors).toEqual([]);
});

test("won deals snapshot their contract value; discount, days to close and industry follow their inputs", async ({
  page,
  database,
  errors,
}) => {
  const deals = await load(database, "deal", [
    "deal.stage",
    "deal.totalValue",
    "deal.contractValue",
    "deal.discountPercent",
    "deal.openedOn",
    "deal.closeDate",
    "deal.daysToClose",
    "deal.industry",
  ]);
  const won = [...deals].filter(([, row]) => row["deal.stage"]?.text === demoId("deal.stage.won"));
  expect(won.length).toBeGreaterThan(10);
  for (const [id, row] of won)
    expect(amount(row, "deal.contractValue"), `contract value of won deal ${id}`).toBeCloseTo(
      amount(row, "deal.totalValue") ?? Number.NaN,
      2,
    );
  for (const [id, row] of deals)
    if (row["deal.stage"]?.text !== demoId("deal.stage.won"))
      expect(amount(row, "deal.contractValue"), `contract value of open or lost deal ${id}`).toBeNull();

  const lineItems = await load(database, "lineItem", ["lineItem.effectivePrice"]);
  const services = await load(database, "service", ["service.amount"]);
  const serviceOf = new Map((await linked(database, "lineItem.service")).map(([item, service]) => [item, service]));
  const itemsOf = await linked(database, "lineItem.deal");
  const discount = (dealId: string) => {
    const discounts = itemsOf
      .filter(([, deal]) => deal === dealId)
      .flatMap(([item]) => {
        const price = amount(lineItems.get(item), "lineItem.effectivePrice");
        const list = amount(services.get(serviceOf.get(item) ?? ""), "service.amount");
        return price === null || !list ? [] : [(1 - price / list) * 100];
      });
    return discounts.length ? Math.max(...discounts) : null;
  };
  for (const [id, row] of deals) {
    const expected = discount(id);
    if (expected === null) continue;
    expect(amount(row, "deal.discountPercent"), `discount of deal ${id}`).toBeCloseTo(expected, 4);
  }
  const discounted = [...deals.keys()].find((id) => (discount(id) ?? 0) > 0);
  expect(discounted, "a discounted deal").toBeTruthy();

  for (const [id, row] of deals) {
    const opened = row["deal.openedOn"]?.instant;
    const closes = row["deal.closeDate"]?.instant;
    if (opened && closes)
      expect(amount(row, "deal.daysToClose"), `days to close of deal ${id}`).toBe(days(opened, closes));
  }

  const organizations = await load(database, "organization", ["organization.industry"]);
  const organizationOf = await linked(database, "deal.organizations");
  for (const [id, row] of deals) {
    const organization = organizationOf.find(([deal]) => deal === id)?.[1];
    const industry = organization ? organizations.get(organization)?.["organization.industry"]?.text : undefined;
    expect(row["deal.industry"]?.text, `industry of deal ${id}`).toBe(industry);
  }

  const [wonId, wonRow] = won[0];
  await expectShownAmount(page, "deal", wonId, "deal.contractValue", amount(wonRow, "deal.totalValue") ?? Number.NaN);
  await expectShownAmount(
    page,
    "deal",
    discounted as string,
    "deal.discountPercent",
    discount(discounted as string) ?? 0,
  );
  await expectShownAmount(
    page,
    "deal",
    wonId,
    "deal.daysToClose",
    days(wonRow["deal.openedOn"]?.instant as Date, wonRow["deal.closeDate"]?.instant as Date),
  );
  const { rows } = await database.query<{ options: Array<{ id: string; label: string }> }>(
    `SELECT definition->'options' AS options FROM "RecordFieldDefinition" WHERE "companyId"=$1 AND id=$2`,
    [DEMO_COMPANY_ID, demoId("organization.industry")],
  );
  const label = rows[0].options.find((option) => option.id === wonRow["deal.industry"]?.text)?.label;
  expect(label, "the won deal has an industry").toBeTruthy();
  await page.goto(`/en/records/${demoId("deal")}/${wonId}`);
  await expect(page.getByRole("main").locator(`[data-entity-field="${demoId("deal.industry")}"]`)).toContainText(
    label as string,
  );
  expect(errors).toEqual([]);
});

test("tickets are overdue exactly when they ran past the SLA due date", async ({ page, database, errors }) => {
  const tickets = await load(database, "ticket", [
    "ticket.slaDue",
    "ticket.resolvedOn",
    "ticket.lastResponseOn",
    "ticket.daysOverSla",
    "ticket.overdue",
  ]);
  const over = (row: Row) => {
    const due = row["ticket.slaDue"]?.instant;
    const until = row["ticket.resolvedOn"]?.instant ?? row["ticket.lastResponseOn"]?.instant;
    return due && until ? days(due, until) : null;
  };
  for (const [id, row] of tickets) {
    expect(amount(row, "ticket.daysOverSla"), `days over SLA of ticket ${id}`).toBe(over(row));
    if (over(row) !== null) expect(row["ticket.overdue"]?.bool, `overdue of ticket ${id}`).toBe((over(row) ?? 0) > 0);
  }
  const overdue = [...tickets].find(([, row]) => (over(row) ?? 0) > 0);
  const onTime = [...tickets].find(([, row]) => over(row) !== null && (over(row) ?? 1) <= 0);
  expect(overdue, "an overdue ticket").toBeTruthy();
  expect(onTime, "a ticket within its SLA").toBeTruthy();
  for (const [id, row] of [overdue, onTime] as Array<[string, Row]>) {
    await expectShownAmount(page, "ticket", id, "ticket.daysOverSla", over(row) ?? Number.NaN);
    const flag = page
      .getByRole("main")
      .locator(`[data-entity-field="${demoId("ticket.overdue")}"] [data-field-state="read-only"]`);
    await expect(flag).toHaveText((over(row) ?? 0) > 0 ? "Yes" : "No");
  }
  expect(errors).toEqual([]);
});

test("campaign pipeline sourced and partner revenue influenced roll up their linked deals", async ({
  page,
  database,
  errors,
}) => {
  const deals = await load(database, "deal", ["deal.totalValue", "deal.contractValue"]);
  const campaigns = await load(database, "campaign", ["campaign.pipelineSourced"]);
  const partners = await load(database, "partner", ["partner.revenueInfluenced"]);
  const campaignLinks = await linked(database, "deal.campaign");
  const partnerLinks = await linked(database, "deal.partner");
  const sourced = (id: string) =>
    sum(
      campaignLinks
        .filter(([, campaign]) => campaign === id)
        .map(([deal]) => amount(deals.get(deal), "deal.totalValue")),
    );
  const influenced = (id: string) =>
    sum(
      partnerLinks
        .filter(([, partner]) => partner === id)
        .map(([deal]) => amount(deals.get(deal), "deal.contractValue")),
    );
  for (const [id, row] of campaigns)
    expect(amount(row, "campaign.pipelineSourced") ?? 0, `pipeline sourced by campaign ${id}`).toBeCloseTo(
      sourced(id),
      2,
    );
  for (const [id, row] of partners)
    expect(amount(row, "partner.revenueInfluenced") ?? 0, `revenue influenced by partner ${id}`).toBeCloseTo(
      influenced(id),
      2,
    );
  const campaign = [...campaigns.keys()].sort((left, right) => sourced(right) - sourced(left))[0];
  const partner = [...partners.keys()].sort((left, right) => influenced(right) - influenced(left))[0];
  expect(sourced(campaign)).toBeGreaterThan(0);
  expect(influenced(partner)).toBeGreaterThan(0);
  await expectShownAmount(page, "campaign", campaign, "campaign.pipelineSourced", sourced(campaign));
  await expectShownAmount(page, "partner", partner, "partner.revenueInfluenced", influenced(partner));
  expect(errors).toEqual([]);
});
