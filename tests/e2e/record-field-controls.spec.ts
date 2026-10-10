import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { RecordModelSchema, type RecordModel } from "../../features/records/record-model.schema";
import { openDrawerTab, addFromConfigure, followConfigureLink, openConfigure, openConfigureRow, saveDrawer } from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";
import { openRecordDetails, runNamedRowAction } from "./record-rows";

async function choose(page: Page, label: string | RegExp, option: string) {
  await page
    .getByRole("dialog")
    .getByRole("combobox", typeof label === "string" ? { name: label, exact: true } : { name: label })
    .click();
  await page.getByRole("option", { name: option, exact: true }).filter({ visible: true }).click();
}

async function apply(page: Page) {
  await saveDrawer(page);
}

async function createList(page: Page, name: string) {
  await openConfigure(page);
  await addFromConfigure(page, "List");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill(name);
  await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  const typeId = new URL(page.url()).pathname.split("/").at(-1)!;
  await followConfigureLink(page);
  return typeId;
}

async function addField(page: Page, name: string, valueType: string, behavior?: string) {
  await addFromConfigure(page, "Field");
  await page.getByRole("dialog").getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await choose(page, "Value type", valueType);
  if (behavior) await choose(page, "Value source", behavior);
  if (behavior && behavior !== "Entered manually") await openDrawerTab(page, "Calculation");
  else if (valueType === "Single choice") await openDrawerTab(page, "Options");
}

function calculationRegion(page: Page) {
  return page.getByRole("dialog").getByRole("region", { name: "Calculation", exact: true });
}

async function pickValue(page: Page, option: string) {
  await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
  await calculationRegion(page)
    .locator('[data-calculation-node="inputs"] [data-calculation-chip="pick-value"]')
    .first()
    .click();
  await page.getByRole("option", { name: option, exact: true }).filter({ visible: true }).click();
}

