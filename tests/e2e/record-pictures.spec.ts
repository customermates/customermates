import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { test, expect, collectPageErrors } from "./fixtures";
import { postOk, readModel } from "./api";
import {
  configureDrawer,
  configureSaveBar,
  deleteFromDrawer,
  openConfigure,
  openConfigureRow,
  saveGeneral,
} from "./configure";
import { presetId } from "../../features/records/crm-preset";
import { localE2eEnvironment } from "./local-environment";

async function contacts(page: Page, database: Client, companyId: string) {
  const id = (key: string) => presetId(companyId, key);
  const model = await readModel(database, companyId);
  const avatar = model.fields.find((field) => field.id === id("contact.avatarUrl"));
  if (!avatar) throw new Error("The Contacts picture field is missing");
  const { archived: _archived, ...definition } = avatar;
  const portraitFieldId = randomUUID();
  const stageFieldId = randomUUID();
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      { operation: "putField", field: { ...definition, id: portraitFieldId, label: "Portrait", position: 100 } },
      {
        operation: "putField",
        field: {
          ...definition,
          id: stageFieldId,
          label: "Stage",
          valueType: "select",
          options: [{ id: "open", label: "Open", color: null, attributes: [] }],
          position: 101,
        },
      },
    ],
  });
  const first = new URL("/record-picture-a.svg", localE2eEnvironment().baseUrl).href;
  const second = new URL("/record-picture-b.svg", first).href;
  await page.route("**/record-picture-*.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="purple"/></svg>',
    }),
  );
  const current = await readModel(database, companyId);
  for (const [firstName, withPhoto] of [
    ["Picture", true],
    ["Initials", false],
  ] as const) {
    await postOk(page, "/api/v1/records/mutate", {
      expectedRevision: current.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: id("contact"),
        fields: [
          { fieldId: id("contact.firstName"), value: { kind: "text", value: firstName } },
          { fieldId: id("contact.lastName"), value: { kind: "text", value: "Record" } },
          ...(withPhoto
            ? [
                { fieldId: id("contact.avatarUrl"), value: { kind: "text", value: first } },
                { fieldId: portraitFieldId, value: { kind: "text", value: second } },
              ]
            : []),
        ],
      },
    });
  }
  return { typeId: id("contact"), portraitFieldId, stageFieldId, first, second };
}

function pictureRecord(page: Page, name: string) {
  return page.locator("tr, [data-row-id], [data-item-id]").filter({ hasText: name }).first();
}

function pictures(page: Page, name = "Picture Record") {
  return pictureRecord(page, name).locator('[data-slot="avatar"]');
}

