import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import { anyWorkspaceUrlPattern, companyPath, companyUrlPattern, pagePath } from "./app-paths";
import { expect, test, collectPageErrors } from "./fixtures";
import { postOk } from "./api";
import { openItemMenu } from "./item-actions";
import { openSidebar } from "./sidebar";
import {
  openRecordDetails,
  openRecordLink,
  recordItem,
  rowActionFocusTarget,
  rowActionLabels,
  runRowAction,
} from "./record-rows";

async function readModel(page: Page) {
  return RecordModelSchema.parse(await postOk(page, "/api/v1/model/read", {}));
}

async function createLabList(page: Page, contactTypeId: string) {
  const model = await readModel(page);
  const input = { kind: "input" as const };
  const field = (id: string, label: string, valueType: string, position: number, extra: object = {}) => ({
    operation: "putField",
    field: { id, typeId: "$lab", label, valueType, position, required: false, archived: false, options: [], behavior: input, ...extra },
  });
  await postOk(page, "/api/v1/model/apply", {
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
    await postOk(page, "/api/v1/records/mutate", {
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
  await postOk(page, "/api/v1/records/mutate", {
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

test("rows and cards open the record drawer and keep the existing row actions", async ({
  page,
  companyId,
}) => {
  const typeId = presetId(companyId, "organization");
  const name = `Round three ${randomUUID().slice(0, 8)}`;
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await page.waitForLoadState("networkidle");
  const errors = collectPageErrors(page);

  const row = recordItem(page, name);
  expect(await rowActionLabels(page, row, name)).toEqual(["Open in new tab", "Open details", "Delete"]);
  await runRowAction(page, row, name, "Open details");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(companyUrlPattern(companyId, `/records/${typeId}(\\?|$)`));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await runRowAction(page, row, name, "Open details");
  await expect(page).toHaveURL(companyUrlPattern(companyId, `/records/${typeId}(\\?|$)`));
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("textbox", { name: "Name", exact: false })).toHaveValue(name);
  await expect(drawer.getByRole("heading", { name, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("record drawer shows an unsaved-changes bar only while edits are pending and guards closing", async ({
  page,
  companyId,
}, testInfo) => {
  const typeId = presetId(companyId, "organization");
  const name = `Cancel guard ${randomUUID().slice(0, 8)}`;
  const draft = `${name} unsaved`;
  const saved = `${name} saved`;
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog");
  const input = drawer.getByRole("textbox", { name: "Name", exact: false });
  const bar = drawer.locator("[data-slot='unsaved-changes-bar']");
  const cancel = bar.getByRole("button", { name: "Cancel", exact: true });
  const save = bar.getByRole("button", { name: "Save", exact: true });
  await expect(drawer.locator("[data-slot='form-footer-actions']")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await input.fill(name);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await page.waitForLoadState("networkidle");
  const errors = collectPageErrors(page);
  const moreActions = rowActionFocusTarget(recordItem(page, name), name);

  await openRecordDetails(page, name);
  await expect(input).toHaveValue(name);
  await expect(drawer.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
  await expect(drawer.locator("[data-slot='form-footer-actions']")).toHaveCount(0);
  await expect(bar).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("record-drawer-clean.png"), animations: "disabled" });
  const cleanTop = (await input.boundingBox())?.y;

  await input.fill(draft);
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("role", "status");
  await expect(bar).toHaveAttribute("aria-live", "polite");
  await expect(bar).toContainText("Unsaved changes");
  expect((await input.boundingBox())?.y).toBe(cleanTop);
  await page.screenshot({ path: testInfo.outputPath("record-drawer-unsaved-bar.png"), animations: "disabled" });
  await cancel.click();
  await expect(bar).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(input).toHaveValue(name);

  await input.fill(draft);
  await expect(bar).toBeVisible();
  await page.keyboard.press("Escape");
  const guard = page.getByRole("alertdialog");
  await expect(guard).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("record-drawer-discard.png"), animations: "disabled" });
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(guard).not.toBeVisible();
  await expect(input).toHaveValue(draft);
  await expect(bar).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(guard).not.toBeVisible();
  await expect(drawer).not.toBeVisible();
  await expect(moreActions).toBeFocused();
  await page.reload();
  await openRecordDetails(page, name);
  await expect(input).toHaveValue(name);
  await expect(bar).toHaveCount(0);

  await input.fill(saved);
  await save.click();
  await expect(bar).toHaveCount(0);
  await expect(drawer).not.toBeVisible();
  await page.reload();
  await openRecordDetails(page, saved);
  await expect(input).toHaveValue(saved);
  await expect(bar).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("record drawer takes focus without a browser outline while controls keep the focus ring", async ({
  page,
  companyId,
}) => {
  const typeId = presetId(companyId, "organization");
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await page.locator("#records-add").click();
  const drawer = page.locator('[role="dialog"][data-state="open"]');
  await expect(drawer).toBeVisible();
  await expect(drawer).toBeFocused();
  await expect
    .poll(() =>
      drawer.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          focused: document.activeElement === element,
          outline: style.outlineStyle === "none" || style.outlineWidth === "0px",
          ringless: ["", "0 0 #0000"].includes(style.getPropertyValue("--tw-ring-shadow").trim()),
        };
      }),
    )
    .toEqual({ focused: true, outline: true, ringless: true });

  const ring = await (async () => {
    for (let step = 0; step < 30; step += 1) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active.tagName !== "BUTTON") return null;
        const style = getComputedStyle(active);
        return { visible: active.matches(":focus-visible"), boxShadow: style.boxShadow };
      });
      if (state) return state;
    }
    return null;
  })();
  expect(ring?.visible).toBe(true);
  expect(ring?.boxShadow).not.toBe("none");
});

test("edits every field type inline in rows and on board cards, with validation, cancel and calculated tooltips", async ({
  page,
  companyId,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Table cells edit in place on the desktop table; phone rows render no table cells");
  test.setTimeout(240000);
  await page.goto(companyPath(companyId, `/records/${presetId(companyId, "contact")}`));
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await expect(page.locator("#records-add")).toBeEnabled();
  await page.waitForLoadState("networkidle");
  const errors = collectPageErrors(page);
  const row = recordItem(page, "Lab one");
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

  const textEdit = row.getByRole("button", { name: "Edit Text", exact: true });
  const idleShadow = await textEdit.evaluate((element) => getComputedStyle(element).boxShadow);
  const idleBackground = await textEdit.evaluate((element) => getComputedStyle(element).backgroundColor);
  await textEdit.hover();
  await expect.poll(() => textEdit.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(idleBackground);
  expect(await textEdit.evaluate((element) => getComputedStyle(element).boxShadow)).toBe(idleShadow);
  await expect(row.locator("[data-inline-edit]:not(:has([data-empty-target])) svg.lucide-pencil")).toHaveCount(0);
  await expect(row.locator("[data-read-only-field]")).toHaveCount(0);
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
  const phoneToasts = page.locator("[data-sonner-toast]").filter({ hasText: "international format" });
  await expect(phoneToasts.first()).toBeVisible();
  expect(await phoneToasts.count()).toBe(1);
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
  await date.getByRole("button", { name: "Today", exact: true }).click();
  await date.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator('[data-slot="popover-content"][data-state="open"]')).toHaveCount(0);
  await expect(row.locator("time")).toHaveCount(times + 1);
  const dateEdit = row.getByRole("button", { name: "Edit Date", exact: true });
  await dateEdit.scrollIntoViewIfNeeded();
  await dateEdit.hover();
  const datePadding = await dateEdit.evaluate((element) => {
    const target = element.getBoundingClientRect();
    const value = element.querySelector("time")!.parentElement!.getBoundingClientRect();
    return { left: value.left - target.left, right: target.right - value.right };
  });
  expect(datePadding.left).toBeGreaterThanOrEqual(8);
  expect(datePadding.right).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: testInfo.outputPath("inline-date-hover.png"), animations: "disabled" });

  const contacts = await openEditor("Contacts", false);
  await contacts.getByRole("option").first().click();
  await expect(contacts).not.toBeVisible();
  await expect(row.locator('[data-slot="badge"], [data-slot="app-chip"]').first()).toBeVisible();

  const ownerEdit = row.getByRole("button", { name: "Edit Owner", exact: true });
  await ownerEdit.hover();
  await expect(ownerEdit.locator("[data-empty-target] svg.lucide-pencil")).toBeVisible();
  await expect(ownerEdit).toHaveText("");
  await expect(ownerEdit.locator('[data-slot="avatar"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("inline-empty-member-hover.png"), animations: "disabled" });
  const owner = await openEditor("Owner");
  const ownerLabels = owner.locator("label").filter({ hasText: "Owner" });
  await expect(ownerLabels).toHaveCount(1);
  await expect(ownerLabels).toHaveClass(/sr-only/);
  await owner.getByRole("option").first().click();
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(owner).not.toBeVisible();
  await expect(row).not.toContainText("Member");

  const choice = (await readModel(page)).fields.find((field) => field.typeId === typeId && field.label === "Choice");
  if (!choice) throw new Error("The lab choice field is missing");
  await page.goto(companyPath(companyId, `/records/${typeId}?viewMode=card&groupBy=${choice.id}`));
  const card = page.locator("[data-item-id]").first();
  await expect(card).toBeVisible();
  await page.waitForLoadState("networkidle");
  const cardEditor = card.locator("[data-in-place-editor] input");
  await expect(async () => {
    if (!(await cardEditor.isVisible())) {
      await card.hover();
      await card.getByRole("button", { name: "Edit Number", exact: true }).click();
    }
    await expect(cardEditor).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await cardEditor.fill("40");
  await cardEditor.press("Enter");
  await expect(cardEditor).toHaveCount(0);
  await expect(card).toContainText("80");
  await expect(page).toHaveURL(companyUrlPattern(companyId, `/records/${typeId}\\?`));
  expect(errors).toEqual([]);
});

test("board cards show one chip row with icons, hide empty and grouped values and add empty fields", async ({
  page,
  companyId,
}) => {
  test.setTimeout(180000);
  await page.goto(companyPath(companyId, `/records/${presetId(companyId, "contact")}`));
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const labField = (label: string) => {
    const found = model.fields.find((field) => field.typeId === typeId && field.label === label);
    if (!found) throw new Error(`The lab field ${label} is missing`);
    return found;
  };
  const type = model.types.find((candidate) => candidate.id === typeId)!;
  const choice = labField("Choice");
  await postOk(page, "/api/v1/records/mutate", {
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
  await page.goto(companyPath(companyId, `/records/${typeId}?viewMode=card&groupBy=${choice.id}`));
  const errors = collectPageErrors(page);
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

  const editor = page
    .locator('[data-slot="popover-content"][data-state="open"], [data-slot="drawer-content"][data-state="open"]')
    .last();
  await chip("Money").getByRole("button", { name: "Edit Money", exact: true }).click();
  const moneyInput = chip("Money").locator("[data-in-place-editor] input");
  await expect(moneyInput).toHaveValue(/342,?000/);
  await moneyInput.press("Escape");
  await expect(moneyInput).toHaveCount(0);
  await expect(chip("Money")).toHaveText("€342K");
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
  await expect(page).toHaveURL(companyUrlPattern(companyId, `/records/${typeId}\\?`));
  expect(errors).toEqual([]);
});

test("rows keep the row click on calculated values, toggle in selection mode and edit multi-value contacts from blank space", async ({
  page,
  companyId,
  isMobile,
}) => {
  test.skip(isMobile, "Row selection and in-place cell editing belong to the desktop table; phone rows have neither");
  test.setTimeout(180000);
  await page.goto(companyPath(companyId, `/records/${presetId(companyId, "contact")}`));
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const type = model.types.find((candidate) => candidate.id === typeId)!;
  await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    mutation: { action: "create", typeId, fields: [{ fieldId: type.primaryFieldId, value: { kind: "text", value: "Lab two" } }] },
  });
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await expect(page.locator("#records-add")).toBeEnabled();
  await page.waitForLoadState("networkidle");
  const errors = collectPageErrors(page);
  const row = (name: string) => recordItem(page, name);
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
  await expect(page).toHaveURL(companyUrlPattern(companyId, `/records/${typeId}(\\?|$)`));

  await row("Lab one").getByRole("button", { name: "Edit Number", exact: true }).click();
  await row("Lab one").locator("[data-in-place-editor] input").fill("3");
  await row("Lab one").locator("[data-in-place-editor] input").press("Enter");
  await expect(row("Lab one").locator("[data-calculated-field]")).toHaveText("6");
  await row("Lab one").locator("[data-calculated-field]").click();
  await expect(page).toHaveURL(companyUrlPattern(companyId, `/records/${typeId}(\\?|$)`));
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(errors).toEqual([]);
});

test("grouped tables show a quiet group band that adds into the group and hide the grouped column", async ({
  page,
  companyId,
  isMobile,
}) => {
  test.skip(isMobile, "The group band with Add and the hidden grouped column belong to the desktop table");
  test.setTimeout(180000);
  await page.goto(companyPath(companyId, `/records/${presetId(companyId, "contact")}`));
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const type = model.types.find((candidate) => candidate.id === typeId)!;
  const choice = model.fields.find((field) => field.typeId === typeId && field.label === "Choice")!;
  await postOk(page, "/api/v1/records/mutate", {
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
  await page.goto(companyPath(companyId, `/records/${typeId}?viewMode=table&groupBy=${choice.id}`));
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
  await page.goto(companyPath(companyId, `/records/${presetId(companyId, "contact")}`));
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const type = model.types.find((candidate) => candidate.id === typeId)!;
  const money = model.fields.find((field) => field.typeId === typeId && field.label === "Money")!;
  await postOk(page, "/api/v1/records/mutate", {
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
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await expect(page.locator("#records-add")).toBeEnabled();
  const rows = page.locator("[data-phone-rows]");
  await expect(rows).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveCount(0);
  const item = rows.locator("[data-row-id]").filter({ hasText: "Lab phone" });
  await expect(item.locator(`[data-chip-column="${money.id}"]`)).toHaveText("€342K");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await item.getByRole("link", { name: "Lab phone", exact: true }).click({ position: { x: 2, y: 2 } });
  await expect(page).toHaveURL(companyUrlPattern(companyId, `/records/${typeId}(\\?|$)`));
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("board columns keep a one-line header, one fixed width and collapse into strips", async ({
  page,
  companyId,
}, testInfo) => {
  await page.setViewportSize({ width: 720, height: 900 });
  const typeId = presetId(companyId, "deal");
  await page.goto(companyPath(companyId, `/records/${typeId}`));
  const model = await readModel(page);
  const deal = model.types.find((type) => type.id === typeId);
  if (!deal) throw new Error("The deal list is missing");
  await postOk(page, "/api/v1/records/mutate", {
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
  await page.getByRole("combobox", { name: "Group By", exact: true }).click();
  await page.getByRole("option", { name: "Stage", exact: true }).click();
  if (testInfo.project.name === "mobile") await page.locator('[data-slot="drawer-close"]').click();
  else await page.keyboard.press("Escape");
  const lanes = page.locator("[data-group-key]:not([data-kanban-strip])");
  const lane = lanes.first();
  await expect(lane).toBeVisible();
  const header = lane.locator("div").first();
  expect((await header.boundingBox())!.height).toBeLessThan(44);
  await expect(page.locator('[data-slot="column-resize-handle"]')).toHaveCount(0);
  const widths = await lanes.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width),
  );
  expect(new Set(widths).size).toBe(1);

  const groupKey = await lane.getAttribute("data-group-key");
  const laneCount = await lanes.count();
  await lane.hover();
  await openItemMenu(page, header.getByRole("button", { name: /^More actions for / }));
  await page.getByRole("menuitem", { name: "Collapse column", exact: true }).click();
  const strip = page.locator(`[data-kanban-strip][data-group-key="${groupKey}"]`);
  await expect(strip).toBeVisible();
  await expect(lanes).toHaveCount(laneCount - 1);
  expect((await strip.boundingBox())!.width).toBeLessThan(48);
  await strip.click();
  await expect(strip).toHaveCount(0);
  await expect(lanes).toHaveCount(laneCount);
});


test("edits built-in assignees across table, card, phone and pinned detail controls", async ({
  page,
  companyId,
  database,
  workspace,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(pagePath(page, `/records/${presetId(companyId, "contact")}`));
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const choice = model.fields.find((field) => field.typeId === typeId && field.label === "Choice");
  if (!choice) throw new Error("The lab choice field is missing");
  const colleagueId = randomUUID();
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","updatedAt") SELECT $1,"companyId","roleId",$2,\'Assigned\',\'Colleague\',\'active\',true,NOW(),\'en\',\'en\',NOW() FROM "User" WHERE "companyId"=$3 AND id=$4',
    [colleagueId, `assigned-${colleagueId}@example.test`, companyId, workspace.userId],
  );
  const { rows } = await database.query<{ id: string }>(
    'SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, typeId],
  );
  const recordId = rows[0].id;
  const assignedIds = async () =>
    (
      await database.query<{ userId: string }>(
        'SELECT "userId" FROM "RecordAssignment" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 ORDER BY "userId"',
        [companyId, typeId, recordId],
      )
    ).rows.map((row) => row.userId);
  const errors = collectPageErrors(page);
  for (const [mode, width] of [["row", 1280], ["card", 1280], ["row", 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(pagePath(page, `/records/${typeId}?viewMode=${mode}${mode === "card" ? `&groupBy=${choice.id}` : ""}`));
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("checkbox", { name: "Assigned to", exact: true }).check();
    if (width < 768) await page.locator('[data-slot="drawer-close"]').click();
    else await page.keyboard.press("Escape");
    const item = page.locator(`[data-row-id="${recordId}"], [data-item-id="${recordId}"]`).first();
    const trigger = item.getByRole("button", { name: "Edit Assigned to", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const editor = page.getByRole("dialog", { name: "Assigned to", exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await editor.getByRole("option").filter({ hasText: "Assigned Colleague" }).click();
    await expect(editor.getByRole("option").filter({ hasText: "Browser Administrator" })).toBeVisible();
    await expect(editor).toBeVisible();
    const before = await assignedIds();
    expect(before).toContain(workspace.userId);
    expect(before).not.toContain(colleagueId);
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect.poll(assignedIds).toEqual([workspace.userId, colleagueId].sort());
    await expect(trigger).toContainText("Assigned Colleague");
    expect(new URL(page.url()).pathname).toBe(pagePath(page, `/records/${typeId}`));
    await trigger.click();
    await editor.getByRole("option").filter({ hasText: "Assigned Colleague" }).click();
    if (mode === "row" && width === 1280) {
      await editor.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
      await expect(editor).not.toBeVisible();
      await expect.poll(assignedIds).toEqual([workspace.userId, colleagueId].sort());
      await trigger.click();
      await editor.getByRole("option").filter({ hasText: "Assigned Colleague" }).click();
    }
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect.poll(assignedIds).toEqual([workspace.userId]);
    if (mode === "card") {
      await trigger.click();
      await editor.getByRole("option").filter({ hasText: "Browser Administrator" }).click();
      await editor.getByRole("button", { name: "Save", exact: true }).click();
      await expect(editor).not.toBeVisible();
      await expect.poll(assignedIds).toEqual([]);
      await expect(trigger).toHaveCount(0);
      await item.hover();
      await item.getByRole("button", { name: "Add property", exact: true }).click();
      await page.getByRole("menuitem", { name: "Assigned to", exact: true }).click();
      const emptyEditor = page.getByRole("dialog").filter({ has: page.locator("[data-inline-autocomplete]") });
      await emptyEditor.getByRole("option").filter({ hasText: "Browser Administrator" }).click();
      await page.keyboard.press("Escape");
      const discard = page.getByRole("alertdialog");
      await expect(discard).toBeVisible();
      await discard.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(emptyEditor).toBeVisible();
      await expect(emptyEditor.getByRole("option").filter({ hasText: "Browser Administrator" }).locator(".lucide-check")).toHaveCount(1);
      await emptyEditor.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(assignedIds).toEqual([workspace.userId]);
      await expect(trigger).toContainText("Browser Administrator");
    }
  }
  await page.goto("/en/dashboard");
  await openSidebar(page);
  await page.locator(`[id="nav-records:${typeId}"]`).click();
  await expect(page).toHaveURL(anyWorkspaceUrlPattern(`/records/${typeId}(\\?|$)`));
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("checkbox", { name: "Assigned to", exact: true }).check();
  await page.locator('[data-slot="drawer-close"]').click();
  const conflictItem = page.locator(`[data-row-id="${recordId}"], [data-item-id="${recordId}"]`).first();
  await conflictItem.getByRole("button", { name: "Edit Assigned to", exact: true }).click();
  const conflictEditor = page.getByRole("dialog", { name: "Assigned to", exact: true });
  await conflictEditor.getByRole("option").filter({ hasText: "Assigned Colleague" }).click();
  expect(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })))).toBe(true);
  await page.evaluate(() => history.back());
  const navigationDiscard = page.getByRole("alertdialog");
  await expect(navigationDiscard).toBeVisible();
  await navigationDiscard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(conflictEditor).toBeVisible();
  const remoteAssign = async (assignedUserIds: string[]) => {
    const { rows: current } = await database.query<{ version: number }>(
      'SELECT version FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=$3',
      [companyId, typeId, recordId],
    );
    await postOk(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision, idempotencyKey: randomUUID(),
      mutation: { action: "update", ref: { typeId, recordId }, expectedVersion: current[0].version, fields: [], assignedUserIds },
    });
  };
  await remoteAssign([colleagueId]);
  await conflictEditor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "This record changed. Refresh before saving again." }).first()).toBeVisible();
  await expect(conflictItem.locator('[data-inline-edit="system:assignedTo"]')).not.toContainText("Browser Administrator");
  await expect(conflictEditor).toBeVisible();
  await expect(conflictEditor.getByRole("option").filter({ hasText: "Browser Administrator" }).locator(".lucide-check")).toHaveCount(1);
  await expect(conflictEditor.getByRole("option").filter({ hasText: "Assigned Colleague" }).locator(".lucide-check")).toHaveCount(1);
  await expect(conflictEditor).not.toContainText("Selection unavailable");
  expect(await assignedIds()).toEqual([colleagueId]);
  await conflictEditor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
  await remoteAssign([workspace.userId]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(pagePath(page, `/records/${typeId}`));
  await openRecordDetails(page, "Lab one");
  const drawer = page.getByRole("dialog", { name: "Lab item", exact: true });
  await drawer.getByRole("button", { name: "Pin or unpin fields", exact: true }).click();
  const pin = page.getByRole("menuitemcheckbox", { name: "Assigned to", exact: true });
  if ((await pin.getAttribute("aria-checked")) !== "true") await pin.click();
  await page.keyboard.press("Escape");
  const pinned = drawer.locator("[data-record-chip-row]").getByRole("group", { name: "Assigned to", exact: true });
  await pinned.getByRole("button").first().click();
  await page.locator('[data-slot="popover-content"][data-state="open"]').getByRole("option").filter({ hasText: "Assigned Colleague" }).click();
  await expect(drawer.locator('[data-slot="unsaved-changes-bar"]')).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="popover-content"][data-state="open"]')).toHaveCount(0);
  await expect(drawer).toBeVisible();
  expect(await assignedIds()).toEqual([workspace.userId]);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(assignedIds).toEqual([workspace.userId, colleagueId].sort());
  await page.reload();
  expect(await assignedIds()).toEqual([workspace.userId, colleagueId].sort());
  expect(errors).toEqual([]);
});

test("edits formatted notes inline with the shared editor in rows, cards and phone rows", async ({ page, companyId, database }, testInfo) => {
  test.setTimeout(240000);
  // Linux WebKit leaves the iPhone descriptor's platform on the host.
  // Keep device detection consistent before the editor builds its keymap.
  await page.addInitScript(() => {
    if (/iPhone/.test(navigator.userAgent))
      Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(pagePath(page, `/records/${presetId(companyId, "contact")}`));
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const notesId = randomUUID();
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision, idempotencyKey: randomUUID(),
    operations: [{ operation: "putField", field: {
      id: notesId, typeId, label: "Notes", valueType: "richText", position: 12,
      required: false, archived: false, options: [], behavior: { kind: "input" },
    } }],
  });
  const choice = model.fields.find((field) => field.typeId === typeId && field.label === "Choice")!;
  const notesValue = async () => JSON.stringify((await database.query(
    'SELECT "jsonValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3',
    [companyId, typeId, notesId],
  )).rows);
  const errors = collectPageErrors(page);
  const selectAll = await page.evaluate(() =>
    /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? "Meta+a" : "Control+a",
  );
  const replaceNotes = async (textbox: Locator, value: string) => {
    await expect(textbox).toBeFocused();
    await textbox.press(selectAll);
    await textbox.press("Backspace");
    if (value) await textbox.pressSequentially(value);
    await expect(textbox).toHaveText(value);
  };
  let saved = "";
  for (const [mode, width] of [["row", 1280], ["card", 1280], ["row", 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(pagePath(page, `/records/${typeId}?viewMode=${mode}${mode === "card" ? `&groupBy=${choice.id}` : ""}`));
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("checkbox", { name: "Notes", exact: true }).check();
    if (width < 768) await page.locator('[data-slot="drawer-close"]').click();
    else await page.keyboard.press("Escape");
    const item = page.locator("[data-row-id], [data-item-id]").filter({ hasText: "Lab one" }).first();
    await expect(item).toBeVisible();
    const noteTrigger = item.getByRole("button", { name: "Edit Notes", exact: true });
    await expect(noteTrigger).not.toHaveText("Edit");
    await noteTrigger.click();
    const editor = page.getByRole("dialog", { name: "Notes", exact: true });
    await expect(editor.locator("[data-formatted-text-field]")).toBeVisible();
    if (width >= 768) expect((await editor.boundingBox())?.width).toBeGreaterThan(500);
    await expect(editor.getByRole("textbox", { name: "Notes", exact: true })).toBeVisible();
    const text = editor.getByRole("textbox", { name: "Notes", exact: true });
    const draft = `Formatted notes ${mode} ${width}${mode === "card" ? ` ${"Unbroken".repeat(12)}` : ""}`;
    await replaceNotes(text, draft);
    await expect.poll(notesValue).not.toContain(draft);
    if (mode === "card") {
      await editor.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
      await expect(editor).not.toBeVisible();
      expect(await notesValue()).toContain(saved);
      await item.getByRole("button", { name: "Edit Notes", exact: true }).click();
      await expect(editor.getByRole("textbox", { name: "Notes", exact: true })).toBeVisible();
      await replaceNotes(text, draft);
    }
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect.poll(notesValue).toContain(draft);
    saved = draft;
    await expect(item).toContainText(saved);
    expect(new URL(page.url()).pathname).toBe(pagePath(page, `/records/${typeId}`));
    await page.reload();
    await expect(item).toContainText(saved);
    if (mode === "card") {
      const cardBounds = await item.boundingBox();
      const valueBounds = await noteTrigger.boundingBox();
      expect(cardBounds).not.toBeNull();
      expect(valueBounds).not.toBeNull();
      expect(valueBounds!.width).toBeLessThanOrEqual(cardBounds!.width);
    }
    await page.screenshot({ path: testInfo.outputPath(`inline-notes-${mode}-${width}.png`), animations: "disabled" });
  }
  const phoneItem = page.locator("[data-row-id], [data-item-id]").filter({ hasText: "Lab one" }).first();
  await phoneItem.getByRole("button", { name: "Edit Notes", exact: true }).click();
  const notesEditor = page.getByRole("dialog", { name: "Notes", exact: true });
  const clearedNotes = notesEditor.getByRole("textbox", { name: "Notes", exact: true });
  await replaceNotes(clearedNotes, "");
  await expect(notesEditor.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await notesEditor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notesEditor).not.toBeVisible();
  await expect(phoneItem.getByRole("button", { name: "Edit Notes", exact: true })).toHaveCount(0);
  await phoneItem.getByRole("button", { name: "Add property", exact: true }).click();
  await page.getByRole("menuitem", { name: "Notes", exact: true }).click();
  const emptyNotes = page.getByRole("dialog").filter({ has: page.locator("[data-formatted-text-field]") });
  await replaceNotes(emptyNotes.getByRole("textbox", { name: "Notes", exact: true }), "Notes added from the existing property menu");
  await emptyNotes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(emptyNotes).not.toBeVisible();
  await expect.poll(notesValue).toContain("Notes added from the existing property menu");
  expect(errors).toEqual([]);
});

test("short chips stay readable and long chips truncate across table, card and phone widths", async ({
  page,
  companyId,
  database,
}, testInfo) => {
  await page.goto(companyPath(companyId, `/records/${presetId(companyId, "contact")}`));
  const typeId = await createLabList(page, presetId(companyId, "contact"));
  const model = await readModel(page);
  const choice = model.fields.find((field) => field.typeId === typeId && field.label === "Choice");
  const text = model.fields.find((field) => field.typeId === typeId && field.label === "Text");
  const date = model.fields.find((field) => field.typeId === typeId && field.label === "Date");
  const type = model.types.find((type) => type.id === typeId);
  if (!choice || !text || !date || !type) throw new Error("The lab fields are missing");
  const { publishedSummary, ...choiceDefinition } = choice;
  expect(publishedSummary).toBe(false);
  const groupId = randomUUID();
  const longLabel = "Priority requiring a thorough conversation with the customer and the delivery team";
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          ...choiceDefinition,
          options: choice.options.map((option) => ({
            ...option,
            label: option.id === "alpha" ? longLabel : "Internal",
          })),
        },
      },
      {
        operation: "putField",
        field: {
          id: groupId,
          typeId,
          label: "Board group",
          valueType: "select",
          position: 13,
          required: false,
          archived: false,
          options: [{ id: "group", label: "Group", color: null, attributes: [] }],
          behavior: { kind: "input" },
        },
      },
    ],
  });
  const record = (
    await database.query('SELECT id,version FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [companyId, typeId])
  ).rows[0];
  await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: (await readModel(page)).revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "update",
      ref: { typeId, recordId: record.id },
      expectedVersion: record.version,
      fields: [
        { fieldId: choice.id, value: { kind: "select", value: "alpha" } },
        { fieldId: text.id, value: { kind: "text", value: longLabel } },
        { fieldId: groupId, value: { kind: "select", value: "group" } },
      ],
    },
  });
  await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: (await readModel(page)).revision,
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId,
      fields: [
        { fieldId: type.primaryFieldId, value: { kind: "text", value: "Lab short chips" } },
        { fieldId: choice.id, value: { kind: "select", value: "beta" } },
        { fieldId: text.id, value: { kind: "text", value: "Short text" } },
        { fieldId: date.id, value: { kind: "date", value: "2026-10-27" } },
        { fieldId: groupId, value: { kind: "select", value: "group" } },
      ],
    },
  });
  const errors = collectPageErrors(page);
  for (const mode of ["row", "card"]) {
    for (const width of [390, 820, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(companyPath(companyId, `/records/${typeId}?viewMode=${mode}${mode === "card" ? `&groupBy=${groupId}` : ""}`));
      const shortRecord = page.locator("[data-row-id], [data-item-id]").filter({ hasText: "Lab short chips" }).first();
      for (const label of ["Choice", "Text", "Date"]) {
        const short = shortRecord.getByRole("button", { name: `Edit ${label}`, exact: true });
        await expect(short).toBeVisible();
        if (label === "Date") await expect(short.locator("time")).toHaveText(/2026/);
        const clipped = await short.evaluate((element) =>
          [...element.querySelectorAll(".truncate")].some(
            (label) => label.clientWidth > 0 && label.scrollWidth > label.clientWidth + 1,
          ),
        );
        expect(clipped, `${label} should fit without truncation at ${mode}/${width}`).toBe(false);
      }
      const target = page.locator(`[data-inline-edit="${choice.id}"]:visible`).filter({ hasText: longLabel }).first();
      if (mode === "row" && width >= 820) {
        const resize = page.getByRole("button", { name: /^Resize Choice column\./ });
        await resize.press("Home");
        for (let step = 0; step < 3; step++) await resize.press("Shift+ArrowRight");
        await expect
          .poll(async () => resize.evaluate((element) => element.closest("th")!.getBoundingClientRect().width))
          .toBe(170);
      }
      const chip = target.locator('[data-slot="badge"]:visible').filter({ hasText: longLabel }).first();
      await expect(chip).toBeVisible();
      await expect.poll(async () => (await chip.boundingBox())?.width ?? 0).toBeGreaterThan(0);
      const bounds = await chip.evaluate((element) => {
        const chip = element.getBoundingClientRect();
        const parent = element.closest("td, [data-chip-column]")?.getBoundingClientRect();
        const target = element.closest("[data-edit-target]")?.getBoundingClientRect();
        const truncated = [...element.querySelectorAll(".truncate")].some(
          (label) =>
            label.clientWidth > 0 &&
            label.scrollWidth > label.clientWidth &&
            getComputedStyle(label).textOverflow === "ellipsis",
        );
        return {
          left: chip.left,
          right: chip.right,
          parentLeft: parent?.left,
          parentRight: parent?.right,
          padding: target ? target.height - chip.height : 0,
          inChipRow: Boolean(element.closest("[data-chip-row]")),
          fillsCard: element.closest("[data-chip-column]") ? Math.abs(chip.width - (parent?.width ?? 0)) < 1 : true,
          truncated,
        };
      });
      expect(bounds.parentRight).toBeDefined();
      expect(bounds.left).toBeGreaterThanOrEqual((bounds.parentLeft ?? 0) - 1);
      expect(bounds.right).toBeLessThanOrEqual((bounds.parentRight ?? 0) + 1);
      expect(bounds.inChipRow).toBe(mode === "card" || width < 768);
      if (bounds.inChipRow) expect(bounds.padding).toBe(0);
      else expect(bounds.padding).toBeGreaterThanOrEqual(7);
      expect(bounds.fillsCard).toBe(true);
      expect(bounds.truncated).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`chips-${mode}-${width}.png`), animations: "disabled" });
      if (mode === "row" && width >= 820) {
        const cell = page
          .locator("tbody td")
          .filter({ has: page.getByRole("button", { name: "Edit Text", exact: true }) })
          .filter({ hasText: longLabel });
        const edit = cell.getByRole("button", { name: "Edit Text", exact: true });
        const cellBox = await cell.boundingBox();
        const editBox = await edit.boundingBox();
        if (!cellBox || !editBox) throw new Error("The editable cell is missing");
        expect(editBox.width).toBeLessThan(cellBox.width);
        await cell.click({ position: { x: cellBox.width - 4, y: cellBox.height / 2 } });
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).not.toBeVisible();
      }
    }
  }
  expect(errors).toEqual([]);
});
