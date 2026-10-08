import type { Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { addChannelsField, addFromConfigure, configureListCard, configureRow, configureTopBar, deleteFromDrawer, deleteRecentlyDeletedPermanently, deleteSelectedList, followConfigureLink, openConfigure, openConfigureRow, openConfigureTab, openDrawerTab, openListAction, restoreRecentlyDeleted, saveDrawer, saveGeneral, selectConfigureList } from "./configure";
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

async function openRecordList(page: Page, typeId: string) {
  const link = page.locator(`[id="nav-records:${typeId}"]`);
  if (!(await link.isVisible())) await page.locator("#sidebar-trigger").click();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}$`));
}

async function createList(page: Page, name: string) {
  await openConfigure(page);
  await addFromConfigure(page, "List");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill(name);
  await expect(dialog.getByRole("switch", { name: "Enable channels", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  if (!typeId) throw new Error("The created list route did not contain its identity");
  return typeId;
}

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

test("adds Channels as a field, keeps its settings, deletes, restores and permanently deletes it", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = captureErrors(page);
  const contactTypeId = presetId(companyId, "contact");
  const dialog = page.getByRole("dialog");
  const confirmation = page.getByRole("alertdialog");
  const channelsOf = async (typeId: string) =>
    (await readModel(database, companyId)).capabilities.find(
      (binding) => binding.kind === "channels" && binding.typeId === typeId,
    );
  await page.goto(`/en/records/${contactTypeId}`);
  const configure = page
    .getByRole("link", { name: "Configure", exact: true })
    .and(page.locator("#nav-configure-records"));
  if (!(await configure.isVisible())) await page.locator("#sidebar-trigger").click();
  await configure.click();
  await expect(page).toHaveURL(/\/en\/configure$/);
  await expect(page.locator(`[data-configure-graph-channels="${contactTypeId}"]`)).toContainText("Channels");
  await page.locator("[data-configure-graph]").getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Contacts", exact: true })).toBeVisible();
  const general = page.getByRole("region", { name: "General", exact: true });
  await expect(general.getByRole("switch", { name: "Enable channels", exact: true })).toHaveCount(0);
  await expect(general.getByRole("switch", { name: "Use channel profile picture", exact: true })).toHaveCount(0);
  const before = await channelsOf(contactTypeId);
  expect(before).toMatchObject({ providerAvatar: true });
  expect(before?.enabled).not.toBe(false);
  await openConfigureRow(page, "Fields", "Channels");
  await expect(dialog.getByRole("combobox", { name: "Value type", exact: true })).toContainText("Channels");
  await expect(dialog.getByRole("combobox", { name: "Value type", exact: true })).toBeDisabled();
  await dialog.getByRole("switch", { name: "Use channel profile picture", exact: true }).uncheck();
  await saveDrawer(page);
  expect(await channelsOf(contactTypeId)).toEqual({ ...before, enabled: true, providerAvatar: false });

  const customTypeId = await createList(page, "Candidates");
  expect(await channelsOf(customTypeId)).toBeUndefined();
  await addChannelsField(page, customTypeId);
  expect(await channelsOf(customTypeId)).toMatchObject({
    kind: "channels",
    enabled: true,
    providerAvatar: false,
    fields: [],
  });
  await configureTopBar(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Relationship", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Channels", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await openConfigureTab(page, "Fields");
  await openConfigureRow(page, "Fields", "Channels");
  await dialog.getByRole("button", { name: "Delete field", exact: true }).click();
  await expect(confirmation).toContainText("Delete Channels?");
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await channelsOf(customTypeId))?.enabled).toBe(false);
  await expect(configureRow(page, "Fields", "Channels")).toHaveCount(0);
  await openRecordList(page, customTypeId);
  await page.locator("#records-add").click();
  await expect(dialog.getByRole("combobox", { name: "Add channel", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await restoreRecentlyDeleted(page, "Channels");
  await expect.poll(async () => (await channelsOf(customTypeId))?.enabled).toBe(true);
  await openRecordList(page, customTypeId);
  await page.locator("#records-add").click();
  await expect(dialog.getByRole("combobox", { name: "Add channel", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await followConfigureLink(page);
  await openConfigureTab(page, "Fields");
  await openConfigureRow(page, "Fields", "Channels");
  await deleteFromDrawer(page, "Delete field");
  await expect.poll(async () => (await channelsOf(customTypeId))?.enabled).toBe(false);
  await deleteRecentlyDeletedPermanently(page, "Channels");
  await expect.poll(async () => channelsOf(customTypeId)).toBeUndefined();
  await openConfigure(page, customTypeId);
  await openConfigureTab(page, "Fields");
  await expect(configureRow(page, "Fields", "Channels")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("channels-field-deleted.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});

test("edits a linear calculation and restores deleted fields, activity connections and a list", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = captureErrors(page);
  const name = "Research budgets";
  const typeId = await createList(page, name);
  const dialog = page.getByRole("dialog");
  await followConfigureLink(page);
  await addFromConfigure(page, "Field");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Budget");
  await dialog.getByRole("combobox", { name: "Value type", exact: true }).click();
  await page.getByRole("option", { name: "Number", exact: true }).click();
  await applyConfiguration(page);
  await addFromConfigure(page, "Field");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Double budget");
  await dialog.getByRole("combobox", { name: "Value type", exact: true }).click();
  await page.getByRole("option", { name: "Number", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Value source", exact: true }).click();
  await page.getByRole("option", { name: "Calculated", exact: true }).click();
  await openDrawerTab(page, "Calculation");
  const calculation = dialog.getByRole("region", { name: "Calculation", exact: true });
  await calculation.getByRole("combobox", { name: "Use", exact: true }).click();
  await page.getByRole("option", { name: "Calculation", exact: true }).click();
  await calculation.getByRole("combobox", { name: "Calculation", exact: true }).click();
  await page.getByRole("option", { name: "Multiply", exact: true }).click();
  await calculation.getByRole("button", { name: /^Input 1\b/ }).click();
  await expect(dialog.locator('[data-calculation-editor="linear"]')).toHaveCount(1);
  await calculation.getByRole("combobox", { name: "Use", exact: true }).click();
  await page.getByRole("option", { name: "Field", exact: true }).click();
  await calculation.getByRole("combobox", { name: "Field", exact: true }).click();
  await page.getByRole("option", { name: "Budget", exact: true }).click();
  await calculation.getByRole("button", { name: "Result", exact: true }).click();
  await calculation.getByRole("button", { name: /^Input 2\b/ }).click();
  await calculation.getByRole("textbox", { name: "Fixed value", exact: true }).fill("2");
  await calculation.getByRole("button", { name: "Result", exact: true }).click();
  await expect(page.getByRole("dialog").locator("[data-calculation-sentence]")).toContainText("Budget × 2");
  await page.screenshot({ path: testInfo.outputPath("linear-calculation-editor.png"), animations: "disabled" });
  await applyConfiguration(page);
  const model = await readModel(database, companyId);
  const budget = model.fields.find((field) => field.typeId === typeId && field.label === "Budget");
  const doubled = model.fields.find((field) => field.typeId === typeId && field.label === "Double budget");
  expect(doubled?.behavior).toEqual({
    kind: "formula",
    expression: {
      kind: "operation",
      operator: "multiply",
      arguments: [
        { kind: "field", fieldId: budget?.id },
        { kind: "literal", value: { kind: "decimal", value: "2", currency: null } },
      ],
    },
  });
  await openRecordList(page, typeId);
  await page.locator("#records-add").click();
  await dialog.getByRole("textbox", { name, exact: false }).fill("Pilot research");
  await dialog.getByRole("textbox", { name: "Budget", exact: true }).fill("12.5");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const calculated = await database.query(
    'SELECT state,trim_scale("decimalValue")::text AS value FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3',
    [companyId, typeId, doubled?.id],
  );
  expect(calculated.rows).toEqual([{ state: "value", value: "25" }]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Pilot research", exact: true })).toBeVisible();
  await followConfigureLink(page);
  await openConfigureRow(page, "Fields", "Double budget");
  await deleteFromDrawer(page, "Delete field");
  await expect(configureRow(page, "Fields", "Double budget")).toHaveCount(0);
  await restoreRecentlyDeleted(page, "Double budget");
  expect((await readModel(database, companyId)).fields.find((field) => field.id === doubled?.id)).toMatchObject({
    archived: false,
    behavior: doubled?.behavior,
  });
  await openConfigure(page, typeId);
  await openConfigureRow(page, "Activity connections", name);
  await deleteFromDrawer(page, "Delete activity connection");
  await expect(configureRow(page, "Activity connections", name)).toHaveCount(0);
  await restoreRecentlyDeleted(page, name);
  expect((await readModel(database, companyId)).activityPaths.find((path) => path.typeId === typeId)).toMatchObject({
    label: name,
    archived: false,
    path: [],
    includeAudit: true,
    includeMessages: false,
  });
  await openConfigure(page);
  await selectConfigureList(page, name);
  await deleteSelectedList(page);
  await expect(configureListCard(page, name)).toHaveCount(0);
  await restoreRecentlyDeleted(page, name);
  expect((await readModel(database, companyId)).types.find((type) => type.id === typeId)).toMatchObject({
    archived: false,
    pluralLabel: name,
  });
  await openRecordList(page, typeId);
  await expect(page.getByRole("button", { name: "Pilot research", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "25", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("restored-custom-record.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});
