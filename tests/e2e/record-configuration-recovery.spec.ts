import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import type { Client } from "pg";
import {
  ConfigurationChangeSchema,
  ConfigurationPreviewSchema,
  type ConfigurationChange,
} from "../../features/records/configuration.schema";
import { RecordModelSchema, type RecordModel } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { addFromConfigure, configureTopBar, openConfigure, openConfigureRow, saveDrawer, saveGeneral } from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";
import { suggestListPlural } from "../../app/[locale]/(protected)/configure/components/list-plural";

const labels = englishMessages.RecordModel;
const recovery = {
  refresh: labels.staleRefresh,
  required: labels.staleRefreshRequired,
  conflict: labels.staleControlConflict,
  keep: labels.staleKeepDraft,
  latest: labels.staleLoadLatest,
  removed: labels.staleTargetMissing,
};

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

async function model(database: Client, companyId: string): Promise<RecordModel> {
  const result = await database.query(
    'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0]?.snapshot);
}

function type(model: RecordModel, typeId: string) {
  const found = model.types.find((candidate) => candidate.id === typeId);
  if (!found) throw new Error("Expected configured type");
  return found;
}

async function configure(page: Page, typeId: string) {
  await openConfigure(page, typeId);
  await expect(configureTopBar(page).getByRole("button", { name: "Add", exact: true })).toBeEnabled();
  await expect(general(page)).toBeVisible();
}

function general(page: Page) {
  return page.getByRole("region", { name: labels.general, exact: true });
}

function listPane(page: Page) {
  return page.locator("[data-configure-list-pane]");
}

function generalControl(page: Page, id: string) {
  return page.locator(`#configure-general-${id}`);
}

async function select(page: Page, control: string, option: string) {
  await page.getByRole("dialog").locator(`#${control}`).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function preview(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).first().click();
  await expect(dialog.getByRole("status").filter({ hasText: "Ready to apply" })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).first(),
  ).toBeEnabled();
}

async function apply(page: Page) {
  await saveDrawer(page);
}

async function createList(page: Page, name: string) {
  await openConfigure(page);
  await addFromConfigure(page, "List");
  const dialog = page.getByRole("dialog");
  await dialog.locator("#name").fill(name);
  await dialog.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).first().click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  if (!typeId) throw new Error("Expected created type route");
  await configure(page, typeId);
  return typeId;
}

async function editField(page: Page, label: string) {
  await openConfigureRow(page, "Fields", label);
  await expect(page.getByRole("dialog", { name: labels.editField, exact: true })).toBeVisible();
}

async function stalePreview(page: Page, inputId: string, draft: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).first().click();
  await expect(dialog.getByText(recovery.required, { exact: true })).toBeVisible();
  await expect(dialog.locator(`#${inputId}`)).toHaveValue(draft);
  await expect(dialog.locator(`#${inputId}`)).toHaveAttribute("readonly", "");
  await expect(dialog.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).first()).toBeDisabled();
  await dialog.getByRole("button", { name: recovery.refresh, exact: true }).click();
  await expect(dialog.getByText(recovery.required, { exact: true })).not.toBeVisible();
}

async function apiConfiguration(page: Page, current: RecordModel, operations: ConfigurationChange["operations"]) {
  const change = ConfigurationChangeSchema.parse({
    expectedRevision: current.revision,
    idempotencyKey: randomUUID(),
    operations,
  });
  const previewResponse = await page.request.post("/api/v1/model/preview", { data: change });
  expect(previewResponse.status()).toBe(200);
  const validated = ConfigurationPreviewSchema.parse(await previewResponse.json());
  expect(validated.valid).toBe(true);
  expect(validated.execution).toBe("synchronous");
  const response = await page.request.post("/api/v1/model/apply", { data: change });
  expect(response.status()).toBe(200);
  const result = RecordOperationResultSchema.parse(await response.json());
  expect(result.status).toBe("completed");
  expect(result.schemaRevision).toBe(current.revision + 1);
}

