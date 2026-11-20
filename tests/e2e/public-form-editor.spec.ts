import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { postOk, readModel } from "./api";
import { companyPath } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { createView, openShareDialog } from "./view-sharing-helpers";

const share = englishMessages.DataView.share;
const builder = englishMessages.PublicForm.builder;
const afterSubmit = englishMessages.PublicForm.afterSubmit;

// A list can require a field only while every one of its records has a value for it, and the workspace of a browser
// test holds one organization. So the field arrives the way it does in a workspace with data: as an optional field,
// then the existing records get a value, then the field becomes required. It has no default value at any point.
async function requireNewTextField(
  page: Page,
  database: Client,
  companyId: string,
  field: { id: string; typeId: string; label: string; multiple: boolean; position: number },
) {
  const { typeId } = field;
  const put = async (required: boolean) => {
    const applied = await postOk(page, "/api/v1/model/apply", {
      expectedRevision: (await readModel(database, companyId)).revision,
      idempotencyKey: randomUUID(),
      operations: [
        {
          operation: "putField",
          field: { ...field, valueType: "text", behavior: { kind: "input" }, required, options: [] },
        },
      ],
    });
    expect(applied).toMatchObject({ status: "completed" });
  };

  await put(false);
  const { revision } = await readModel(database, companyId);
  const records = await database.query<{ id: string; version: number }>(
    'SELECT id, version FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, typeId],
  );
  for (const record of records.rows)
    await postOk(page, "/api/v1/records/mutate", {
      expectedRevision: revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "update",
        ref: { typeId, recordId: record.id },
        expectedVersion: record.version,
        fields: [
          {
            fieldId: field.id,
            value: field.multiple
              ? { kind: "textList", value: ["Filled in before"] }
              : { kind: "text", value: "Filled in before" },
          },
        ],
      },
    });
  await put(true);
}

