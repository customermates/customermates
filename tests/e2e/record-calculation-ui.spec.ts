import type { Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { openDrawerTab, addFromConfigure, configureTopBar, followConfigureLink, openConfigure, openConfigureRow, saveDrawer, selectConfigureList } from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

async function applyConfiguration(page: Page) {
  await saveDrawer(page);
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

async function openSidebarLink(page: Page, id: string) {
  await expect(page.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  const link = page.locator(`[id="${id}"]`);
  if (!(await link.isVisible())) await page.locator("#sidebar-trigger").click();
  await expect(page.locator("#nav-assistant")).toBeVisible();
  await link.click();
}

async function openRecordList(page: Page, typeId: string) {
  await openSidebarLink(page, `nav-records:${typeId}`);
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/en/records/${typeId}`);
  await expect(page.locator("#records-add")).toBeEnabled();
}

test("configures lookup, rollup, snapshot and manual values, then builds a weighted-value widget through the UI", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(360000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const dialog = page.getByRole("dialog");
  const id = (key: string) => presetId(companyId, key);
  const addMoneyField = async (name: string, source: string) => {
    await addFromConfigure(page, "Field");
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
    await selectOption(page, "Value type", "Money");
    await selectOption(page, "Value source", source);
    await openDrawerTab(page, "Calculation");
    await expect(dialog.locator('[data-calculation-editor="linear"]')).toHaveCount(1);
  };
  const selectType = async (label: string, typeId: string) => {
    await selectConfigureList(page, label);
    await expect.poll(() => new URL(page.url()).searchParams.get("typeId")).toBe(typeId);
    await expect(configureTopBar(page).getByRole("button", { name: "Add", exact: true })).toBeEnabled();
  };

  await test.step("create snapshot and rollup definitions on Services, and a singular lookup on Line items", async () => {
    await openConfigure(page);
    await selectType("Services", id("service"));
    await addMoneyField("Original price", "Saved at an event");
    const calculation = dialog.getByRole("region", { name: "Calculation", exact: true });
    await calculation.getByRole("combobox", { name: "Use", exact: true }).click();
    await page.getByRole("option", { name: "Field", exact: true }).click();
    await calculation.getByRole("combobox", { name: "Field", exact: true }).click();
    await page.getByRole("option", { name: "Price", exact: true }).click();
    await selectOption(page, "Capture value", "When the record is created");
    await expect(dialog.getByRole("switch", { name: "Allow a manually entered replacement value", exact: true })).not.toBeChecked();
    await applyConfiguration(page);

    await addMoneyField("Sold amount", "Total from linked records");
    await selectOption(page, "Relationship", "Line items");
    await selectOption(page, "Aggregation", "Sum");
    await selectOption(page, "Value", "Amount");
    await applyConfiguration(page);

    await selectType("Line items", id("lineItem"));
    await addMoneyField("Catalog price", "Value from a linked record");
    await selectOption(page, "Relationship", "Service");
    await selectOption(page, "Value", "Price");
    await expect(calculation.getByRole("combobox", { name: "Aggregation", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("lookup-calculation-editor.png"), animations: "disabled" });
    await applyConfiguration(page);
  });

  const model = await readModel(database, companyId);
  const fieldId = (typeId: string, label: string) => {
    const field = model.fields.find((candidate) => candidate.typeId === typeId && candidate.label === label);
    if (!field) throw new Error(`The configured field ${label} was not persisted`);
    return field.id;
  };
  const originalPriceId = fieldId(id("service"), "Original price");
  const soldAmountId = fieldId(id("service"), "Sold amount");
  const catalogPriceId = fieldId(id("lineItem"), "Catalog price");
  expect(model.fields.find((field) => field.id === originalPriceId)?.behavior).toEqual({
    kind: "snapshot",
    capture: "create",
    allowManualOverride: false,
    expression: { kind: "field", fieldId: id("service.amount") },
  });
  expect(model.fields.find((field) => field.id === soldAmountId)?.behavior).toEqual({
    kind: "rollup",
    expression: {
      kind: "related",
      relationId: id("lineItem.service"),
      direction: "incoming",
      reducer: "sum",
      expression: { kind: "field", fieldId: id("lineItem.amount") },
    },
  });
  expect(model.fields.find((field) => field.id === catalogPriceId)?.behavior).toEqual({
    kind: "lookup",
    expression: {
      kind: "related",
      relationId: id("lineItem.service"),
      direction: "outgoing",
      reducer: "one",
      expression: { kind: "field", fieldId: id("service.amount") },
    },
  });
  const numbers = async (typeId: string, nameFieldId: string, fieldIds: string[]) => {
    const result = await database.query(
      `SELECT name."textValue" AS name,field.definition->>'label' AS label,value.state,
        trim_scale(value."decimalValue")::text AS value,value.currency
        FROM "RecordValue" value
        JOIN "RecordValue" name ON name."companyId"=value."companyId" AND name."typeId"=value."typeId"
          AND name."recordId"=value."recordId" AND name."fieldId"=$3
        JOIN "RecordFieldDefinition" field ON field."companyId"=value."companyId" AND field.id=value."fieldId"
        WHERE value."companyId"=$1 AND value."typeId"=$2 AND value."fieldId"=ANY($4::text[])`,
      [companyId, typeId, nameFieldId, fieldIds],
    );
    return Object.fromEntries(result.rows.map((row) => [
      `${row.name}/${row.label}`,
      { state: row.state, value: row.value, currency: row.currency },
    ]));
  };
  const money = (value: string) => ({ state: "value", value, currency: "EUR" });
  const serviceValues = () => numbers(id("service"), id("service.name"), [originalPriceId, soldAmountId]);
  const catalogValues = () => numbers(id("lineItem"), id("lineItem.name"), [catalogPriceId]);
  const dealValues = () => numbers(id("deal"), id("deal.name"), [id("deal.totalValue"), id("deal.weightedValue")]);

  await test.step("create real records and prove all three configured calculation behaviors", async () => {
    await openRecordList(page, id("service"));
    for (const [name, price] of [["Calculation A", "1000"], ["Calculation B", "200"]]) {
      await page.locator("#records-add").click();
      await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
      await dialog.getByRole("textbox", { name: /^Price(?: \*)?$/ }).fill(price);
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect.poll(serviceValues).toEqual({
      "Calculation A/Original price": money("1000"),
      "Calculation A/Sold amount": money("0"),
      "Calculation B/Original price": money("200"),
      "Calculation B/Sold amount": money("0"),
    });
    await openRecordList(page, id("deal"));
    await page.locator("#records-add").click();
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Configured opportunity");
    await selectOption(page, "Stage", "Proposal");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Configured opportunity", exact: true }).click();
    for (const [name, service, quantity] of [["Calculated A", "Calculation A", "2"], ["Calculated B", "Calculation B", "3"]]) {
      await dialog.getByRole("button", { name: "Add Line item", exact: true }).click();
      await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(2);
      const child = dialog.last();
      await child.getByRole("textbox", { name: "Name", exact: false }).fill(name);
      await child.getByRole("textbox", { name: "Quantity", exact: false }).fill(quantity);
      await child.getByRole("combobox", { name: "Service", exact: true }).click();
      await page.getByRole("option", { name: service, exact: true }).click();
      await child.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(1);
      await expect(dialog.getByRole("region", { name: "Line items", exact: true }).getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect.poll(catalogValues).toEqual({ "Calculated A/Catalog price": money("1000"), "Calculated B/Catalog price": money("200") });
    await expect.poll(serviceValues).toEqual({
      "Calculation A/Original price": money("1000"),
      "Calculation A/Sold amount": money("2000"),
      "Calculation B/Original price": money("200"),
      "Calculation B/Sold amount": money("600"),
    });
    await expect.poll(dealValues).toEqual({ "Configured opportunity/Value": money("2600"), "Configured opportunity/Weighted value": money("1560") });
    await expect(dialog.getByText("€2,600.00", { exact: true })).toBeVisible();
    await expect(dialog.getByText("€1,560.00", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  const changePrice = async (price: string) => {
    await openRecordList(page, id("service"));
    await page.getByRole("button", { name: "Calculation A", exact: true }).click();
    const original = dialog.locator(`[data-entity-field="${originalPriceId}"]`);
    await original.getByText("€1,000.00", { exact: true }).scrollIntoViewIfNeeded();
    await expect(original.getByText("€1,000.00", { exact: true })).toBeVisible();
    await expect(dialog.locator(`[id="values.${originalPriceId}"]`)).toHaveCount(0);
    await dialog.getByRole("textbox", { name: /^Price(?: \*)?$/ }).fill(price);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  };

  await test.step("propagate live price changes while retaining the captured creation price", async () => {
    await changePrice("1200");
    await expect.poll(catalogValues).toEqual({ "Calculated A/Catalog price": money("1200"), "Calculated B/Catalog price": money("200") });
    await expect.poll(serviceValues).toEqual({
      "Calculation A/Original price": money("1000"),
      "Calculation A/Sold amount": money("2400"),
      "Calculation B/Original price": money("200"),
      "Calculation B/Sold amount": money("600"),
    });
    await expect.poll(dealValues).toEqual({ "Configured opportunity/Value": money("3000"), "Configured opportunity/Weighted value": money("1800") });
    await openRecordList(page, id("deal"));
    await page.getByRole("button", { name: "Configured opportunity", exact: true }).click();
    await dialog.getByRole("region", { name: "Line items", exact: true }).getByRole("button", { name: "Calculated A", exact: true }).click();
    const lookup = dialog.last().locator(`[data-entity-field="${catalogPriceId}"]`);
    await lookup.getByText("€1,200.00", { exact: true }).scrollIntoViewIfNeeded();
    await expect(lookup.getByText("€1,200.00", { exact: true })).toBeVisible();
    await expect(dialog.last().locator(`[id="values.${catalogPriceId}"]`)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { includeHidden: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  await test.step("switch Deal Value to manual, retain its result, and continue weighting the entered amount", async () => {
    await followConfigureLink(page);
    await openConfigureRow(page, "Fields", "Value");
    await selectOption(page, "Value source", "Entered manually");
    await expect(dialog.locator('[data-calculation-editor="linear"]')).toHaveCount(0);
    await applyConfiguration(page);
    expect((await readModel(database, companyId)).fields.find((field) => field.id === id("deal.totalValue"))?.behavior).toEqual({ kind: "input" });
    await expect.poll(dealValues).toEqual({ "Configured opportunity/Value": money("3000"), "Configured opportunity/Weighted value": money("1800") });
    await openRecordList(page, id("deal"));
    await page.getByRole("button", { name: "Configured opportunity", exact: true }).click();
    const value = dialog.getByRole("textbox", { name: "Value", exact: true });
    await expect(value).toHaveValue("3000");
    await value.fill("4000");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(dealValues).toEqual({ "Configured opportunity/Value": money("4000"), "Configured opportunity/Weighted value": money("2400") });
    await changePrice("1400");
    await expect.poll(catalogValues).toEqual({ "Calculated A/Catalog price": money("1400"), "Calculated B/Catalog price": money("200") });
    await expect.poll(serviceValues).toEqual({
      "Calculation A/Original price": money("1000"),
      "Calculation A/Sold amount": money("2800"),
      "Calculation B/Original price": money("200"),
      "Calculation B/Sold amount": money("600"),
    });
    await expect.poll(dealValues).toEqual({ "Configured opportunity/Value": money("4000"), "Configured opportunity/Weighted value": money("2400") });
  });

  await test.step("select Weighted value in the unified builder and persist its exact measure", async () => {
    await openSidebarLink(page, "nav-dashboard");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/en/dashboard");
    await page.locator("#dashboard-add-widget").click();
    await dialog.locator("#widget-kind-chart").click();
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Configured weighted pipeline");
    await dialog.getByRole("combobox", { name: "Records from", exact: true }).click();
    await page.locator('[data-slot="popover-content"]').getByRole("combobox").fill("Deals");
    await page.getByRole("option", { name: "Deals", exact: true }).click();
    await selectOption(page, "Measure", "Sum");
    await dialog.getByRole("combobox", { name: "Value field", exact: false }).click();
    await page.getByRole("option", { name: "Weighted value", exact: true }).click();
    await selectOption(page, "Group by", "No grouping");
    await expect(dialog.getByRole("tablist")).toHaveCount(0);
    await expect(dialog.getByRole("heading", { name: "Filters, none active", exact: true })).toBeAttached();
    await expect(dialog.getByRole("region", { name: "Appearance", exact: true })).toBeAttached();
    await dialog.getByRole("textbox", { name: "Name", exact: false }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("weighted-widget-editor-settings.png"), animations: "disabled" });
    await expect(dialog.getByText("Overall: €2,400.00", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("weighted-widget-editor-preview.png"), animations: "disabled" });
    await dialog.locator("#widget-modal-save").click();
    await expect(dialog).not.toBeVisible();
    const saved = await database.query('SELECT measure FROM "Widget" WHERE "companyId"=$1 AND name=$2', [companyId, "Configured weighted pipeline"]);
    expect(saved.rows).toHaveLength(1);
    expect(saved.rows[0].measure).toMatchObject({
      source: { typeId: id("deal"), filters: [] },
      aggregation: "sum",
      valueFieldId: id("deal.weightedValue"),
      groupBy: null,
    });
    const widget = page.locator('[data-uid="app-card"]').filter({ has: page.getByRole("heading", { name: "Configured weighted pipeline", exact: true }) });
    await expect(widget.getByText("Overall: €2,400.00", { exact: true })).toBeVisible();
    await page.reload();
    await expect(widget.getByText("Overall: €2,400.00", { exact: true })).toBeVisible();
    await widget.screenshot({ path: testInfo.outputPath("configured-weighted-widget.png"), animations: "disabled" });
    await expect.poll(dealValues).toEqual({ "Configured opportunity/Value": money("4000"), "Configured opportunity/Weighted value": money("2400") });
  });
  expect(errors).toEqual([]);
});
