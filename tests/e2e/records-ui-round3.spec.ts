import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import { expect, isAppConsoleError, isBenignPageError, test } from "./fixtures";
import { openRecordDetails, recordItem, rowActionFocusTarget, rowActionLabels, runRowAction } from "./record-rows";

async function api(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function readModel(page: Page) {
  return RecordModelSchema.parse(await api(page, "/api/v1/model/discover", {}));
}

async function createLabList(page: Page, contactTypeId: string) {
  const model = await readModel(page);
  const input = { kind: "input" as const };
  const field = (id: string, label: string, valueType: string, position: number, extra: object = {}) => ({
    operation: "putField",
    field: { id, typeId: "$lab", label, valueType, position, required: false, archived: false, options: [], behavior: input, ...extra },
  });
  await api(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      { operation: "createType", reference: "$lab", label: "Lab item", pluralLabel: "Lab items", description: "", icon: "folder", embedded: false, accessPresetId: null },
      field("$text", "Text", "text", 2),
      field("$number", "Number", "number", 3),
      field("$money", "Money", "currency", 4, { format: { currency: "EUR" } }),
      field("$date", "Date", "date", 5),
      field("$select", "Choice", "select", 6, {
        options: [
          { id: "alpha", label: "Alpha", color: "success", attributes: [] },
          { id: "beta", label: "Beta", color: "warning", attributes: [] },
        ],
      }),
      field("$member", "Owner", "member", 7),
      field("$bool", "Done", "boolean", 8),
      field("$phone", "Phone", "phone", 9),
      field("$emails", "Emails", "email", 11, { multiple: true }),
      field("$double", "Double", "number", 10, {
        behavior: {
          kind: "formula",
          expression: {
            kind: "operation",
            operator: "multiply",
            arguments: [
              { kind: "field", fieldId: "$number" },
              { kind: "literal", value: { kind: "decimal", value: "2", currency: null } },
            ],
          },
        },
      }),
      {
        operation: "putRelationship",
        relationship: {
          id: "$contacts",
          sourceTypeId: "$lab",
          targetTypeId: contactTypeId,
          sourceLabel: "Contacts",
          targetLabel: "Lab items",
          sourceCardinality: "many",
          targetCardinality: "many",
          onSourceDelete: "unlink",
          onTargetDelete: "unlink",
          messagesOnSource: false,
          messagesOnTarget: false,
          archived: false,
        },
      },
    ],
  });
  const next = await readModel(page);
  const type = next.types.find((candidate) => candidate.pluralLabel === "Lab items");
  if (!type) throw new Error("The lab list is missing");
  const result = RecordOperationResultSchema.parse(
    await api(page, "/api/v1/records/mutate", {
      expectedRevision: next.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: type.id,
        fields: [{ fieldId: type.primaryFieldId, value: { kind: "text", value: "Lab one" } }],
      },
    }),
  );
  if (result.status !== "completed") throw new Error("The lab record must be created synchronously");
  const firstName = next.fields.find((field) => field.typeId === contactTypeId && field.label === "First name");
  if (!firstName) throw new Error("The contact first name field is missing");
  await api(page, "/api/v1/records/mutate", {
    expectedRevision: next.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId: contactTypeId,
      fields: [{ fieldId: firstName.id, value: { kind: "text", value: "Lab contact" } }],
    },
  });
  return type.id;
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

