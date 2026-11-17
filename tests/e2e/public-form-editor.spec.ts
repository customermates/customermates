import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { companyPath } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { createView, openShareDialog } from "./view-sharing-helpers";

const share = englishMessages.DataView.share;
const builder = englishMessages.PublicForm.builder;
const afterSubmit = englishMessages.PublicForm.afterSubmit;

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
