import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import type { Client } from "pg";
import { test, expect, collectPageErrors } from "./fixtures";
import { postOk, readModel } from "./api";
import { configureDrawer, configureSaveBar, deleteFromDrawer, openConfigure, openConfigureRow, saveGeneral } from "./configure";
import { openRecordDetails, recordItem } from "./record-rows";
import { presetId } from "../../features/records/crm-preset";
import { restoreFromTrash } from "./trash";
import { clickHydrated } from "./workspace-switching";

async function fixture(page: Page, database: Client, companyId: string) {
  const typeId = presetId(companyId, "organization");
  const nameId = presetId(companyId, "organization.name");
  const aliasId = randomUUID();
  const stageId = randomUUID();
  const model = await readModel(database, companyId);
  const field = (id: string, label: string, valueType: string, position: number, options: object[] = []) => ({
    operation: "putField", field: { id, typeId, label, valueType, position, options, required: false, archived: false, behavior: { kind: "input" } },
  });
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision, idempotencyKey: randomUUID(),
    operations: [field(aliasId, "Alias", "text", 20), field(stageId, "Stage", "select", 21, [{ id: "open", label: "Open", color: "info", attributes: [] }])],
  });
  const current = await readModel(database, companyId);
  await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: current.revision, idempotencyKey: randomUUID(),
    mutation: { action: "create", typeId, fields: [
      { fieldId: nameId, value: { kind: "text", value: "Original organization" } },
      { fieldId: aliasId, value: { kind: "text", value: "Display alias" } },
      { fieldId: stageId, value: { kind: "select", value: "open" } },
    ] },
  });
  const rows = await database.query('SELECT "recordId" FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2 AND "textValue"=$3', [companyId, nameId, "Original organization"]);
  return { typeId, nameId, aliasId, stageId, recordId: rows.rows[0].recordId as string };
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("edits the record name as ordinary text in tables and cards, retaining cancel and record navigation", async ({ page, database, companyId, isMobile }, testInfo) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const { typeId, nameId, stageId, recordId } = await fixture(page, database, companyId);
  await page.goto(`/en/records/${typeId}`);
  if (isMobile) await expect(page.locator("[data-phone-rows]")).toBeVisible();
  const item = page.locator(`[data-row-id="${recordId}"], [data-item-id="${recordId}"]`).first();
  const persisted = async () => (await database.query('SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2 AND "recordId"=$3', [companyId, nameId, recordId])).rows[0].textValue;
  await clickHydrated(item.getByRole("button", { name: "Edit Name", exact: true }));
  const editor = isMobile ? page.locator('[data-slot="drawer-content"][data-state="open"]').last() : item.locator("[data-in-place-editor]");
  const input = editor.locator("input").first();
  await expect(input).toHaveValue("Original organization");
  await input.fill("Cancelled name");
  if (isMobile) {
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
    await expect(editor).not.toBeVisible();
  } else await input.press("Escape");
  expect(await persisted()).toBe("Original organization");
  await item.getByRole("button", { name: "Edit Name", exact: true }).click();
  await input.fill("Renamed organization");
  if (isMobile) await editor.getByRole("button", { name: "Save", exact: true }).click();
  else await input.press("Enter");
  await expect.poll(persisted).toBe("Renamed organization");
  await expect(editor).not.toBeVisible();
  await item.click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Renamed organization", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`/en/records/${typeId}?viewMode=card&groupBy=${stageId}`);
  const card = page.locator(`[data-item-id="${recordId}"]`);
  await clickHydrated(card.getByRole("button", { name: "Edit Name", exact: true }));
  const overlay = page.locator('[data-slot="popover-content"][data-state="open"], [data-slot="drawer-content"][data-state="open"]').last();
  await overlay.locator("input").first().fill("Card name");
  await overlay.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(persisted).toBe("Card name");
  await expect(card).toContainText("Card name");
  await expect(card.locator("button button, a button, button a")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("ordinary-name-editor.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});

test("changes the display-name mapping and link color in General and carries the name through search, links and restoration", async ({ page, database, companyId, workspace, isMobile }, testInfo) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const { typeId, nameId, aliasId, recordId } = await fixture(page, database, companyId);
  await database.query('INSERT INTO "P13n" (id,"companyId","userId","p13nId","columnOrder","hiddenColumns","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())', [randomUUID(), companyId, workspace.userId, `records:${typeId}`, [nameId, presetId(companyId, "organization.notes")], []]);
  await openConfigure(page, typeId);
  await expect(page.getByRole("combobox", { name: "Record name", exact: true })).toContainText("Name");
  await choose(page, "Record name", "Alias");
  await choose(page, "Linked record color", "Green");
  await configureSaveBar(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Record name", exact: true })).toContainText("Name");
  await choose(page, "Record name", "Alias");
  await choose(page, "Linked record color", "Green");
  await saveGeneral(page);
  let model = await readModel(database, companyId);
  expect(model.types.find((type) => type.id === typeId)).toMatchObject({ primaryFieldId: aliasId, color: "success" });
  await openConfigureRow(page, "Fields", "Alias");
  await expect(configureDrawer(page)).toContainText("Used as the record name for Organizations.");
  await page.keyboard.press("Escape");
  await page.goto(`/en/records/${typeId}`);
  if (isMobile) {
    const phone = page.locator(`[data-phone-rows] [data-row-id="${recordId}"]`);
    await expect(phone.getByRole("button", { name: "Edit Alias", exact: true })).toBeVisible();
    await expect(phone.locator(`[data-chip-column="${aliasId}"]`)).toHaveCount(0);
    await expect(phone.locator(`[data-chip-column="${nameId}"]`)).toBeVisible();
  } else {
    await expect(page.getByRole("columnheader", { name: /^Alias/ })).toBeVisible();
    const headers = await page.getByRole("columnheader").allTextContents();
    expect(headers.findIndex((label) => label.includes("Alias"))).toBeLessThan(headers.findIndex((label) => label.includes("Name")));
  }
  await openRecordDetails(page, "Display alias");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Display alias", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const found = await postOk(page, "/api/v1/records/search", { searchTerm: "Original organization", typeIds: [typeId] });
  expect(found.results).toMatchObject([{ ref: { typeId, recordId }, title: { state: "value", value: { kind: "text", value: "Display alias" } } }]);
  const dealId = presetId(companyId, "deal");
  await postOk(page, "/api/v1/records/mutate", {
    expectedRevision: model.revision, idempotencyKey: randomUUID(),
    mutation: { action: "create", typeId: dealId, fields: [{ fieldId: presetId(companyId, "deal.name"), value: { kind: "text", value: "Linked deal" } }], links: [{ relationId: presetId(companyId, "deal.organizations"), direction: "outgoing", record: { typeId, recordId } }] },
  });
  await page.goto(`/en/records/${dealId}`);
  await openRecordDetails(page, "Linked deal");
  await expect(page.getByRole("dialog").getByText("Display alias", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  const alias = model.fields.find((field) => field.id === aliasId);
  if (!alias) throw new Error("Alias is missing");
  const { archived, publishedSummary, ...definition } = alias;
  const invalid = await postOk(page, "/api/v1/model/preview", { expectedRevision: model.revision, idempotencyKey: randomUUID(), operations: [{ operation: "putField", field: { ...definition, multiple: true } }] });
  expect(invalid.issues).toContainEqual(expect.objectContaining({ code: "invalid_primary_field", fieldId: aliasId }));
  expect((await readModel(database, companyId)).revision).toBe(model.revision);
  await openConfigure(page, typeId);
  await openConfigureRow(page, "Fields", "Alias");
  await deleteFromDrawer(page, "Delete field");
  model = await readModel(database, companyId);
  expect(model.types.find((type) => type.id === typeId)?.primaryFieldId).toBe(nameId);
  await restoreFromTrash(page, "Alias");
  model = await readModel(database, companyId);
  expect(model.types.find((type) => type.id === typeId)?.primaryFieldId).toBe(aliasId);
  await page.goto(`/en/records/${typeId}`);
  await expect(recordItem(page, "Display alias")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("display-name-restored.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});

test("allows hiding and keyboard reordering the name column and persists both through reload", async ({ page, database, companyId, isMobile }) => {
  test.skip(isMobile, "Column visibility and ordering are verified on the desktop table");
  test.setTimeout(180000);
  const { typeId, nameId } = await fixture(page, database, companyId);
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-display-options").click();
  const checkbox = page.getByRole("checkbox", { name: "Name", exact: true });
  const drag = page.getByRole("button", { name: "Drag to reorder: Name", exact: true });
  await expect(checkbox).toBeEnabled();
  await expect(drag).toBeEnabled();
  await page.getByRole("checkbox", { name: "Notes", exact: true }).check();
  await drag.focus();
  await drag.press("Space");
  await expect(drag).toHaveAttribute("aria-pressed", "true");
  await drag.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.keyboard.press("ArrowDown");
  const notesId = presetId(companyId, "organization.notes");
  await expect(page.locator('[role="status"][aria-live="assertive"]').filter({ hasText: `Draggable item ${nameId}` })).toContainText(`was moved over droppable area ${notesId}`);
  await page.keyboard.press("Space");
  await expect(drag).not.toHaveAttribute("aria-pressed", "true");
  await checkbox.uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await database.query('SELECT "columnOrder" FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [companyId, `records:${typeId}`])).rows[0]?.columnOrder).toEqual(expect.arrayContaining([notesId, nameId]));
  await expect(page.getByRole("columnheader", { name: /^Name/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("columnheader", { name: /^Name/ })).toHaveCount(0);
  await page.locator("#records-display-options").click();
  await checkbox.check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  const headers = await page.getByRole("columnheader").allTextContents();
  const notesIndex = headers.findIndex((label) => label.includes("Notes"));
  const nameIndex = headers.findIndex((label) => label.includes("Name"));
  expect(notesIndex).toBeGreaterThanOrEqual(0);
  expect(nameIndex).toBeGreaterThan(notesIndex);
  await openRecordDetails(page, "Original organization");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("shows the record name first and as the card and phone heading in saved layouts that omit it", async ({ page, database, companyId, workspace }) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const { typeId, recordId, nameId, aliasId, stageId } = await fixture(page, database, companyId);
  const notesId = presetId(companyId, "organization.notes");
  await database.query('INSERT INTO "P13n" (id,"companyId","userId","p13nId","columnOrder","hiddenColumns","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())', [randomUUID(), companyId, workspace.userId, `records:${typeId}`, [aliasId, notesId], []]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/en/records/${typeId}?viewMode=table`);
  const headers = await page.getByRole("columnheader").allTextContents();
  expect(headers.findIndex((label) => label.includes("Name"))).toBeLessThan(headers.findIndex((label) => label.includes("Alias")));
  await page.goto(`/en/records/${typeId}?viewMode=card&groupBy=${stageId}`);
  const card = page.locator(`[data-item-id="${recordId}"]`);
  await expect(card.getByRole("button", { name: "Edit Name", exact: true })).toBeVisible();
  await expect(card.locator(`[data-chip-column="${nameId}"]`)).toHaveCount(0);
  await expect(card.locator(`[data-chip-column="${aliasId}"]`)).toBeVisible();
  await clickHydrated(page.locator("#records-display-options"));
  await page.getByRole("checkbox", { name: "Name", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "Edit Name", exact: true })).toHaveCount(0);
  await expect(card.getByText("Original organization", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(card.getByRole("button", { name: "Edit Name", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/en/records/${typeId}?viewMode=table`);
  const phone = page.locator(`[data-phone-rows] [data-row-id="${recordId}"]`);
  await expect(phone).toBeVisible();
  await expect(phone.getByRole("button", { name: "Edit Name", exact: true })).toHaveCount(0);
  await expect(phone.getByText("Original organization", { exact: true })).toHaveCount(0);
  await page.locator("#records-display-options").click();
  await page.getByRole("checkbox", { name: "Name", exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator('[data-slot="drawer-close"]').last().click();
  await expect(phone.locator(`[data-chip-column="${nameId}"]`)).toHaveCount(0);
  await phone.getByRole("button", { name: "Edit Name", exact: true }).click();
  const editor = page.locator('[data-slot="drawer-content"][data-state="open"]').last();
  await expect(editor.locator("input").first()).toHaveValue("Original organization");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(errors).toEqual([]);
});