test("rows and cards open the record page and keep only Open details and Delete as row actions", async ({
  page,
  companyId,
}) => {
  const typeId = presetId(companyId, "organization");
  const name = `Round three ${randomUUID().slice(0, 8)}`;
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await page.waitForLoadState("networkidle");
  const errors = trackErrors(page);

  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
  expect(await rowActionLabels(page, row, name)).toEqual(["Open details", "Delete"]);
  await runRowAction(page, row, name, "Open details");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}(\\?|$)`));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await row.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}/[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { name }).or(page.getByText(name).first())).toBeVisible();
  expect(errors).toEqual([]);
});

test("record drawer Cancel closes clean forms and guards unsaved changes", async ({ page, companyId }, testInfo) => {
  const typeId = presetId(companyId, "organization");
  const name = `Cancel guard ${randomUUID().slice(0, 8)}`;
  const draft = `${name} unsaved`;
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog");
  const input = drawer.getByRole("textbox", { name: "Name", exact: false });
  const cancel = drawer.getByRole("button", { name: "Cancel", exact: true });
  const save = drawer.getByRole("button", { name: "Save", exact: true });
  await input.fill(name);
  await save.click();
  await expect(drawer).not.toBeVisible();
  await page.waitForLoadState("networkidle");
  const errors = trackErrors(page);
  const moreActions = rowActionFocusTarget(recordItem(page, name), name);

  await openRecordDetails(page, name);
  await expect(input).toHaveValue(name);
  await expect(save).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("record-drawer-clean.png"), animations: "disabled" });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await expect(moreActions).toBeFocused();

  await openRecordDetails(page, name);
  await expect(input).toHaveValue(name);
  await input.fill(draft);
  await expect(save).toBeEnabled();
  await cancel.click();
  const guard = page.getByRole("alertdialog");
  await expect(guard).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("record-drawer-discard.png"), animations: "disabled" });
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(guard).not.toBeVisible();
  await expect(input).toHaveValue(draft);
  await expect(save).toBeEnabled();
  await expect(cancel).toBeFocused();

  await cancel.click();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(guard).not.toBeVisible();
  await expect(drawer).not.toBeVisible();
  await expect(moreActions).toBeFocused();
  await page.reload();
  await openRecordDetails(page, name);
  await expect(input).toHaveValue(name);
  await expect(save).toBeDisabled();
  await cancel.click();
  await expect(drawer).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("edits every field type inline in rows and on board cards, with validation, cancel and calculated tooltips", async ({
  page,
  companyId,
}) => {
  test.setTimeout(240000);
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  await page.goto(`/en/records/${typeId}`);
  await expect(page.locator("#records-add")).toBeEnabled();
  await page.waitForLoadState("networkidle");
  const errors = trackErrors(page);
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: "Lab one", exact: true }) });
  const inPlace = row.locator("[data-in-place-editor]");
  const openInPlace = async (label: string) => {
    await row.hover();
    await row.getByRole("button", { name: `Edit ${label}`, exact: true }).click();
    await expect(inPlace).toBeVisible();
    const input = inPlace.locator("input").first();
    await expect(input).toBeFocused();
    return input;
  };
  const openEditor = async (label: string, header = true) => {
    await row.hover();
    await row.getByRole("button", { name: `Edit ${label}`, exact: true }).click();
    const editor = page.locator('[data-slot="popover-content"][data-state="open"]').last();
    await expect(editor).toBeVisible();
    if (header) await expect(editor).toContainText(label);
    return editor;
  };
  const enterValue = async (label: string, value: string, shown: string) => {
    const input = await openInPlace(label);
    await input.press("ControlOrMeta+a");
    await page.keyboard.type(value);
    await page.keyboard.press("Enter");
    await expect(inPlace).toHaveCount(0);
    await expect(row).toContainText(shown);
  };

  await expect(row.locator("[data-inline-edit] svg.lucide-pencil, [data-read-only-field]")).toHaveCount(0);
  await enterValue("Text", "Inline text", "Inline text");
  await enterValue("Number", "12.5", "12.5");
  await enterValue("Money", "99.95", "€99.95");
  await expect(row).toContainText("25");
  await expect(row.locator("[data-calculated-field]")).toHaveCount(1);
  await expect(row.getByRole("button", { name: "Edit Double", exact: true })).toHaveCount(0);
  await row.locator("[data-calculated-field]").hover();
  await expect(page.getByRole("tooltip")).toContainText("Calculated: Number × 2");

  const tabbed = await openInPlace("Text");
  await tabbed.fill("Tabbed text");
  await page.keyboard.press("Tab");
  await expect(row).toContainText("Tabbed text");
  await expect(row.locator('[data-in-place-editor] input').first()).toBeFocused();
  await expect(row.locator("[data-in-place-editor]")).toHaveAttribute(
    "data-in-place-editor",
    (await readModel(page)).fields.find((field) => field.typeId === typeId && field.label === "Number")!.id,
  );
  await page.keyboard.press("Shift+Tab");
  await expect(row.locator("[data-in-place-editor]")).toHaveAttribute(
    "data-in-place-editor",
    (await readModel(page)).fields.find((field) => field.typeId === typeId && field.label === "Text")!.id,
  );
  await page.keyboard.press("Escape");
  await expect(inPlace).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Edit Text", exact: true })).toBeFocused();

  const phoneInput = await openInPlace("Phone");
  await phoneInput.fill("12 34");
  await phoneInput.press("Enter");
  await expect(inPlace).toBeVisible();
  await expect(phoneInput).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a phone number in international format", { exact: false }).first()).toBeVisible();
  await phoneInput.fill("+49301234567");
  await phoneInput.press("Enter");
  await expect(inPlace).toHaveCount(0);
  await expect(row).toContainText("+49301234567");

  const cancelled = await openInPlace("Text");
  await cancelled.fill("Never saved");
  await page.keyboard.press("Escape");
  await expect(inPlace).toHaveCount(0);
  await expect(row).toContainText("Tabbed text");
  await expect(row).not.toContainText("Never saved");

  await row.getByRole("switch", { name: "Edit Done" }).click();
  await expect(row.getByRole("switch", { name: "Edit Done" })).toHaveAttribute("data-state", "checked");

  await row.getByRole("button", { name: "Edit Choice", exact: true }).click();
  await page.getByRole("menuitem", { name: "Beta" }).click();
  await expect(row).toContainText("Beta");

  const times = await row.locator("time").count();
  const date = await openEditor("Date");
  await date.locator("button").first().click();
  await page.locator('[data-slot="popover-content"][data-state="open"]').last().getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator('[data-slot="popover-content"][data-state="open"]')).toHaveCount(0);
  await expect(row.locator("time")).toHaveCount(times + 1);

  const contacts = await openEditor("Contacts", false);
  await contacts.getByRole("option").first().click();
  await expect(contacts).not.toBeVisible();
  await expect(row.locator('[data-slot="badge"], [data-slot="app-chip"]').first()).toBeVisible();

  const owner = await openEditor("Owner");
  await owner.getByRole("combobox").click();
  await page.getByRole("option").first().click();
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(owner).not.toBeVisible();
  await expect(row).not.toContainText("Member");

  const choice = (await readModel(page)).fields.find((field) => field.typeId === typeId && field.label === "Choice");
  if (!choice) throw new Error("The lab choice field is missing");
  await page.goto(`/en/records/${typeId}?viewMode=card&groupBy=${choice.id}`);
  const card = page.locator("[data-item-id]").first();
  await expect(card).toBeVisible();
  await page.waitForLoadState("networkidle");
  const cardEditor = page.locator('[data-slot="popover-content"][data-state="open"]').last();
  await expect(async () => {
    if (!(await cardEditor.isVisible())) {
      await card.hover();
      await card.getByRole("button", { name: "Edit Number", exact: true }).click();
    }
    await expect(cardEditor).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await cardEditor.locator("input").first().fill("40");
  await cardEditor.locator("input").first().press("Enter");
  await expect(cardEditor).not.toBeVisible();
  await expect(card).toContainText("80");
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}\\?`));
  expect(errors).toEqual([]);
});