test("recovers concurrent configuration drafts and resolves each same-control choice without losing unrelated edits", async ({
  page,
  context,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = collectErrors(page);
  const initialName = `Recovery entries ${randomUUID().slice(0, 8)}`;
  const typeId = await createList(page, initialName);
  await addFromConfigure(page, "Field");
  await page.getByRole("dialog").locator("#label").fill("Budget");
  await select(page, "valueType", labels.types.number);
  await apply(page);
  const initial = await model(database, companyId);
  const originalField = initial.fields.find((field) => field.typeId === typeId && field.label === "Budget");
  if (!originalField) throw new Error("Expected Budget field");
  const other = await context.newPage();
  const otherErrors = collectErrors(other);
  try {
    await configure(other, typeId);
    await editField(page, "Budget");
    await editField(other, "Budget");
    await page.getByRole("dialog").locator("#label").fill("Working budget");
    await other.getByRole("dialog").locator("#required").check();
    await apply(other);
    const remoteFieldModel = await model(database, companyId);
    expect(remoteFieldModel.revision).toBe(initial.revision + 1);
    expect(remoteFieldModel.fields.find((field) => field.id === originalField.id)).toMatchObject({
      label: "Budget",
      required: true,
    });
    await stalePreview(page, "label", "Working budget");
    await expect(page.getByRole("dialog").locator("#required")).toBeChecked();
    await expect(page.getByRole("dialog").locator("#label")).not.toHaveAttribute("readonly", "");
    await expect(page.getByRole("dialog").getByRole("button", { name: recovery.keep, exact: true })).toHaveCount(0);
    await preview(page);
    expect((await model(database, companyId)).revision).toBe(remoteFieldModel.revision);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: englishMessages.Common.actions.save, exact: true })
      .first()
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const merged = await model(database, companyId);
    expect(merged.revision).toBe(remoteFieldModel.revision + 1);
    expect(merged.fields.find((field) => field.id === originalField.id)).toMatchObject({
      id: originalField.id,
      typeId,
      label: "Working budget",
      required: true,
      valueType: "number",
    });
    for (const scenario of [
      { choice: recovery.keep, iconLabel: labels.icons.briefcase, icon: "briefcase", keepLocal: true },
      { choice: recovery.latest, iconLabel: labels.icons.building, icon: "building", keepLocal: false },
    ]) {
      await test.step(scenario.choice, async () => {
        await configure(page, typeId);
        await configure(other, typeId);
        const before = await model(database, companyId);
        const localName = `${initialName} ${scenario.keepLocal ? "local" : "discarded"}`;
        const remoteName = `${initialName} ${scenario.keepLocal ? "remote first" : "remote last"}`;
        const localDescription = `${scenario.choice}: retain my separate description`;
        await generalControl(page, "name").fill(localName);
        await generalControl(page, "description").fill(localDescription);
        await generalControl(other, "name").fill(remoteName);
        await generalControl(other, "icon").click();
        await other
          .getByRole("toolbar", { name: labels.iconChoose, exact: true })
          .getByRole("button", { name: scenario.iconLabel, exact: true })
          .click();
        await expect(generalControl(other, "icon")).toContainText(scenario.iconLabel);
        await saveGeneral(other);
        const remote = await model(database, companyId);
        expect(remote.revision).toBe(before.revision + 1);
        expect(type(remote, typeId)).toMatchObject({ label: remoteName, icon: scenario.icon });
        const save = configureTopBar(page).getByRole("button", {
          name: englishMessages.Common.actions.save,
          exact: true,
        });
        await save.click();
        await expect(listPane(page).getByText(recovery.required, { exact: true })).toBeVisible();
        await expect(generalControl(page, "name")).toHaveValue(localName);
        await expect(generalControl(page, "name")).toHaveAttribute("readonly", "");
        await expect(save).toBeDisabled();
        await listPane(page).getByRole("button", { name: recovery.refresh, exact: true }).click();
        await expect(listPane(page).getByText(recovery.required, { exact: true })).not.toBeVisible();
        await expect(listPane(page).getByText(recovery.conflict, { exact: true })).toBeVisible();
        await expect(generalControl(page, "name")).toHaveValue(localName);
        await expect(generalControl(page, "description")).toHaveValue(localDescription);
        await expect(generalControl(page, "icon")).toContainText(scenario.iconLabel);
        await expect(save).toBeDisabled();
        await expect(listPane(page).getByRole("button", { name: recovery.keep, exact: true })).toBeVisible();
        await expect(listPane(page).getByRole("button", { name: recovery.latest, exact: true })).toBeVisible();
        await listPane(page).getByRole("button", { name: scenario.choice, exact: true }).click();
        await expect(listPane(page).getByText(recovery.conflict, { exact: true })).not.toBeVisible();
        const expectedName = scenario.keepLocal ? localName : remoteName;
        await expect(generalControl(page, "name")).toHaveValue(expectedName);
        await expect(generalControl(page, "description")).toHaveValue(localDescription);
        await expect(generalControl(page, "name")).not.toHaveAttribute("readonly", "");
        expect((await model(database, companyId)).revision).toBe(remote.revision);
        await page.screenshot({
          path: testInfo.outputPath(`stale-${scenario.keepLocal ? "keep" : "latest"}.png`),
          fullPage: true,
        });
        await saveGeneral(page);
        const committed = await model(database, companyId);
        expect(committed.revision).toBe(remote.revision + 1);
        expect(type(committed, typeId)).toMatchObject({
          id: typeId,
          label: expectedName,
          pluralLabel: suggestListPlural(expectedName, "en"),
          description: localDescription,
          icon: scenario.icon,
        });
        expect(committed.fields.find((field) => field.id === originalField.id)).toMatchObject({
          label: "Working budget",
          required: true,
        });
      });
    }
    await configure(page, typeId);
    await expect(generalControl(page, "name")).toHaveValue(`${initialName} remote last`);
    await expect(generalControl(page, "icon")).toContainText(labels.icons.building);
    expect(errors).toEqual([]);
    expect(otherErrors).toEqual([]);
  } finally {
    await other.close();
  }
});

