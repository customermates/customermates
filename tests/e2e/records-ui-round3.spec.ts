import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import { expect, isAppConsoleError, isBenignPageError, test } from "./fixtures";

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

test("rows and cards open the record page and keep only Open details and Delete in More actions", async ({
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
  await row.hover();
  await row.getByRole("button", { name: `More actions for ${name}` }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Open details", "Delete"]);
  await page.getByRole("menuitem", { name: "Open details" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}(\\?|$)`));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await row.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}/[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { name }).or(page.getByText(name).first())).toBeVisible();
  expect(errors).toEqual([]);
});

test("edits every field type inline in rows and on board cards, with validation, cancel and calculated locks", async ({
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
  const openEditor = async (label: string) => {
    await row.hover();
    await row.getByRole("button", { name: `Edit ${label}`, exact: true }).click();
    const editor = page.locator('[data-slot="popover-content"][data-state="open"]').last();
    await expect(editor).toBeVisible();
    return editor;
  };
  const enterValue = async (label: string, value: string, shown: string) => {
    const editor = await openEditor(label);
    const input = editor.locator("input").first();
    await expect(input).toBeFocused();
    await input.press("ControlOrMeta+a");
    await page.keyboard.type(value);
    await page.keyboard.press("Enter");
    await expect(editor).not.toBeVisible();
    await expect(row).toContainText(shown);
  };

  await enterValue("Text", "Inline text", "Inline text");
  await enterValue("Number", "12.5", "12.5");
  await enterValue("Money", "99.95", "€99.95");
  await expect(row).toContainText("25");
  await expect(row.locator('[data-read-only-field]')).toHaveCount(1);
  await expect(row.getByRole("button", { name: "Edit Double", exact: true })).toHaveCount(0);

  const phone = await openEditor("Phone");
  const phoneInput = phone.locator("input").first();
  await phoneInput.fill("12 34");
  await phoneInput.press("Enter");
  await expect(phone).toBeVisible();
  await expect(phoneInput).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a phone number in international format", { exact: false }).first()).toBeVisible();
  await phoneInput.fill("+49301234567");
  await phoneInput.press("Enter");
  await expect(phone).not.toBeVisible();
  await expect(row).toContainText("+49301234567");

  const cancelled = await openEditor("Text");
  await cancelled.locator("input").first().fill("Never saved");
  await expect(cancelled.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(cancelled).not.toBeVisible();
  await expect(row).toContainText("Inline text");
  await expect(row).not.toContainText("Never saved");

  const unchanged = await openEditor("Text");
  await expect(unchanged.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");

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

  const contacts = await openEditor("Contacts");
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
  await card.hover();
  await card.getByRole("button", { name: "Edit Number", exact: true }).click();
  const cardEditor = page.locator('[data-slot="popover-content"][data-state="open"]').last();
  await expect(cardEditor).toBeVisible();
  await cardEditor.locator("input").first().fill("40");
  await cardEditor.locator("input").first().press("Enter");
  await expect(cardEditor).not.toBeVisible();
  await expect(card).toContainText("80");
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}\\?`));
  expect(errors).toEqual([]);
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
  await page.locator('[data-slot="column-resize-handle"]').first().focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await page.locator("[data-group-key]").first().boundingBox())!.width).toBe(before);
  await expect.poll(storedWidth).toBeUndefined();
});
