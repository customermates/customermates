import type { Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { configureDrawer, openConfigure, openConfigureTab } from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

async function readModel(database: Client, companyId: string) {
  const result = await database.query(
    'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0]?.snapshot);
}

async function savedExpanded(database: Client, companyId: string) {
  const result = await database.query(
    `SELECT settings FROM "P13n" WHERE "companyId" = $1 AND "p13nId" = 'configure-graph'`,
    [companyId],
  );
  return ((result.rows[0]?.settings as { expanded?: string[] } | undefined)?.expanded ?? []) as string[];
}

test("graph nodes share one structure with an Add menu and in-place expansion", async ({
  page,
  database,
  companyId,
}) => {
  const errors = captureErrors(page);
  const dealId = presetId(companyId, "deal");
  await openConfigure(page);
  const deal = page.locator(`[data-configure-node="${dealId}"]`);
  await expect(deal).toBeVisible();
  await expect(deal.getByRole("link", { name: /\d+\s*records?/ })).toHaveAttribute("href", `/en/records/${dealId}`);
  await expect(deal.getByRole("button", { name: "Add field to Deals" })).toHaveCount(0);

  const more = page.locator(`[data-configure-more="${dealId}"]`);
  if (await more.count()) {
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(more).toHaveText("Show fewer");
    await expect(page).not.toHaveURL(/typeId=/);
    await expect.poll(() => savedExpanded(database, companyId)).toContain(dealId);
    await page.reload();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await more.press("Enter");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => savedExpanded(database, companyId)).not.toContain(dealId);
  }

  await deal.getByRole("button", { name: "Add to Deals", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText([
    "Field",
    "Calculated field",
    "Relationship",
    "Channels",
    "Sub-list",
  ]);
  await page.getByRole("menuitem", { name: "Relationship", exact: true }).click();
  const drawer = configureDrawer(page);
  await expect(drawer.locator("[data-relationship-side=source]")).toContainText("Deals");
  await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await deal.getByRole("button", { name: "Add to Deals", exact: true }).click();
  await page.getByRole("menuitem", { name: "Calculated field", exact: true }).click();
  await expect(
    drawer.locator("[data-slot=collapsible-section-trigger]").filter({ hasText: "Calculation" }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await deal.getByRole("button", { name: "Deals", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`typeId=${dealId}`));
  expect(errors).toEqual([]);
});

test("creates a sub-list from the parent's Add menu and groups it with the parent", async ({
  page,
  database,
  companyId,
}) => {
  const errors = captureErrors(page);
  const dealId = presetId(companyId, "deal");
  await openConfigure(page);
  const deal = page.locator(`[data-configure-node="${dealId}"]`);
  await deal.getByRole("button", { name: "Add to Deals", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sub-list", exact: true }).click();
  const drawer = configureDrawer(page);
  await expect(drawer.getByText("New sub-list of Deals", { exact: true })).toBeVisible();
  await expect(drawer).toContainText("Sub-list of Deals · each entry lives inside one Deal");
  await expect(drawer.getByRole("combobox", { name: "Access" })).toHaveCount(0);
  await drawer.locator("#name").fill("Milestone");
  await expect(drawer.getByRole("textbox", { name: "Plural name", exact: true })).toHaveValue("Milestones");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible({ timeout: 30000 });

  const model = await readModel(database, companyId);
  const milestone = model.types.find((type) => type.label === "Milestone");
  expect(milestone).toMatchObject({ pluralLabel: "Milestones", embedded: true, navigationVisible: false });
  const parent = model.relationships.find((relation) => relation.id === milestone?.parentRelationshipId);
  expect(parent).toMatchObject({
    sourceTypeId: milestone?.id,
    targetTypeId: dealId,
    sourceCardinality: "one",
    targetCardinality: "many",
    onTargetDelete: "cascade",
    messagesOnSource: false,
    messagesOnTarget: false,
  });

  await openConfigure(page);
  const node = page.locator(`[data-configure-node="${milestone?.id}"]`);
  await expect(node).toContainText("Sub-list of Deals");
  await expect(node.locator("[data-configure-sublist-explanation]")).toBeVisible();
  await expect(page.locator("[data-configure-sublist-group]")).toHaveCount(1);
  const header = node.getByRole("button", { name: "Milestones", exact: true });
  const headerBox = await header.boundingBox();
  const dealHeaderBox = await deal.getByRole("button", { name: "Deals", exact: true }).boundingBox();
  expect(headerBox?.height).toBeCloseTo(dealHeaderBox?.height ?? 0, 0);
  const nameBox = await header.locator(".font-semibold").boundingBox();
  const fieldNameBox = await node.locator("[data-configure-graph-field] .font-medium").first().boundingBox();
  expect(fieldNameBox?.x).toBeCloseTo(nameBox?.x ?? 0, 0);
  await expect(page.locator("[data-configure-relationship]").first().locator("..")).toHaveCSS("z-index", "auto");
  await expect(node.locator("[data-configure-sublist-explanation]")).toContainText(
    "Sub-list of Deals · each entry lives inside one Deal",
  );
  await node.locator("[data-configure-sublist-explanation]").getByRole("link", { name: "Deals", exact: true }).click();
  await expect(deal).toHaveAttribute("data-focus-highlight", "");
  await expect(node.getByRole("button", { name: "Add to Milestones", exact: true })).toBeVisible();
  await node.getByRole("button", { name: "Add to Milestones", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sub-list", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("the Relationships tab uses the Fields row style", async ({ page, companyId }) => {
  const errors = captureErrors(page);
  await openConfigure(page, presetId(companyId, "lineItem"));
  await expect(page.locator("[data-configure-sublist-explanation]")).toContainText("Sub-list of Deals");
  await openConfigureTab(page, "Relationships");
  const row = page.locator(`[data-configure-relationship-row="${presetId(companyId, "lineItem.deal")}"]`);
  await expect(row).toHaveClass(/bg-card/);
  await expect(row).toContainText("Deal");
  await expect(row).toContainText(/(One|Many) to (one|many) · Deals/);
  await openConfigureTab(page, "Fields");
  const fieldRow = page.locator("[data-configure-field]").first();
  await expect(fieldRow).toHaveClass(/bg-card/);
  expect(errors).toEqual([]);
});