test("board cards show one chip row with icons, hide empty and grouped values and add empty fields", async ({
  page,
  companyId,
}) => {
  test.setTimeout(180000);
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const labField = (label: string) => {
    const found = model.fields.find((field) => field.typeId === typeId && field.label === label);
    if (!found) throw new Error(`The lab field ${label} is missing`);
    return found;
  };
  const type = model.types.find((candidate) => candidate.id === typeId)!;
  const choice = labField("Choice");
  await api(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId,
      fields: [
        { fieldId: type.primaryFieldId, value: { kind: "text", value: "Lab card" } },
        { fieldId: labField("Number").id, value: { kind: "decimal", value: "2", currency: null } },
        { fieldId: labField("Money").id, value: { kind: "decimal", value: "342000", currency: "EUR" } },
        { fieldId: choice.id, value: { kind: "select", value: choice.options[0].id } },
      ],
    },
  });
  await page.goto(`/en/records/${typeId}?viewMode=card&groupBy=${choice.id}`);
  const errors = trackErrors(page);
  const card = page.locator("[data-item-id]").filter({ hasText: "Lab card" });
  await expect(card).toBeVisible();
  await expect(page.locator("#records-add")).toBeEnabled();
  await page.waitForLoadState("networkidle");
  const chip = (label: string) => card.locator(`[data-chip-column="${labField(label).id}"]`);

  await expect(card.locator("[data-chip-row]")).toBeVisible();
  await expect(chip("Money")).toHaveText("€342K");
  await expect(chip("Number")).toContainText("Number");
  await expect(chip("Double")).toContainText("Double");
  await expect(chip("Choice")).toHaveCount(0);
  for (const empty of ["Text", "Date", "Owner", "Phone"]) await expect(chip(empty)).toHaveCount(0);
  await expect(card).not.toContainText("Money");

  await chip("Money").hover();
  await expect(page.getByRole("tooltip", { name: "Money", exact: true })).toBeVisible();
  await chip("Double").hover();
  await expect(page.getByRole("tooltip", { name: "Calculated: Number × 2", exact: true })).toBeVisible();

  const editor = page.locator('[data-slot="popover-content"][data-state="open"]').last();
  await chip("Money").getByRole("button", { name: "Edit Money", exact: true }).click();
  await expect(editor).toContainText("Money");
  await expect(editor.locator("input").first()).toHaveValue(/342,?000/);
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(page.locator(`[data-group-key="value:${choice.options[0].id}"]`).locator(card)).toBeVisible();

  await card.hover();
  const add = card.getByRole("button", { name: "Add property", exact: true });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.getByRole("menuitem")).toHaveText(["Text", "Date", "Owner", "Done", "Phone", "Emails", "Contacts"]);
  await page.getByRole("menuitem", { name: "Text", exact: true }).click();
  await expect(editor).toContainText("Text");
  await editor.locator("input").first().fill("Card text");
  await editor.locator("input").first().press("Enter");
  await expect(editor).toHaveCount(0);
  await expect(chip("Text")).toHaveText("Card text");
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}\\?`));
  expect(errors).toEqual([]);
});

test("rows keep the row click on calculated values, toggle in selection mode and edit multi-value contacts from blank space", async ({
  page,
  companyId,
}) => {
  test.setTimeout(180000);
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const type = model.types.find((candidate) => candidate.id === typeId)!;
  await api(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: { action: "create", typeId, fields: [{ fieldId: type.primaryFieldId, value: { kind: "text", value: "Lab two" } }] },
  });
  await page.goto(`/en/records/${typeId}`);
  await expect(page.locator("#records-add")).toBeEnabled();
  await page.waitForLoadState("networkidle");
  const errors = trackErrors(page);
  const row = (name: string) => page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
  const selectAll = page.getByRole("checkbox", { name: "Select all rows", exact: true });

  await row("Lab one").getByRole("checkbox").click();
  await expect(selectAll).toHaveAttribute("data-state", "indeterminate");
  await row("Lab two").getByRole("button", { name: "Edit Text", exact: true }).click();
  await expect(page.locator("[data-in-place-editor]")).toHaveCount(0);
  await expect(row("Lab two").getByRole("checkbox")).toHaveAttribute("data-state", "checked");
  await expect(selectAll).toHaveAttribute("data-state", "checked");
  await row("Lab two").getByRole("button", { name: "Edit Choice", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(row("Lab two").getByRole("checkbox")).toHaveAttribute("data-state", "unchecked");
  await row("Lab one").getByRole("checkbox").click();
  await expect(selectAll).toHaveAttribute("data-state", "unchecked");

  await row("Lab one").hover();
  await row("Lab one").getByRole("button", { name: "Edit Emails", exact: true }).click();
  const editor = page.locator('[data-slot="popover-content"][data-state="open"]');
  await editor.locator("textarea").fill("first@example.test\nsecond@example.test");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const space = row("Lab one").locator("[data-inline-edit-space]").filter({ hasText: "first@example.test" });
  await space.scrollIntoViewIfNeeded();
  const box = await space.boundingBox();
  if (!box) throw new Error("The emails cell is not rendered");
  await page.mouse.click(box.x + 4, box.y + box.height / 2);
  await expect(editor.locator("textarea")).toHaveValue("first@example.test\nsecond@example.test");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}(\\?|$)`));

  await row("Lab one").getByRole("button", { name: "Edit Number", exact: true }).click();
  await row("Lab one").locator("[data-in-place-editor] input").fill("3");
  await row("Lab one").locator("[data-in-place-editor] input").press("Enter");
  await expect(row("Lab one").locator("[data-calculated-field]")).toHaveText("6");
  await row("Lab one").locator("[data-calculated-field]").click();
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}/[0-9a-f-]{36}$`), { timeout: 30000 });
  expect(errors).toEqual([]);
});

test("grouped tables show a quiet group band that adds into the group and hide the grouped column", async ({
  page,
  companyId,
}) => {
  test.setTimeout(180000);
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const type = model.types.find((candidate) => candidate.id === typeId)!;
  const choice = model.fields.find((field) => field.typeId === typeId && field.label === "Choice")!;
  await api(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId,
      fields: [
        { fieldId: type.primaryFieldId, value: { kind: "text", value: "Lab grouped" } },
        { fieldId: choice.id, value: { kind: "select", value: choice.options[0].id } },
      ],
    },
  });
  await page.goto(`/en/records/${typeId}?viewMode=table&groupBy=${choice.id}`);
  await expect(page.locator("#records-add")).toBeEnabled();
  const band = page.locator('[data-slot="group-header-row"]').filter({ hasText: choice.options[0].label });
  await expect(band).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Choice", exact: false })).toHaveCount(0);
  await expect(page.locator('td[data-align="end"]').first()).toBeVisible();
  await band.getByRole("button", { name: `Add to ${choice.options[0].label}`, exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Lab item", exact: true });
  await expect(drawer.getByRole("combobox", { name: "Choice", exact: true })).toContainText(choice.options[0].label);
  await drawer.getByRole("textbox", { name: "Lab item", exact: false }).fill("Added in group");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(band).toContainText("2");
});

test("phone rows show the title and the card chip row instead of table columns", async ({ page, companyId }) => {
  test.setTimeout(180000);
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const type = model.types.find((candidate) => candidate.id === typeId)!;
  const money = model.fields.find((field) => field.typeId === typeId && field.label === "Money")!;
  await api(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId,
      fields: [
        { fieldId: type.primaryFieldId, value: { kind: "text", value: "Lab phone" } },
        { fieldId: money.id, value: { kind: "decimal", value: "342000", currency: "EUR" } },
      ],
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/en/records/${typeId}`);
  await expect(page.locator("#records-add")).toBeEnabled();
  const rows = page.locator("[data-phone-rows]");
  await expect(rows).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveCount(0);
  const item = rows.locator("[data-row-id]").filter({ hasText: "Lab phone" });
  await expect(item.locator(`[data-chip-column="${money.id}"]`)).toHaveText("€342K");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await item.getByText("Lab phone", { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}/[0-9a-f-]{36}$`), { timeout: 30000 });
});

test("board columns keep a one-line header and a persisted, keyboard-resizable width", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  await page.setViewportSize({ width: 720, height: 900 });
  const typeId = presetId(companyId, "deal");
  await page.goto(`/en/records/${typeId}`);
  const model = await readModel(page);
  const deal = model.types.find((type) => type.id === typeId);
  if (!deal) throw new Error("The deal list is missing");
  await api(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId,
      fields: [{ fieldId: deal.primaryFieldId, value: { kind: "text", value: "Lane width deal" } }],
    },
  });
  await page.reload();
  await expect(page.locator("#records-add")).toBeEnabled();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.locator("#records-layout-board").click();
  if (testInfo.project.name === "mobile") await page.locator('[data-slot="drawer-close"]').click();
  else await page.keyboard.press("Escape");
  const lane = page.locator("[data-group-key]").first();
  await expect(lane).toBeVisible();
  const header = lane.locator("div").first();
  const lineHeight = (await header.boundingBox())!.height;
  expect(lineHeight).toBeLessThan(44);
  const before = (await lane.boundingBox())!.width;
  const handle = page.locator('[data-slot="column-resize-handle"]').first();
  await handle.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await lane.boundingBox())!.width).toBe(before + 30);
  const storedWidth = async () => {
    const result = await database.query('SELECT "columnWidths" FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [
      companyId,
      `records:${typeId}`,
    ]);
    return result.rows[0]?.columnWidths?.["board:lanes"];
  };
  await expect.poll(storedWidth).toBe(before + 30);
  await page.reload();
  await expect(page.locator("[data-group-key]").first()).toBeVisible();
  await expect.poll(async () => (await page.locator("[data-group-key]").first().boundingBox())!.width).toBe(before + 30);
  const laneWidth = async () => (await page.locator("[data-group-key]").first().boundingBox())!.width;
  await expect(async () => {
    await page.locator('[data-slot="column-resize-handle"]').first().focus();
    await page.keyboard.press("Enter");
    await expect.poll(laneWidth, { timeout: 2000 }).toBe(before);
  }).toPass({ timeout: 20000 });
  await expect.poll(storedWidth).toBeUndefined();
});