test("edits the form in two panes, sees the preview follow every change and is asked before the edits are dropped", async ({
  page,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const typeId = presetId(companyId, "organization");

  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await createView(page, "Intake");
  const dialog = await openShareDialog(page);
  await expect(dialog.locator("#share-view-tab-form")).toHaveText(share.tabForm);
  await dialog.locator("#share-view-tab-form").click();

  const tab = dialog.locator("#public-form-tab");
  await expect(tab.locator("[data-form-layout]")).toHaveAttribute("data-form-layout", "wide");
  const preview = dialog.locator("#public-form-preview");
  await expect(preview).toBeVisible();
  await expect(tab.locator("#public-form-title-input")).toBeVisible();
  await expect(tab.locator("[data-form-preview-frame]")).toBeVisible();

  await tab.locator("#public-form-title-input").fill("Talk to us");
  await expect(preview.locator("#public-form-title")).toHaveText("Talk to us");
  await tab.locator("#public-form-submit-label").fill("Go");
  await expect(preview.locator("#public-form-submit")).toHaveText("Go");

  await expect(preview.locator("#public-form-consent")).toHaveCount(0);
  await tab.locator("#public-form-consent-add").click();
  await expect(preview.locator("#public-form-consent")).toBeVisible();
  await expect(preview).toContainText(builder.consentDefault);
  await tab.locator("#public-form-privacy-url").fill("https://example.com/privacy");

  await tab.locator("#public-form-success-message").fill("We will call you back.");
  await expect(dialog.locator("#public-form-preview-tab-done")).toHaveText(builder.sectionPreviewDone);
  await dialog.locator("#public-form-preview-tab-done").click();
  await expect(dialog.locator("#public-form-preview #public-form-sent-message")).toHaveText("We will call you back.");
  await dialog.locator("#public-form-preview-tab-form").click();
  await expect(preview.locator("#public-form-title")).toHaveText("Talk to us");

  const chain = tab.locator("#public-form-section-after-submit");
  await expect(chain.getByRole("heading", { name: afterSubmit.title })).toBeVisible();
  await expect(chain.locator("#public-form-after-submit-chain")).toContainText(
    afterSubmit.createRecord.split("{list}")[0].trim(),
  );
  await expect(chain.locator("#public-form-add-automation")).toHaveAttribute(
    "href",
    new RegExp(`/automations\\?new=formSubmitted&typeId=${typeId}$`, "u"),
  );

  await dialog.locator("#share-view-tab-share").click();
  const discard = page.getByRole("alertdialog");
  await expect(discard).toBeVisible();
  await expect(discard).toContainText(englishMessages.Common.navigationGuard.message);
  await discard.locator("#discard-changes-cancel").click();
  await expect(discard).toHaveCount(0);
  await expect(tab).toBeVisible();
  await expect(tab.locator("#public-form-title-input")).toHaveValue("Talk to us");

  await dialog.locator("#public-form-save").click();
  await expect(page.locator("[data-sonner-toast]")).toContainText(builder.saved);
  await expect(dialog.locator("#public-form-link")).toHaveAttribute("data-value", /\/f\/[0-9a-f]{64}$/u);
  await expect(dialog.locator("#public-form-turn-off")).toHaveCount(0);
  await expect(dialog.locator("#public-form-add-automation")).toHaveAttribute(
    "href",
    new RegExp(`sourceId=[0-9a-f-]{36}$`, "u"),
  );

  await dialog.locator("#share-view-tab-share").click();
  await expect(page.locator("[role='alertdialog']")).toHaveCount(0);
  await expect(dialog.locator("#share-view-link")).toBeVisible();

  expect(errors).toEqual([]);
});

test("says that the list gained a required field, asks before that change or an incomplete edit is dropped and applies it on save", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const typeId = presetId(companyId, "organization");
  const storedFieldIds = async () =>
    (
      await database.query<{ config: { fields: Array<{ fieldId: string }> } }>(
        'SELECT config FROM "PublicForm" WHERE "companyId"=$1 AND "typeId"=$2',
        [companyId, typeId],
      )
    ).rows[0]?.config.fields.map((field) => field.fieldId);

  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await createView(page, "Intake");
  const openFormTab = async () => {
    const dialog = await openShareDialog(page);
    await dialog.locator("#share-view-tab-form").click();
    await expect(dialog.locator("#public-form-tab #public-form-title-input")).toBeVisible();
    return dialog;
  };

  // A saved form that fits its list shows no notice.
  let dialog = await openFormTab();
  let tab = dialog.locator("#public-form-tab");
  await tab.locator("#public-form-title-input").fill("Talk to us");
  await dialog.locator("#public-form-save").click();
  await expect(page.locator("[data-sonner-toast]")).toContainText(builder.saved);
  await expect(dialog.locator("#public-form-link")).toHaveAttribute("data-value", /\/f\/[0-9a-f]{64}$/u);
  await expect(tab.locator("#public-form-repairs")).toHaveCount(0);

  // An incomplete edit cannot be saved, but leaving the tab still asks first.
  await tab.locator("#public-form-title-input").fill("");
  await dialog.locator("#public-form-save").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: builder.incomplete })).toBeVisible();
  await dialog.locator("#share-view-tab-share").click();
  const discard = page.getByRole("alertdialog");
  await expect(discard).toContainText(englishMessages.Common.navigationGuard.message);
  await discard.locator("#discard-changes-cancel").click();
  await expect(discard).toHaveCount(0);
  await expect(tab.locator("#public-form-title-input")).toHaveValue("");
  await dialog.locator("#share-view-tab-share").click();
  await page.getByRole("alertdialog").locator("#discard-changes").click();
  await expect(dialog.locator("#share-view-link")).toBeVisible();
  await dialog.locator("#share-view-tab-form").click();
  await expect(tab.locator("#public-form-title-input")).toHaveValue("Talk to us");

  // The list gains a required field without a default value after the form was saved.
  const budgetCode = randomUUID();
  await requireNewTextField(page, database, companyId, {
    id: budgetCode,
    typeId,
    label: "Budget code",
    multiple: false,
    position: 100,
  });
  expect(await storedFieldIds()).not.toContain(budgetCode);

  await page.reload();
  dialog = await openFormTab();
  tab = dialog.locator("#public-form-tab");
  const notice = tab.locator("#public-form-repairs");
  await expect(notice).toContainText(builder.repairsAdded.replace("{fields}", "Budget code"));
  await expect(notice).toContainText(builder.repairsSave);
  await expect(dialog.locator(`#public-form-preview [data-field-id="${budgetCode}"]`)).toBeVisible();

  // The added question is an unsaved change: leaving asks first, and Cancel keeps it.
  await dialog.locator("#share-view-tab-share").click();
  await expect(page.getByRole("alertdialog")).toContainText(englishMessages.Common.navigationGuard.message);
  await page.getByRole("alertdialog").locator("#discard-changes-cancel").click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(notice).toBeVisible();
  expect(await storedFieldIds()).not.toContain(budgetCode);

  await dialog.locator("#public-form-save").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: builder.saved }).last()).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expect.poll(storedFieldIds).toContain(budgetCode);

  await dialog.locator("#share-view-tab-share").click();
  await expect(page.locator("[role='alertdialog']")).toHaveCount(0);
  await expect(dialog.locator("#share-view-link")).toBeVisible();

  expect(errors).toEqual([]);
});

