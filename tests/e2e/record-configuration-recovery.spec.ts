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
import { expect, test } from "./fixtures";

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
    if (error.message !== "ResizeObserver loop completed with undelivered notifications.") errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
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
  await page.goto(`/en/company/data-model?typeId=${typeId}`);
  await expect(page.getByRole("button", { name: labels.typeSettings, exact: true })).toBeEnabled();
}

async function select(page: Page, control: string, option: string) {
  await page.getByRole("dialog").locator(`#${control}`).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function preview(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: labels.preview, exact: true }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "Ready to apply" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: labels.apply, exact: true })).toBeEnabled();
}

async function apply(page: Page) {
  await preview(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: labels.apply, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

async function createList(page: Page, name: string) {
  await page.goto("/en/company/data-model");
  await page.getByRole("button", { name: labels.createList, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#name").fill(name);
  await dialog.getByRole("button", { name: labels.createList, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  if (!typeId) throw new Error("Expected created type route");
  await configure(page, typeId);
  return typeId;
}

async function editField(page: Page, label: string) {
  const row = page
    .getByRole("region", { name: labels.fields, exact: true })
    .getByText(label, { exact: true })
    .locator("..")
    .locator("..");
  await row.getByRole("button", { name: labels.edit, exact: true }).click();
  await expect(page.getByRole("dialog", { name: labels.editField, exact: true })).toBeVisible();
}

async function editType(page: Page) {
  await page.getByRole("button", { name: labels.typeSettings, exact: true }).click();
  await expect(page.getByRole("dialog", { name: labels.typeSettings, exact: true })).toBeVisible();
}

async function stalePreview(page: Page, inputId: string, draft: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: labels.preview, exact: true }).click();
  await expect(dialog.getByText(recovery.required, { exact: true })).toBeVisible();
  await expect(dialog.locator(`#${inputId}`)).toHaveValue(draft);
  await expect(dialog.locator(`#${inputId}`)).toHaveAttribute("readonly", "");
  await expect(dialog.getByRole("button", { name: labels.preview, exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: recovery.refresh, exact: true }).click();
  await expect(dialog.getByText(recovery.required, { exact: true })).not.toBeVisible();
}

async function apiConfiguration(page: Page, current: RecordModel, operations: ConfigurationChange["operations"]) {
  const change = ConfigurationChangeSchema.parse({
    expectedRevision: current.revision,
    idempotencyKey: randomUUID(),
    operations,
  });
  const previewResponse = await page.request.post("/api/v2/model/preview", { data: change });
  expect(previewResponse.status()).toBe(200);
  const validated = ConfigurationPreviewSchema.parse(await previewResponse.json());
  expect(validated.valid).toBe(true);
  expect(validated.execution).toBe("synchronous");
  const response = await page.request.post("/api/v2/model/apply", { data: change });
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
  await page.getByRole("button", { name: labels.addField, exact: true }).click();
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
    await page.getByRole("dialog").getByRole("button", { name: labels.apply, exact: true }).click();
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
      { choice: recovery.keep, iconLabel: labels.briefcase, icon: "briefcase", keepLocal: true },
      { choice: recovery.latest, iconLabel: labels.building, icon: "building", keepLocal: false },
    ]) {
      await test.step(scenario.choice, async () => {
        await configure(page, typeId);
        await configure(other, typeId);
        const before = await model(database, companyId);
        const localName = `${initialName} ${scenario.keepLocal ? "local" : "discarded"}`;
        const remoteName = `${initialName} ${scenario.keepLocal ? "remote first" : "remote last"}`;
        const localDescription = `${scenario.choice}: retain my separate description`;
        await editType(page);
        await editType(other);
        await page.getByRole("dialog").locator("#name").fill(localName);
        await page.getByRole("dialog").locator("#description").fill(localDescription);
        await other.getByRole("dialog").locator("#name").fill(remoteName);
        await select(other, "icon", scenario.iconLabel);
        await apply(other);
        const remote = await model(database, companyId);
        expect(remote.revision).toBe(before.revision + 1);
        expect(type(remote, typeId)).toMatchObject({ label: remoteName, icon: scenario.icon });
        await stalePreview(page, "name", localName);
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByText(recovery.conflict, { exact: true })).toBeVisible();
        await expect(dialog.locator("#name")).toHaveValue(localName);
        await expect(dialog.locator("#description")).toHaveValue(localDescription);
        await expect(dialog.locator("#icon")).toContainText(scenario.iconLabel);
        await expect(dialog.getByRole("button", { name: labels.preview, exact: true })).toBeDisabled();
        await expect(dialog.getByRole("button", { name: recovery.keep, exact: true })).toBeVisible();
        await expect(dialog.getByRole("button", { name: recovery.latest, exact: true })).toBeVisible();
        await dialog.getByRole("button", { name: scenario.choice, exact: true }).click();
        await expect(dialog.getByText(recovery.conflict, { exact: true })).not.toBeVisible();
        const expectedName = scenario.keepLocal ? localName : remoteName;
        await expect(dialog.locator("#name")).toHaveValue(expectedName);
        await expect(dialog.locator("#description")).toHaveValue(localDescription);
        await expect(dialog.locator("#name")).not.toHaveAttribute("readonly", "");
        await preview(page);
        expect((await model(database, companyId)).revision).toBe(remote.revision);
        await page.screenshot({
          path: testInfo.outputPath(`stale-${scenario.keepLocal ? "keep" : "latest"}.png`),
          fullPage: true,
        });
        await dialog.getByRole("button", { name: labels.apply, exact: true }).click();
        await expect(dialog).not.toBeVisible();
        const committed = await model(database, companyId);
        expect(committed.revision).toBe(remote.revision + 1);
        expect(type(committed, typeId)).toMatchObject({
          id: typeId,
          label: expectedName,
          pluralLabel: initialName,
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
    await editType(page);
    await expect(page.getByRole("dialog").locator("#name")).toHaveValue(`${initialName} remote last`);
    await expect(page.getByRole("dialog").locator("#icon")).toContainText(labels.building);
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
  const relationships = page.getByRole("region", { name: labels.relationships, exact: true });
  await relationships.getByRole("button", { name: labels.relationship, exact: true }).click();
  await select(page, "targetTypeId", name);
  await page.getByRole("dialog").locator("#sourceLabel").fill("Related entries");
  await page.getByRole("dialog").locator("#targetLabel").fill("Related from");
  await apply(page);
  await relationships.getByRole("button", { name: labels.relationship, exact: true }).click();
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
  const row = relationships.getByText(path.label, { exact: true }).locator("..").locator("..");
  await row.getByRole("button", { name: labels.edit, exact: true }).click();
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
    await expect(dialog.getByRole("button", { name: labels.preview, exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: recovery.refresh, exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: recovery.keep, exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: labels.apply, exact: true })).toHaveCount(0);
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