async function pickFixedValue(page: Page, type: string, value: string) {
  await pickValue(page, "Fixed value");
  await page.locator('[id="calculation-fixed-value.literalKind"]').click();
  await page.getByRole("option", { name: type, exact: true }).click();
  const input = page.locator('[id="calculation-fixed-value.value.value"]');
  if (type === "Yes or no") {
    await input.click();
    await page.getByRole("option", { name: value, exact: true }).click();
  } else if (type === "Date") {
    await input.click();
    await page.getByRole("button", { name: value, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="calendar"]')).toHaveCount(0);
  } else await input.fill(value);
  await page.getByRole("button", { name: "Use this value", exact: true }).click();
  await expect(page.locator('[id="calculation-fixed-value.literalKind"]')).toHaveCount(0);
}

async function chooseUpdates(page: Page, mode: string) {
  await openDrawerTab(page, "More options");
  await choose(page, "Updates", mode);
}

async function list(page: Page, typeId: string) {
  const link = page.locator(`[id="nav-records:${typeId}"]`);
  if (!(await link.isVisible())) await page.locator("#sidebar-trigger").click();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}$`));
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

test("configures and persists all fourteen field types, multiple values and calendar controls through the UI", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(480000);
  const errors = collectErrors(page);
  const name = `Field controls ${randomUUID().slice(0, 8)}`;
  const typeId = await createList(page, name);
  const definitions = [
    ["Plain text", "Text"],
    ["Precise number", "Number"],
    ["Exact money", "Money"],
    ["Enabled", "Yes or no"],
    ["Calendar date", "Date"],
    ["Calendar time", "Date and time"],
    ["Calendar range", "Date range"],
    ["Calendar time range", "Date and time range"],
    ["Choice", "Single choice"],
    ["Email addresses", "Email"],
    ["Phone numbers", "Phone"],
    ["Web addresses", "Web address"],
    ["Responsible member", "Member"],
    ["Notes", "Formatted text"],
  ];
  const dialog = page.getByRole("dialog");
  for (const [label, valueType] of definitions) {
    await test.step(`configure ${valueType}`, async () => {
      await addField(page, label, valueType);
      if (["Email", "Phone", "Web address"].includes(valueType))
        await dialog.getByRole("switch", { name: "Allow several values", exact: true }).check();
      if (valueType === "Single choice") {
        const popover = page.locator('[data-slot="popover-content"]');
        const addAttribute = async (name: string, type?: string) => {
          await dialog.getByRole("button", { name: "Add attribute", exact: true }).click();
          await popover.getByRole("textbox", { name: "Attribute name", exact: true }).fill(name);
          if (type) {
            await popover.getByRole("combobox", { name: "Value type", exact: true }).click();
            await page.getByRole("option", { name: type, exact: true }).click();
          }
          await popover.getByRole("button", { name: "Save", exact: true }).click();
          await expect(popover).toHaveCount(0);
        };
        await dialog.getByRole("button", { name: "Add option", exact: true }).click();
        await dialog.getByRole("textbox", { name: "Option", exact: true }).fill("Accepted");
        await dialog.getByRole("button", { name: "Add option", exact: true }).click();
        await dialog.getByRole("textbox", { name: "Option", exact: true }).nth(1).fill("Removed draft option");
        await runNamedRowAction(page, dialog, "Removed draft option", "Delete");
        await expect(dialog.getByRole("textbox", { name: "Option", exact: true })).toHaveCount(1);
        await dialog.getByRole("button", { name: "Add attribute", exact: true }).click();
        await popover.getByRole("button", { name: "Probability %", exact: true }).click();
        await dialog.getByRole("textbox", { name: "Probability %", exact: true }).fill("0");
        await dialog.getByRole("combobox", { name: "Color", exact: true }).click();
        await page.getByRole("option", { name: "Green", exact: true }).click();
        await addAttribute("priority");
        await dialog.getByRole("textbox", { name: "priority", exact: true }).fill("2.25");
        await addAttribute("active", "Yes or no");
        await dialog.getByRole("combobox", { name: "active", exact: true }).click();
        await page.getByRole("option", { name: "No", exact: true }).click();
        await addAttribute("removed");
        await dialog.getByRole("button", { name: "More actions for removed", exact: true }).click();
        await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
        await expect(dialog.locator('[data-option-column="removed"]')).toHaveCount(0);
      }
      await apply(page);
    });
  }
  const model: RecordModel = RecordModelSchema.parse(
    (
      await database.query(
        'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
        [companyId],
      )
    ).rows[0].snapshot,
  );
  const fields = model.fields.filter((field) => field.typeId === typeId);
  expect(new Set(fields.map((field) => field.valueType)).size).toBe(14);
  expect(fields.find((field) => field.label === "Choice")?.options).toEqual([
    expect.objectContaining({
      label: "Accepted",
      color: "success",
      attributes: [
        { key: "probability", value: { kind: "decimal", value: "0", currency: null } },
        { key: "priority", value: { kind: "decimal", value: "2.25", currency: null } },
        { key: "active", value: { kind: "boolean", value: false } },
      ],
    }),
  ]);
  const field = (label: string) => {
    const result = fields.find((candidate) => candidate.label === label);
    if (!result) throw new Error(`Missing configured field ${label}`);
    return result;
  };
  const row = (label: string) => dialog.locator(`[data-entity-field="${field(label).id}"]`);
  await list(page, typeId);
  await page.locator("#records-add").click();
  await dialog.getByRole("textbox", { name, exact: false }).fill("Complete typed record");
  await dialog.getByRole("textbox", { name: "Plain text", exact: true }).fill("Unicode € and café");
  await dialog.getByRole("textbox", { name: "Precise number", exact: true }).fill("-12.125");
  await dialog.getByRole("textbox", { name: "Exact money", exact: true }).fill("0.000125");
  await row("Enabled").getByRole("switch").check();
  await choose(page, "Choice", "Accepted");
  await dialog
    .getByRole("textbox", { name: "Email addresses", exact: true })
    .fill("one@example.test\ntwo@example.test");
  await dialog.getByRole("textbox", { name: "Phone numbers", exact: true }).fill("+49123456789\n+441234567890");
  await dialog
    .getByRole("textbox", { name: "Web addresses", exact: true })
    .fill("https://example.test/a\nhttps://example.test/b");
  await dialog.getByRole("combobox", { name: "Responsible member", exact: true }).click();
  await page.getByRole("option", { name: /Browser Administrator/ }).click();
  for (const label of ["Calendar date", "Calendar time", "Calendar time range"]) {
    const trigger = row(label).locator(`[id^="values.${field(label).id}-"]`);
    await trigger.click();
    const calendar = page.locator('[data-slot="popover-content"][data-state="open"]');
    await calendar.getByRole("button", { name: "Today", exact: true }).click();
    if (label === "Calendar time") {
      await page.getByRole("textbox", { name: "Start time", exact: true }).fill("14:35:27");
      await page.getByRole("textbox", { name: "Start time", exact: true }).press("Enter");
    }
    if (label === "Calendar time range") {
      await page.getByRole("textbox", { name: "Start time", exact: true }).fill("09:10:11");
      await page.getByRole("textbox", { name: "Start time", exact: true }).press("Enter");
      await page.getByRole("textbox", { name: "End time", exact: true }).fill("17:20:21");
      await page.getByRole("textbox", { name: "End time", exact: true }).press("Enter");
    }
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="popover-content"][data-state="open"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await row("Calendar range")
    .locator(`[id^="values.${field("Calendar range").id}-"]`)
    .click();
  const days = page.locator('[data-slot="calendar"] button[data-day]');
  await expect(days.first()).toBeVisible();
  const startDay = await days.nth(10).getAttribute("data-day");
  const endDay = await days.nth(12).getAttribute("data-day");
  await days.nth(10).click();
  await days.nth(12).click();
  await page.keyboard.press("Escape");
  await expect(row("Calendar range").locator(`[id^="values.${field("Calendar range").id}-"]`)).not.toContainText(
    "Pick a range",
  );
  await dialog.getByRole("tab", { name: "Notes", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Notes", exact: true }).fill("Formatted notes survive typed storage");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await database.query(
    'SELECT "fieldId",state,"textValue","textListValue","decimalValue"::text AS "decimalValue",currency,"booleanValue","lexicalValue","jsonValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, typeId],
  );
  const value = (label: string) => saved.rows.find((entry) => entry.fieldId === field(label).id);
  expect(value("Plain text").textValue).toBe("Unicode € and café");
  expect(Number(value("Precise number").decimalValue)).toBe(-12.125);
  expect(Number(value("Exact money").decimalValue)).toBe(0.000125);
  expect(value("Exact money").currency).toBe("EUR");
  expect(value("Enabled").booleanValue).toBe(true);
  expect(value("Choice").textValue).toBe(field("Choice").options[0].id);
  expect(value("Responsible member").textValue).toBe(workspace.userId);
  for (const [label, expected] of [
    ["Email addresses", ["one@example.test", "two@example.test"]],
    ["Phone numbers", ["+49123456789", "+441234567890"]],
    ["Web addresses", ["https://example.test/a", "https://example.test/b"]],
  ] as const)
    expect(value(label).textListValue).toEqual(expected);
  expect(value("Calendar date").lexicalValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const localTime = async (stored: string) =>
    page.evaluate((iso) => {
      const date = new Date(iso);
      return [date.getHours(), date.getMinutes(), date.getSeconds()];
    }, stored);
  expect(await localTime(value("Calendar time").lexicalValue)).toEqual([14, 35, 27]);
  expect(value("Calendar range").jsonValue.start).toBe(startDay);
  expect(value("Calendar range").jsonValue.end).toBe(endDay);
  expect(await localTime(value("Calendar time range").jsonValue.start)).toEqual([9, 10, 11]);
  expect(await localTime(value("Calendar time range").jsonValue.end)).toEqual([17, 20, 21]);
  expect(JSON.stringify(value("Notes").jsonValue)).toContain("Formatted notes survive typed storage");
  await page.reload();
  await openRecordDetails(page, "Complete typed record");
  await expect(dialog.getByRole("tab", { name: "Notes", exact: true })).toHaveAttribute("data-state", "active");
  await expect(dialog.getByRole("textbox", { name: "Notes", exact: true })).toContainText(
    "Formatted notes survive typed storage",
  );
  await dialog.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Email addresses", exact: true })).toHaveValue(
    "one@example.test\ntwo@example.test",
  );
  await expect(row("Enabled").getByRole("switch")).toBeChecked();
  await expect(dialog.getByRole("combobox", { name: "Choice", exact: true })).toContainText("Accepted");
  await page.screenshot({
    path: testInfo.outputPath("all-field-controls.png"),
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("builds every calculation operator with the linear editor and persists results and visible errors", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(600000);
  const errors = collectErrors(page);
  const name = `Calculation controls ${randomUUID().slice(0, 8)}`;
  const typeId = await createList(page, name);
  type Literal = { type: string; value: string };
  const n = (value: string): Literal => ({ type: "Number", value });
  const b = (value: string): Literal => ({ type: "Yes or no", value });
  const t = (value: string): Literal => ({ type: "Text", value });
  const cases = [
    {
      operator: "Add",
      id: "add",
      type: "Number",
      arguments: [n("7"), n("3")],
      result: "10",
    },
    {
      operator: "Subtract",
      id: "subtract",
      type: "Number",
      arguments: [n("7"), n("3")],
      result: "4",
    },
    {
      operator: "Multiply",
      id: "multiply",
      type: "Number",
      arguments: [n("7"), n("3")],
      result: "21",
    },
    {
      operator: "Divide",
      id: "divide",
      type: "Number",
      arguments: [n("7"), n("2")],
      result: "3.5",
    },
    {
      operator: "Equals",
      id: "equal",
      type: "Yes or no",
      arguments: [t("same"), t("same")],
      result: true,
    },
    {
      operator: "Less than",
      id: "lessThan",
      type: "Yes or no",
      arguments: [n("7"), n("8")],
      result: true,
    },
    {
      operator: "Greater than",
      id: "greaterThan",
      type: "Yes or no",
      arguments: [n("7"), n("2")],
      result: true,
    },
    {
      operator: "All conditions",
      id: "and",
      type: "Yes or no",
      arguments: [b("Yes"), b("No")],
      result: false,
    },
    {
      operator: "Any condition",
      id: "or",
      type: "Yes or no",
      arguments: [b("No"), b("Yes")],
      result: true,
    },
    { operator: "Not", id: "not", type: "Yes or no", arguments: [b("No")], result: true },
    {
      operator: "If, then, otherwise",
      id: "if",
      type: "Number",
      arguments: [b("Yes"), n("11"), n("22")],
      result: "11",
    },
    {
      operator: "First available value",
      id: "coalesce",
      type: "Number",
      arguments: [{ type: "Field", value: "Missing number" }, n("9")],
      result: "9",
    },
    {
      operator: "Join text",
      id: "concat",
      type: "Text",
      arguments: [t("first"), t("second"), t("third")],
      result: "firstsecondthird",
    },
    {
      operator: "Lowercase",
      id: "lower",
      type: "Text",
      arguments: [t("MiXeD")],
      result: "mixed",
    },
    {
      operator: "Uppercase",
      id: "upper",
      type: "Text",
      arguments: [t("MiXeD")],
      result: "MIXED",
    },
    {
      operator: "Remove surrounding spaces",
      id: "trim",
      type: "Text",
      arguments: [t("  neat  ")],
      result: "neat",
    },
    {
      operator: "Days between",
      id: "daysBetween",
      type: "Number",
      arguments: [
        { type: "Date", value: "Today" },
        { type: "Date", value: "In a week" },
      ],
      result: "7",
    },
    {
      operator: "Divide",
      id: "divide",
      label: "Division error",
      type: "Number",
      arguments: [n("7"), n("0")],
      result: null,
    },
  ];
  const dialog = page.getByRole("dialog");
  const calculation = calculationRegion(page);
  await addField(page, "Missing number", "Number");
  await apply(page);
  for (const example of cases) {
    await test.step(`configure ${example.label ?? example.operator}`, async () => {
      await addField(page, example.label ?? example.operator, example.type, "Calculated from this record");
      await expect(dialog.locator('[data-calculation-flow="formula"]')).toHaveCount(1);
      await calculation.getByRole("button", { name: "Add input", exact: true }).click();
      await calculation.locator('[data-calculation-node="step"] [data-calculation-chip="operation"]').click();
      await page.locator(`[data-calculation-option="${example.id}"]`).click();
      await expect(calculation.locator('[data-calculation-node="step"]')).toHaveCount(1);
      await expect(calculation.locator('[data-calculation-chip="operation"]')).toHaveText(example.operator);
      if (example.operator === "Join text")
        await calculation.getByRole("button", { name: "Add input", exact: true }).click();
      await expect(
        calculation.locator('[data-calculation-node="inputs"] [data-calculation-chip="pick-value"]'),
      ).toHaveCount(example.arguments.length);
      for (const argument of example.arguments) {
        if (argument.type === "Field") await pickValue(page, argument.value);
        else await pickFixedValue(page, argument.type, argument.value);
      }
      await expect(calculation.locator('[data-calculation-chip="pick-value"]')).toHaveCount(0);
      await expect(calculation.locator('[data-calculation-node="step"]')).toHaveCount(1);
      await apply(page);
    });
  }
  await list(page, typeId);
  await page.locator("#records-add").click();
  await dialog.getByRole("textbox", { name, exact: false }).fill("Calculated record");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const values = await database.query(
    'SELECT f.definition->>\'label\' AS label,v.state,trim_scale(v."decimalValue")::text AS number,v."booleanValue",v."textValue",v."errorCode" FROM "RecordValue" v JOIN "RecordFieldDefinition" f ON f."companyId"=v."companyId" AND f.id=v."fieldId" WHERE v."companyId"=$1 AND v."typeId"=$2',
    [companyId, typeId],
  );
  for (const example of cases) {
    const value = values.rows.find((row) => row.label === (example.label ?? example.operator));
    if (example.result === null)
      expect(value).toMatchObject({
        state: "error",
        errorCode: "division_by_zero",
      });
    else
      expect(value).toMatchObject({
        state: "value",
        [example.type === "Number" ? "number" : example.type === "Text" ? "textValue" : "booleanValue"]: example.result,
      });
  }
  await page.reload();
  await openRecordDetails(page, "Calculated record");
  await expect(dialog.getByText("Calculation unavailable", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("calculation-operator-results.png"),
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("captures snapshots on request and on stage changes while preserving manual replacements and drafts", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = collectErrors(page);
  const name = `Snapshot controls ${randomUUID().slice(0, 8)}`;
  const typeId = await createList(page, name);
  const dialog = page.getByRole("dialog");
  await addField(page, "Source amount", "Number");
  await apply(page);
  await addField(page, "Decision", "Single choice");
  for (const label of ["Draft", "Approved"]) {
    await dialog.getByRole("button", { name: "Add option", exact: true }).click();
    await dialog.getByRole("textbox", { name: "Option", exact: true }).last().fill(label);
  }
  await apply(page);
  for (const [label, updates] of [
    ["Requested amount", "Saved on request"],
    ["Approved amount", "Saved when a field changes"],
  ]) {
    await addField(page, label, "Number", "Calculated from this record");
    await pickValue(page, "Source amount");
    await chooseUpdates(page, updates);
    if (label === "Requested amount")
      await dialog
        .getByRole("switch", {
          name: "Let people type over it",
          exact: true,
        })
        .check();
    else {
      await choose(page, /^When this field changes/, "Decision");
      await choose(page, /^To this value/, "Approved");
    }
    await apply(page);
  }
  const model = RecordModelSchema.parse(
    (
      await database.query(
        'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
        [companyId],
      )
    ).rows[0].snapshot,
  );
  const requested = model.fields.find((field) => field.typeId === typeId && field.label === "Requested amount")!;
  const approved = model.fields.find((field) => field.typeId === typeId && field.label === "Approved amount")!;
  const sourceAmount = model.fields.find((field) => field.typeId === typeId && field.label === "Source amount")!;
  const decision = model.fields.find((field) => field.typeId === typeId && field.label === "Decision")!;
  expect(requested.behavior).toMatchObject({
    kind: "snapshot",
    expression: { kind: "field", fieldId: sourceAmount.id },
    capture: "explicit",
    allowManualOverride: true,
  });
  expect(approved.behavior).toMatchObject({
    kind: "snapshot",
    expression: { kind: "field", fieldId: sourceAmount.id },
    capture: "whenChanged",
    triggerFieldId: decision.id,
    triggerValue: {
      kind: "select",
      value: decision.options.find((option) => option.label === "Approved")?.id,
    },
  });
  const requestedRow = () => dialog.locator(`[data-entity-field="${requested.id}"]`);
  const read = async () =>
    (
      await database.query(
        'SELECT "fieldId",state,trim_scale("decimalValue")::text AS value FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=ANY($3::text[]) ORDER BY "fieldId"',
        [companyId, typeId, [requested.id, approved.id]],
      )
    ).rows;
  const save = async () => {
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  };
  const open = async () => openRecordDetails(page, "Snapshot record");
  await list(page, typeId);
  await page.locator("#records-add").click();
  await dialog.getByRole("textbox", { name, exact: false }).fill("Snapshot record");
  await dialog.getByRole("textbox", { name: "Source amount", exact: true }).fill("10");
  await choose(page, "Decision", "Draft");
  await save();
  expect((await read()).every((value) => value.state === "missing")).toBe(true);
  await open();
  await dialog.getByRole("textbox", { name: "Source amount", exact: true }).fill("20");
  await requestedRow().getByRole("button", { name: "Capture Requested amount", exact: true }).click();
  await expect(
    requestedRow().getByRole("button", {
      name: "Capture Requested amount on save",
      exact: true,
    }),
  ).toBeVisible();
  await choose(page, "Decision", "Approved");
  await save();
  expect((await read()).map((value) => value.value)).toEqual(["20", "20"]);
  await open();
  await dialog.getByRole("textbox", { name: "Source amount", exact: true }).fill("30");
  await requestedRow().getByRole("textbox").fill("17.5");
  await save();
  expect((await read()).find((value) => value.fieldId === requested.id).value).toBe("17.5");
  expect((await read()).find((value) => value.fieldId === approved.id).value).toBe("20");
  await open();
  await requestedRow().getByRole("textbox").fill("999");
  await requestedRow().getByRole("button", { name: "Capture Requested amount", exact: true }).click();
  await requestedRow()
    .getByRole("button", {
      name: "Capture Requested amount on save",
      exact: true,
    })
    .click();
  await expect(requestedRow().getByRole("textbox")).toHaveValue("999");
  await requestedRow().getByRole("button", { name: "Capture Requested amount", exact: true }).click();
  await save();
  expect((await read()).find((value) => value.fieldId === requested.id).value).toBe("30");
  await page.reload();
  await open();
  await expect(requestedRow().getByRole("textbox")).toHaveValue("30");
  await page.screenshot({
    path: testInfo.outputPath("snapshot-capture-controls.png"),
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

async function editFieldDefinitionUi(page: Page, typeId: string, label: string) {
  await openConfigure(page, typeId);
  await openConfigureRow(page, "Fields", label);
  await expect(page.getByRole("dialog", { name: "Edit field", exact: true })).toBeVisible();
}

test("preserves missing, false, zero and exact money defaults and captures a snapshot only on a change to false", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(360000);
  const errors = collectErrors(page);
  const name = `Default parity ${randomUUID().slice(0, 8)}`;
  const typeId = await createList(page, name);
  const dialog = page.getByRole("dialog");
  await addField(page, "Missing amount", "Number");
  await expect(dialog.getByRole("switch", { name: "Set a default value", exact: true })).not.toBeChecked();
  await expect(dialog.getByRole("textbox", { name: "Default value", exact: true })).toHaveCount(0);
  await apply(page);
  const preciseMoney = "12345678901234567890.000125";
  for (const [label, valueType, value] of [
    ["False default", "Yes or no", false],
    ["Zero default", "Number", "0"],
    ["Precise default", "Money", preciseMoney],
    ["Source amount", "Number", "10"],
    ["Capture flag", "Yes or no", true],
  ] as const) {
    await addField(page, label, valueType);
    await dialog.getByRole("switch", { name: "Set a default value", exact: true }).check();
    if (typeof value === "boolean") {
      const input = dialog.getByRole("switch", { name: "Default value", exact: true });
      await expect(input).not.toBeChecked();
      if (value) await input.check();
    } else await dialog.getByRole("textbox", { name: "Default value", exact: true }).fill(value);
    await apply(page);
  }
  await addField(page, "Disabled snapshot", "Number", "Calculated from this record");
  await pickValue(page, "Source amount");
  await chooseUpdates(page, "Saved when a field changes");
  await choose(page, /^When this field changes/, "Capture flag");
  await expect(dialog.getByRole("switch", { name: /^To this value/ })).not.toBeChecked();
  await apply(page);
  const readModel = async () =>
    RecordModelSchema.parse(
      (
        await database.query(
          'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
          [companyId],
        )
      ).rows[0].snapshot,
    );
  const configured = await readModel();
  const field = (label: string) => {
    const result = configured.fields.find((candidate) => candidate.typeId === typeId && candidate.label === label);
    if (!result) throw new Error(`The configured field ${label} is missing`);
    return result;
  };
  expect(field("Missing amount").behavior).toEqual({ kind: "input" });
  expect(field("False default").behavior).toEqual({ kind: "input", defaultValue: { kind: "boolean", value: false } });
  expect(field("Zero default").behavior).toEqual({
    kind: "input",
    defaultValue: { kind: "decimal", value: "0", currency: null },
  });
  expect(field("Precise default").behavior).toEqual({
    kind: "input",
    defaultValue: { kind: "decimal", value: preciseMoney, currency: "EUR" },
  });
  expect(field("Disabled snapshot").behavior).toMatchObject({
    kind: "snapshot",
    expression: { kind: "field", fieldId: field("Source amount").id },
    capture: "whenChanged",
    triggerFieldId: field("Capture flag").id,
    triggerValue: { kind: "boolean", value: false },
  });
  const row = (label: string) => dialog.locator(`[data-entity-field="${field(label).id}"]`);
  const save = async () => {
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  };
  await list(page, typeId);
  await page.locator("#records-add").click();
  await dialog.getByRole("textbox", { name, exact: false }).fill("Original defaults record");
  await expect(dialog.getByRole("textbox", { name: "Missing amount", exact: true })).toHaveValue("");
  await expect(row("False default").getByRole("switch")).not.toBeChecked();
  await expect(dialog.getByRole("textbox", { name: "Zero default", exact: true })).toHaveValue("0");
  await expect(dialog.getByRole("textbox", { name: "Precise default", exact: true })).toHaveValue(preciseMoney);
  await expect(row("Capture flag").getByRole("switch")).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("typed-input-defaults.png"), animations: "disabled" });
  await save();
  const original = (
    await database.query(
      'SELECT v."recordId" FROM "RecordValue" v JOIN "RecordTypeDefinition" t ON t."companyId"=v."companyId" AND t.id=v."typeId" WHERE v."companyId"=$1 AND v."typeId"=$2 AND v."fieldId"=t.definition->>\'primaryFieldId\' AND v."textValue"=$3',
      [companyId, typeId, "Original defaults record"],
    )
  ).rows[0];
  if (!original) throw new Error("The original defaults record is missing");
  const readValues = async (recordId: string) =>
    (
      await database.query(
        'SELECT "fieldId",state,trim_scale("decimalValue")::text AS amount,"booleanValue",currency FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 ORDER BY "fieldId"',
        [companyId, typeId, recordId],
      )
    ).rows;
  const valueFor = (values: Awaited<ReturnType<typeof readValues>>, label: string) =>
    values.find((value) => value.fieldId === field(label).id);
  const originalValues = await readValues(original.recordId);
  expect(valueFor(originalValues, "Missing amount")).toMatchObject({ state: "missing", amount: null });
  expect(valueFor(originalValues, "False default")).toMatchObject({ state: "value", booleanValue: false });
  expect(valueFor(originalValues, "Zero default")).toMatchObject({ state: "value", amount: "0", currency: null });
  expect(valueFor(originalValues, "Precise default")).toMatchObject({
    state: "value",
    amount: preciseMoney,
    currency: "EUR",
  });
  expect(valueFor(originalValues, "Disabled snapshot")).toBeUndefined();
  const snapshotRead = await page.request.post("/api/v1/records/read", {
    data: { typeId, recordId: original.recordId },
  });
  expect(snapshotRead.ok()).toBe(true);
  const snapshotDto = await snapshotRead.json();
  expect(
    snapshotDto.fields.find((entry: { fieldId: string }) => entry.fieldId === field("Disabled snapshot").id)?.result,
  ).toEqual({ state: "missing" });
  for (const label of ["False default", "Zero default", "Precise default"]) {
    await editFieldDefinitionUi(page, typeId, label);
    await expect(dialog.getByRole("switch", { name: "Set a default value", exact: true })).toBeChecked();
    if (label === "False default")
      await expect(dialog.getByRole("switch", { name: "Default value", exact: true })).not.toBeChecked();
    else
      await expect(dialog.getByRole("textbox", { name: "Default value", exact: true })).toHaveValue(
        label === "Zero default" ? "0" : preciseMoney,
      );
    await dialog.getByRole("switch", { name: "Set a default value", exact: true }).uncheck();
    await apply(page);
  }
  const cleared = await readModel();
  for (const label of ["False default", "Zero default", "Precise default"])
    expect(cleared.fields.find((candidate) => candidate.id === field(label).id)?.behavior).toEqual({ kind: "input" });
  expect(await readValues(original.recordId)).toEqual(originalValues);
  await list(page, typeId);
  await page.locator("#records-add").click();
  await dialog.getByRole("textbox", { name, exact: false }).fill("New cleared-default record");
  await expect(dialog.getByRole("textbox", { name: "Zero default", exact: true })).toHaveValue("");
  await expect(dialog.getByRole("textbox", { name: "Precise default", exact: true })).toHaveValue("");
  await expect(row("False default").getByRole("switch")).not.toBeChecked();
  await save();
  const newer = (
    await database.query(
      'SELECT "recordId" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "textValue"=$3',
      [companyId, typeId, "New cleared-default record"],
    )
  ).rows[0];
  if (!newer) throw new Error("The cleared-default record is missing");
  const newerValues = await readValues(newer.recordId);
  for (const label of ["Missing amount", "False default", "Zero default", "Precise default"])
    expect(valueFor(newerValues, label)).toMatchObject({ state: "missing", amount: null, booleanValue: null });
  const open = async () => openRecordDetails(page, "Original defaults record");
  const expectCapture = async (amount: string) => {
    expect(valueFor(await readValues(original.recordId), "Disabled snapshot")).toMatchObject({
      state: "value",
      amount,
    });
  };
  await open();
  await expect(dialog.getByRole("textbox", { name: "Precise default", exact: true })).toHaveValue(preciseMoney);
  await dialog.getByRole("textbox", { name: "Source amount", exact: true }).fill("20");
  await row("Capture flag").getByRole("switch").uncheck();
  await save();
  await expectCapture("20");
  await open();
  await dialog.getByRole("textbox", { name: "Source amount", exact: true }).fill("30");
  await expect(row("Capture flag").getByRole("switch")).not.toBeChecked();
  await save();
  await expectCapture("20");
  await open();
  await dialog.getByRole("textbox", { name: "Source amount", exact: true }).fill("40");
  await row("Capture flag").getByRole("switch").check();
  await save();
  await expectCapture("20");
  await open();
  await dialog.getByRole("textbox", { name: "Source amount", exact: true }).fill("50");
  await row("Capture flag").getByRole("switch").uncheck();
  await save();
  await expectCapture("50");
  await page.reload();
  await open();
  await expect(row("Disabled snapshot")).toContainText("50");
  await expect(row("Capture flag").getByRole("switch")).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("false-trigger-snapshot.png"), animations: "disabled" });
  expect(valueFor(await readValues(newer.recordId), "Disabled snapshot")).toBeUndefined();
  expect(errors).toEqual([]);
});

test("changes numeric display precision through the field editor without rounding stored values", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = collectErrors(page);
  const name = `Display precision ${randomUUID().slice(0, 8)}`;
  const typeId = await createList(page, name);
  const dialog = page.getByRole("dialog");
  for (const [label, valueType, amount] of [
    ["Display amount", "Number", "12.3456"],
    ["Display price", "Money", "19.8765"],
  ]) {
    await addField(page, label, valueType);
    const precision = dialog.getByRole("spinbutton", { name: "Decimal places", exact: true });
    await expect(precision).toHaveValue("");
    if (valueType === "Number") {
      const before = (
        await database.query('SELECT revision FROM "RecordSchemaState" WHERE "companyId"=$1', [companyId])
      ).rows[0]?.revision;
      await precision.fill("31");
      await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
      await expect(page.getByText("Too big: expected number to be <=30", { exact: true })).toBeVisible();
      await expect(precision).toHaveValue("31");
      await expect(dialog.getByRole("button", { name: "Save", exact: true }).first()).toBeEnabled();
      expect(
        (await database.query('SELECT revision FROM "RecordSchemaState" WHERE "companyId"=$1', [companyId])).rows[0]
          ?.revision,
      ).toBe(before);
    }
    await precision.fill("0");
    await dialog.getByRole("switch", { name: "Set a default value", exact: true }).check();
    await dialog.getByRole("textbox", { name: "Default value", exact: true }).fill(amount);
    await apply(page);
  }
  const readModel = async () =>
    RecordModelSchema.parse(
      (
        await database.query(
          'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
          [companyId],
        )
      ).rows[0].snapshot,
    );
  const initial = await readModel();
  const number = initial.fields.find((field) => field.typeId === typeId && field.label === "Display amount");
  const money = initial.fields.find((field) => field.typeId === typeId && field.label === "Display price");
  if (!number || !money) throw new Error("The display formatting fields are missing");
  expect(number.format?.decimalPlaces).toBe(0);
  expect(money.format?.decimalPlaces).toBe(0);
  await list(page, typeId);
  await page.locator("#records-add").click();
  await dialog.getByRole("textbox", { name, exact: false }).fill("Precision record");
  await expect(dialog.getByRole("textbox", { name: "Display amount", exact: true })).toHaveValue("12.3456");
  await expect(dialog.getByRole("textbox", { name: "Display price", exact: true })).toHaveValue("19.8765");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const recordRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: "Precision record", exact: true }) });
  const cellShowing = (text: string) =>
    recordRow.getByRole("cell").filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  await expect(cellShowing("12")).toBeVisible();
  await expect(cellShowing("€20")).toBeVisible();
  const values = async () =>
    (
      await database.query(
        'SELECT "fieldId",trim_scale("decimalValue")::text AS amount,currency FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=ANY($3::text[]) ORDER BY "fieldId"',
        [companyId, typeId, [number.id, money.id]],
      )
    ).rows;
  const stored = await values();
  expect(stored).toEqual(
    expect.arrayContaining([
      { fieldId: number.id, amount: "12.3456", currency: null },
      { fieldId: money.id, amount: "19.8765", currency: "EUR" },
    ]),
  );
  expect(stored).toHaveLength(2);
  for (const [precision, numberDisplay, moneyDisplay] of [
    ["3", "12.346", "€19.877"],
    ["", "12.3456", "€19.88"],
  ]) {
    for (const field of [number, money]) {
      await editFieldDefinitionUi(page, typeId, field.label);
      await expect(dialog.getByRole("spinbutton", { name: "Decimal places", exact: true })).toHaveValue(
        precision === "3" ? "0" : "3",
      );
      await dialog.getByRole("spinbutton", { name: "Decimal places", exact: true }).fill(precision);
      await apply(page);
    }
    const updated = await readModel();
    for (const field of [number, money]) {
      const definition = updated.fields.find((candidate) => candidate.id === field.id);
      expect(definition?.format?.decimalPlaces).toBe(precision ? 3 : null);
      expect(definition?.behavior).toEqual(field.behavior);
    }
    expect(await values()).toEqual(stored);
    await list(page, typeId);
    await expect(cellShowing(numberDisplay)).toBeVisible();
    await expect(cellShowing(moneyDisplay)).toBeVisible();
  }
  await page.reload();
  await expect(cellShowing("12.3456")).toBeVisible();
  await expect(cellShowing("€19.88")).toBeVisible();
  await openRecordDetails(page, "Precision record");
  await expect(dialog.getByRole("textbox", { name: "Display amount", exact: true })).toHaveValue("12.3456");
  await expect(dialog.getByRole("textbox", { name: "Display price", exact: true })).toHaveValue("19.8765");
  await page.screenshot({ path: testInfo.outputPath("decimal-display-preserves-values.png"), animations: "disabled" });
  expect(await values()).toEqual(stored);
  expect(errors).toEqual([]);
});