test("switches a form off although its list now requires a field no form can ask for, and lists a duplicate submission with its answers", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const typeId = presetId(companyId, "organization");
  const storedForm = async () =>
    (
      await database.query<{ id: string; enabled: boolean }>(
        'SELECT id, enabled FROM "PublicForm" WHERE "companyId"=$1 AND "typeId"=$2',
        [companyId, typeId],
      )
    ).rows[0];

  await page.goto(companyPath(companyId, `/records/${typeId}`));
  await createView(page, "Intake");
  const openFormTab = async () => {
    const dialog = await openShareDialog(page);
    await dialog.locator("#share-view-tab-form").click();
    await expect(dialog.locator("#public-form-tab #public-form-title-input")).toBeVisible();
    return dialog;
  };

  let dialog = await openFormTab();
  await dialog.locator("#public-form-tab #public-form-title-input").fill("Talk to us");
  await dialog.locator("#public-form-save").click();
  await expect(page.locator("[data-sonner-toast]")).toContainText(builder.saved);
  await expect.poll(async () => (await storedForm())?.enabled).toBe(true);
  const form = await storedForm();

  // The list gains a required field that a form cannot ask for: several text values, no default value.
  await requireNewTextField(page, database, companyId, {
    id: randomUUID(),
    typeId,
    label: "Contract files",
    multiple: true,
    position: 101,
  });

  // Someone whose email address already has a record sent the form again; the answers are kept on the submission.
  const existing = (
    await database.query<{ id: string }>('SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 LIMIT 1', [
      companyId,
      typeId,
    ])
  ).rows[0];
  await database.query(
    'INSERT INTO "PublicFormSubmission" (id, "companyId", "formId", outcome, "recordId", answers) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
    [
      randomUUID(),
      companyId,
      form.id,
      "duplicate",
      existing?.id ?? null,
      JSON.stringify([
        { fieldId: null, label: "Email", value: "ada@example.com" },
        { fieldId: null, label: "Message", value: "Please call me back" },
      ]),
    ],
  );

  await page.reload();
  dialog = await openFormTab();
  const tab = dialog.locator("#public-form-tab");
  await expect(tab.locator("#public-form-blocking-fields")).toContainText("Contract files");

  // The duplicate shows with its answers and, when the record still exists, a link to it.
  const duplicates = tab.locator("#public-form-duplicates");
  await expect(duplicates).toContainText(builder.duplicatesTitle);
  const row = duplicates.locator("[data-form-duplicate]").first();
  await expect(row).toContainText("ada@example.com");
  await expect(row).toContainText("Please call me back");
  if (existing)
    await expect(row.getByRole("link", { name: builder.duplicateOpenRecord })).toHaveAttribute(
      "href",
      new RegExp(`/records/${typeId}/${existing.id}$`, "u"),
    );

  // Switching off is saved although the form could not be saved as a live form any more.
  await tab.locator("#public-form-enabled").click();
  await dialog.locator("#public-form-save").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: builder.saved }).last()).toBeVisible();
  await expect.poll(async () => (await storedForm())?.enabled).toBe(false);

  expect(errors).toEqual([]);
});