async function choosePicture(page: Page, label: string) {
  await page.getByRole("combobox", { name: "Picture beside name", exact: true }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function closeAppearance(page: Page, mobile: boolean) {
  if (mobile) await page.locator('[data-slot="drawer-close"]').click();
  else await page.keyboard.press("Escape");
  await expect(page.getByRole("switch", { name: "Show record pictures", exact: true })).toHaveCount(0);
}

test("configures a picture source in General, explains the field, and disables pictures without deleting values", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const { typeId, portraitFieldId, first, second } = await contacts(page, database, companyId);
  const source = async () =>
    (await readModel(database, companyId)).capabilities
      .find((binding) => binding.kind === "avatar" && binding.typeId === typeId)
      ?.fields.find((field) => field.role === "image")?.fieldId;
  await page.goto(`/en/records/${typeId}`);
  await expect(pictures(page).locator("img")).toHaveAttribute("src", first);
  await expect(pictures(page, "Initials Record")).toHaveText("IR");
  await openConfigure(page, typeId);
  await expect(page.getByRole("combobox", { name: "Picture beside name", exact: true })).toContainText("Avatar");
  await choosePicture(page, "None");
  await configureSaveBar(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Picture beside name", exact: true })).toContainText("Avatar");
  await choosePicture(page, "Portrait");
  await saveGeneral(page);
  expect(await source()).toBe(portraitFieldId);
  await openConfigureRow(page, "Fields", "Portrait");
  await expect(configureDrawer(page)).toContainText("Used as the record picture for Contacts.");
  await page.keyboard.press("Escape");
  await expect(configureDrawer(page)).not.toBeVisible();
  await page.goto(`/en/records/${typeId}`);
  await expect(pictures(page).locator("img")).toHaveAttribute("src", second);
  await openConfigure(page, typeId);
  await choosePicture(page, "None");
  await saveGeneral(page);
  expect(await source()).toBeUndefined();
  const stored = await database.query('SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2', [
    companyId,
    portraitFieldId,
  ]);
  expect(stored.rows.map((row) => row.textValue)).toContain(second);
  await page.goto(`/en/records/${typeId}`);
  await expect(pictureRecord(page, "Picture Record")).toBeVisible();
  await expect(pictures(page)).toHaveCount(0);
  await page.locator("#records-display-options").click();
  await expect(page.getByRole("switch", { name: "Show record pictures", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("saves picture visibility per view, cancels drafts, and keeps it across table and board reloads", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const { typeId, first } = await contacts(page, database, companyId);
  const mobile = testInfo.project.name === "mobile";
  const toggle = () => page.getByRole("switch", { name: "Show record pictures", exact: true });
  const save = () => page.locator("#records-display-options-view-save");
  const cancel = () => page.locator("#records-display-options-view-cancel");
  await page.goto(`/en/records/${typeId}`);
  await expect(pictures(page).locator("img")).toHaveAttribute("src", first);
  await page.locator("#records-display-options").click();
  await toggle().click();
  await expect(toggle()).not.toBeChecked();
  await expect(save()).toBeVisible();
  await cancel().click();
  await expect(toggle()).toBeChecked();
  await expect(save()).toHaveCount(0);
  await toggle().click();
  await save().click();
  await expect(save()).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await database.query('SELECT "showRecordPictures" FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [
            companyId,
            `records:${typeId}`,
          ])
        ).rows[0]?.showRecordPictures,
    )
    .toBe(false);
  await closeAppearance(page, mobile);
  await page.reload();
  await expect(pictureRecord(page, "Picture Record")).toBeVisible();
  await expect(pictures(page)).toHaveCount(0);
  const { viewKey } = await postOk(page, "/api/v1/data-views/create", {
    surfaceKey: `records:${typeId}`,
    name: "With pictures",
    state: { showRecordPictures: true },
  });
  await page.goto(`/en/records/${typeId}?view=${viewKey}`);
  await expect(pictures(page).locator("img")).toHaveAttribute("src", first);
  await page.locator("#records-display-options").click();
  await toggle().click();
  await save().click();
  await expect(save()).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await database.query('SELECT "showRecordPictures" FROM "DataView" WHERE id=$1', [viewKey])).rows[0]
          ?.showRecordPictures,
    )
    .toBe(false);
  await closeAppearance(page, mobile);
  await page.reload();
  await expect(pictureRecord(page, "Picture Record")).toBeVisible();
  await expect(pictures(page)).toHaveCount(0);
  await page.locator("#records-display-options").click();
  await toggle().click();
  await save().click();
  await expect(save()).toHaveCount(0);
  await closeAppearance(page, mobile);
  await page.goto(`/en/records/${typeId}?view=__all__`);
  await expect(pictureRecord(page, "Picture Record")).toBeVisible();
  await expect(pictures(page)).toHaveCount(0);
  await page.locator("#records-display-options").click();
  await page.locator("#records-layout-board").click();
  await page.getByRole("combobox", { name: "Group By", exact: true }).click();
  await page.getByRole("option", { name: "Stage", exact: true }).click();
  await save().click();
  await expect(save()).toHaveCount(0);
  await closeAppearance(page, mobile);
  await page.reload();
  await expect(pictureRecord(page, "Picture Record")).toBeVisible();
  await expect(pictures(page)).toHaveCount(0);
  await page.locator("#records-display-options").click();
  await toggle().click();
  await save().click();
  await expect(save()).toHaveCount(0);
  await closeAppearance(page, mobile);
  await expect(pictures(page).locator("img")).toHaveAttribute("src", first);
  await expect(pictures(page, "Initials Record")).toHaveText("IR");
  await page.reload();
  await expect(pictures(page).locator("img")).toHaveAttribute("src", first);
  await page.screenshot({ path: testInfo.outputPath("record-pictures-board.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});

test("enables pictures on an unconfigured list using an existing URL field", async ({ page, database, companyId }) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "organization");
  const modelBefore = await readModel(database, companyId);
  const avatar = modelBefore.fields.find((field) => field.id === presetId(companyId, "contact.avatarUrl"));
  if (!avatar) throw new Error("Expected a URL field definition");
  const { archived: _archived, ...definition } = avatar;
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: modelBefore.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          ...definition,
          id: presetId(companyId, "organization.website"),
          typeId,
          label: "Website",
          position: 100,
        },
      },
    ],
  });
  await openConfigure(page, typeId);
  await expect(page.getByRole("combobox", { name: "Picture beside name", exact: true })).toContainText("None");
  await choosePicture(page, "Website");
  await saveGeneral(page);
  const model = await readModel(database, companyId);
  expect(model.capabilities.find((binding) => binding.kind === "avatar" && binding.typeId === typeId)?.fields).toEqual([
    { role: "image", fieldId: presetId(companyId, "organization.website") },
  ]);
  await page.goto(`/en/records/${typeId}`);
  await expect(pictures(page, "Example organization")).toHaveText("EO");
  expect(errors).toEqual([]);
});

test("keeps pictures beside fallback titles when the primary name field is removed", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const { typeId, stageFieldId, first } = await contacts(page, database, companyId);
  await openConfigure(page, typeId);
  await openConfigureRow(page, "Fields", "Name");
  await deleteFromDrawer(page, "Delete field");
  await page.goto(`/en/records/${typeId}`);
  await expect(page.locator('main [data-slot="avatar"] img')).toHaveAttribute("src", first);
  await expect(page.locator("main")).toContainText("Untitled Contact");
  await page.goto(`/en/records/${typeId}?viewMode=card&groupBy=${stageFieldId}`);
  await expect(page.locator('[data-item-id] [data-slot="avatar"] img')).toHaveAttribute("src", first);
  await expect(page.locator("[data-item-id]").first()).toContainText("Untitled Contact");
  expect(errors).toEqual([]);
});