test("preserves a stale relationship-path draft and blocks publication after the definition is removed", async ({
  page,
  context,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(180000);
  const errors = collectErrors(page);
  const name = `Removed path ${randomUUID().slice(0, 8)}`;
  const typeId = await createList(page, name);
  await addFromConfigure(page, "Relationship");
  await select(page, "targetTypeId", suggestListPlural(name, "en"));
  await page.getByRole("dialog").locator("#sourceLabel").fill("Related entries");
  await page.getByRole("dialog").locator("#targetLabel").fill("Related from");
  await apply(page);
  await addFromConfigure(page, "Relationship");
  await select(page, "mode", labels.relationshipPath);
  await page.getByRole("dialog").locator("#sourceLabel").fill("Related overview");
  await page.getByRole("dialog").getByRole("combobox", { name: labels.addPathStep, exact: true }).click();
  await page.getByRole("option", { name: "Related entries", exact: true }).click();
  await apply(page);
  const before = await model(database, companyId);
  const path = type(before, typeId).relationshipPaths?.find((candidate) => candidate.label === "Related overview");
  if (!path) throw new Error("Expected UI-created relationship path");
  const relation = before.relationships.find((candidate) => candidate.id === path.path[0]?.relationId);
  if (!relation) throw new Error("Expected path relationship");
  await openConfigureRow(page, "Relationships", path.label);
  const dialog = page.getByRole("dialog");
  await dialog.locator("#sourceLabel").fill("Unsaved overview name");
  const other = await context.newPage();
  const otherErrors = collectErrors(other);
  try {
    await configure(other, typeId);
    await apiConfiguration(other, before, [
      {
        operation: "putType",
        type: { ...type(before, typeId), relationshipPaths: [] },
      },
    ]);
    const removed = await model(database, companyId);
    expect(type(removed, typeId).relationshipPaths).toEqual([]);
    expect(removed.relationships.find((candidate) => candidate.id === relation.id)).toEqual(relation);
    await stalePreview(page, "sourceLabel", "Unsaved overview name");
    await expect(dialog.getByText(recovery.removed, { exact: true })).toBeVisible();
    await expect(dialog.locator("#sourceLabel")).toHaveValue("Unsaved overview name");
    await expect(dialog.locator("#sourceLabel")).toHaveAttribute("readonly", "");
    await expect(dialog.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).first()).toBeDisabled();
    await expect(dialog.getByRole("button", { name: recovery.refresh, exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: recovery.keep, exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("status").filter({ hasText: "Ready to apply" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("stale-removed-path-draft.png"), fullPage: true });
    const unchanged = await model(database, companyId);
    expect(unchanged.revision).toBe(removed.revision);
    expect(type(unchanged, typeId).relationshipPaths).toEqual([]);
    expect(unchanged.relationships.find((candidate) => candidate.id === relation.id)).toEqual(relation);
    await configure(other, typeId);
    await expect(
      other
        .getByRole("region", { name: labels.relationships, exact: true })
        .getByText("Related overview", { exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(otherErrors).toEqual([]);
  } finally {
    await other.close();
  }
});
