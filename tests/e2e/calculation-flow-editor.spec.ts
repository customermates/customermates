import type { Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { calculationChip, calculationFlow, chooseValueSource, pickOption } from "./calculation-flow";
import { addFromConfigure, openConfigure, openConfigureRow, openDrawerTab, saveDrawer } from "./configure";
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

async function selectOption(page: Page, label: string, option: string) {
  await page.getByRole("dialog").getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("edits an existing snapshot as a lookup with an Updates mode and keeps its stored shape", async ({
  page,
  database,
  companyId,
}) => {
  const errors = captureErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const dialog = page.getByRole("dialog");
  await openConfigure(page, id("lineItem"));
  await openConfigureRow(page, "Fields", "Saved unit price");
  await openDrawerTab(page, "Calculation");
  const flow = calculationFlow(page);
  await expect(dialog.getByRole("combobox", { name: "Value source", exact: true })).toContainText(
    "Taken from a linked record",
  );
  await expect(flow).toHaveAttribute("data-calculation-flow", "lookup");
  await expect(calculationChip(page, "relationship")).toHaveText("Service · Many to one");
  await expect(flow.locator('[data-calculation-node="linked"]')).toContainText("Take");
  await expect(calculationChip(page, "value")).toHaveText("Price");
  await expect(flow.locator('[data-calculation-node="result"]')).toContainText("Money");
  await expect(flow.locator("[data-calculation-example]")).toBeVisible();
  await expect(flow.locator("[data-calculation-sentence]")).toHaveText(
    "Saved unit price shows the Price of the linked Service. It is saved when Pricing changes to Saved price. People can type over it.",
  );
  const more = dialog.locator('[data-slot="collapsible-section-trigger"]').filter({ hasText: "More options" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toContainText("Saved when a field changes");
  await openDrawerTab(page, "More options");
  await expect(dialog.getByRole("combobox", { name: "Updates", exact: true })).toContainText(
    "Saved when a field changes",
  );
  await expect(dialog.getByRole("switch", { name: "Let people type over it", exact: true })).toBeChecked();

  await selectOption(page, "Updates", "Saved on request");
  await expect(dialog.getByRole("combobox", { name: "When this field changes", exact: true })).toHaveCount(0);
  await saveDrawer(page);
  const saved = (await readModel(database, companyId)).fields.find((field) => field.id === id("lineItem.savedPrice"));
  expect(saved?.behavior).toEqual({
    kind: "snapshot",
    capture: "explicit",
    allowManualOverride: true,
    expression: {
      kind: "related",
      relationId: id("lineItem.service"),
      direction: "outgoing",
      reducer: "one",
      expression: { kind: "field", fieldId: id("service.amount") },
    },
  });

  await openConfigureRow(page, "Fields", "Saved unit price");
  await openDrawerTab(page, "More options");
  await selectOption(page, "Updates", "Always up to date");
  await expect(dialog.getByRole("switch", { name: "Let people type over it", exact: true })).toHaveCount(0);
  await saveDrawer(page);
  expect(
    (await readModel(database, companyId)).fields.find((field) => field.id === id("lineItem.savedPrice"))?.behavior,
  ).toEqual({
    kind: "lookup",
    expression: {
      kind: "related",
      relationId: id("lineItem.service"),
      direction: "outgoing",
      reducer: "one",
      expression: { kind: "field", fieldId: id("service.amount") },
    },
  });
  expect(errors).toEqual([]);
});

test("names what is missing and refuses to save an incomplete flow", async ({ page, companyId }) => {
  const errors = captureErrors(page);
  const dialog = page.getByRole("dialog");
  await openConfigure(page, presetId(companyId, "deal"));
  await addFromConfigure(page, "Calculated field");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Open total");
  await chooseValueSource(page, "Counted or totalled from linked records");
  const flow = calculationFlow(page);
  await expect(flow.locator("[data-calculation-sentence]")).toHaveText("Pick which linked records to use.");
  await pickOption(page, calculationChip(page, "pick-relationship"), "Line items · One to many");
  await expect(flow.locator("[data-calculation-sentence]")).toHaveText("Pick which value to add up.");
  await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
  const linked = flow.locator('[data-calculation-node="linked"]');
  await expect(linked).toHaveAttribute("data-invalid", "true");
  await expect(linked).toContainText("Pick which value to add up.");
  await expect(dialog.getByRole("status")).toHaveCount(0);

  await pickOption(page, calculationChip(page, "aggregate"), "Number");
  await expect(linked).toContainText("of linked Line items");
  await expect(calculationChip(page, "pick-field")).toHaveCount(0);
  await expect(flow.locator("[data-calculation-sentence]")).toHaveText("Open total counts the linked Line items.");
  await expect(flow.locator('[data-calculation-node="result"]')).toContainText("Number");
  await expect(linked).not.toHaveAttribute("data-invalid", "true");
  expect(errors).toEqual([]);
});

test("fits the flow and its picker to a phone screen", async ({ page, companyId }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openConfigure(page, presetId(companyId, "deal"));
  await openConfigureRow(page, "Fields", "Weighted value");
  await openDrawerTab(page, "Calculation");
  const flow = calculationFlow(page);
  await expect(flow.locator('[data-calculation-node="step"]')).toHaveCount(2);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  for (const node of await flow.locator("[data-calculation-node]").all()) {
    const box = await node.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  }
  await calculationChip(page, "operation").first().click();
  const option = page.getByRole("option", { name: "Divide", exact: true });
  await expect(option).toBeVisible();
  const sheet = await option.boundingBox();
  expect(sheet?.width ?? 0).toBeGreaterThan(300);
  await page.keyboard.press("Escape");
  await expect(option).toHaveCount(0);
  expect(errors).toEqual([]);
});
