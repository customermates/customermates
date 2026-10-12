import { randomUUID } from "node:crypto";

import type { Client } from "pg";
import type { Locator, Page } from "@playwright/test";

import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import { secondUser } from "./second-user";

const SYSTEM_COLUMNS = ["Assigned to", "Created at", "Updated at"];

async function create(page: Page, mutation: Record<string, unknown>) {
  const model = RecordModelSchema.parse(await (await page.request.post("/api/v1/model/read", { data: {} })).json());
  const response = await page.request.post("/api/v1/records/mutate", {
    data: { expectedRevision: model.revision, idempotencyKey: randomUUID(), mutation: { action: "create", ...mutation } },
  });
  expect(response.status(), await response.text()).toBe(200);
  const result = RecordOperationResultSchema.parse(await response.json());
  if (result.status !== "completed") throw new Error("The record must be created synchronously");
  return result.refs[0];
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

async function openLineItems(page: Page, url: string) {
  await page.goto(url);
  const main = page.getByRole("main");
  const overview = main.getByRole("tab", { name: "Overview", exact: true });
  if (await overview.isVisible()) await overview.click();
  const lines = main.getByRole("region", { name: "Line items", exact: true });
  await expect(lines.locator("[data-embedded-count]")).toHaveText("1");
  return lines;
}

function header(lines: Locator, label: string) {
  return lines.getByRole("columnheader").filter({ hasText: new RegExp(`^\\W*${label}\\W*$`, "i") });
}

async function openPicker(page: Page, lines: Locator) {
  await lines.getByRole("button", { name: "Columns for Line items", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Columns for Line items", exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

async function storedChoice(database: Client, companyId: string, userId: string) {
  const { rows } = await database.query<{ settings: { columns: string[] } | null }>(
    'SELECT settings FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
    [companyId, userId, `sublist-columns:${presetId(companyId, "lineItem")}`],
  );
  return rows.length ? rows[0].settings : undefined;
}

test("each person picks their own sub-list columns and the default leaves out system columns", async ({
  page,
  browser,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = trackErrors(page);
  const isMobile = Boolean(testInfo.project.use.isMobile);
  const id = (key: string) => presetId(companyId, key);
  await page.goto(`/en/records/${id("deal")}`);
  const deal = await create(page, {
    typeId: id("deal"),
    fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: "Columns deal" } }],
  });
  await create(page, {
    typeId: id("lineItem"),
    fields: [{ fieldId: id("lineItem.name"), value: { kind: "text", value: "Columns line" } }],
    links: [{ relationId: id("lineItem.deal"), direction: "outgoing", record: deal }],
  });
  const url = `/en/records/${deal.typeId}/${deal.recordId}`;

  let lines = await openLineItems(page, url);
  if (!isMobile) {
    for (const label of ["Quantity", "Pricing", "Amount"]) await expect(header(lines, label), label).toHaveCount(1);
    for (const label of SYSTEM_COLUMNS) await expect(header(lines, label), label).toHaveCount(0);
  }
  let menu = await openPicker(page, lines);
  await expect(menu.getByRole("checkbox", { name: "Name", exact: true })).toBeChecked();
  await expect(menu.getByRole("checkbox", { name: "Name", exact: true })).toBeDisabled();
  await expect(menu.getByRole("checkbox", { name: "Pricing", exact: true })).toBeChecked();
  for (const label of SYSTEM_COLUMNS) await expect(menu.getByRole("checkbox", { name: label, exact: true })).not.toBeChecked();
  await expect(menu.getByRole("checkbox", { name: "Deal", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Reset to default", exact: true })).toHaveCount(0);

  await menu.getByRole("checkbox", { name: "Pricing", exact: true }).click();
  await expect(menu.getByRole("checkbox", { name: "Pricing", exact: true })).not.toBeChecked();
  if (!isMobile) await expect(header(lines, "Pricing")).toHaveCount(0);
  await expect
    .poll(async () => (await storedChoice(database, companyId, workspace.userId))?.columns ?? null)
    .toEqual(expect.arrayContaining([id("lineItem.quantity"), id("lineItem.amount")]));
  expect((await storedChoice(database, companyId, workspace.userId))?.columns).not.toContain(id("lineItem.pricingMode"));
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  lines = await openLineItems(page, url);
  if (!isMobile) {
    await expect(header(lines, "Quantity")).toHaveCount(1);
    await expect(header(lines, "Pricing")).toHaveCount(0);
  }
  menu = await openPicker(page, lines);
  await expect(menu.getByRole("checkbox", { name: "Pricing", exact: true })).not.toBeChecked();
  await expect(menu.getByRole("checkbox", { name: "Quantity", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");

  const other = await secondUser(browser, database, companyId, testInfo);
  try {
    const otherLines = await openLineItems(other.page, url);
    if (!isMobile) {
      await expect(header(otherLines, "Pricing")).toHaveCount(1);
      for (const label of SYSTEM_COLUMNS) await expect(header(otherLines, label), label).toHaveCount(0);
    }
    const otherMenu = await openPicker(other.page, otherLines);
    await expect(otherMenu.getByRole("checkbox", { name: "Pricing", exact: true })).toBeChecked();
    expect(other.errors).toEqual([]);
  } finally {
    await other.close();
  }

  menu = await openPicker(page, lines);
  await menu.getByRole("button", { name: "Reset to default", exact: true }).click();
  await expect(menu.getByRole("checkbox", { name: "Pricing", exact: true })).toBeChecked();
  await expect.poll(() => storedChoice(database, companyId, workspace.userId)).toBeNull();
  await page.keyboard.press("Escape");
  lines = await openLineItems(page, url);
  if (!isMobile) {
    await expect(header(lines, "Pricing")).toHaveCount(1);
    for (const label of SYSTEM_COLUMNS) await expect(header(lines, label), label).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
