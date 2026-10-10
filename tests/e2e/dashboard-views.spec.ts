import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

async function revision(page: Page) {
  const response = await page.request.post("/api/v1/model/discover", { data: {} });
  expect(response.status()).toBe(200);
  return RecordModelSchema.parse(await response.json()).revision;
}

test("keeps separate widget sets per dashboard view and targets a view through the API", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const dialog = page.getByRole("dialog");
  const rail = page.locator("[data-joins-top-bar]");
  await page.goto("/en/dashboard");
  await expect(rail).toBeVisible();

  await rail.getByRole("button", { name: englishMessages.DataView.views.createTitle, exact: true }).click();
  await page.getByPlaceholder(englishMessages.DataView.views.namePlaceholder).fill("Site Berlin");
  await page.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=[0-9a-f-]{36}/);
  const viewId = new URL(page.url()).searchParams.get("view");
  expect(viewId).toBeTruthy();
  await expect(rail.getByText("Site Berlin", { exact: true })).toBeVisible();

  await page.locator("#dashboard-add-widget").click();
  await dialog.locator("#widget-starter-number").click();
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Berlin starter");
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).toHaveCount(0);
  const card = page.getByRole("heading", { name: "Berlin starter", exact: true });
  await expect(card).toBeVisible();
  const stored = await database.query('SELECT "viewId" FROM "Widget" WHERE "companyId"=$1 AND name=$2', [
    companyId,
    "Berlin starter",
  ]);
  expect(stored.rows).toEqual([{ viewId }]);

  await rail.getByText(englishMessages.Dashboard.mainView, { exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]view=/);
  await expect(card).toHaveCount(0);

  const save = (name: string, target: string | null) =>
    revision(page).then((expectedRevision) =>
      page.request.post("/api/v1/widgets/save", {
        data: {
          expectedRevision,
          idempotencyKey: randomUUID(),
          name,
          isTemplate: false,
          measure: {
            source: { typeId: presetId(companyId, "deal"), filters: [], relationships: [] },
            aggregation: "count",
            valueFieldId: null,
            groupBy: null,
            groupLimit: 100,
          },
          displayOptions: { displayType: "number" },
          viewId: target,
          layout: { x: 6, y: 0, w: 3, h: 2 },
        },
      }),
    );
  const placed = await save("Berlin via API", viewId);
  expect(placed.status(), await placed.text()).toBe(200);
  expect(await placed.json()).toMatchObject({ viewId, layout: { lg: { x: 6, y: 0, w: 3, h: 2 } } });
  const unknown = await save("Nowhere", randomUUID());
  expect(unknown.status()).toBe(404);
  expect(await unknown.text()).toContain(englishMessages.Common.errors.dataViewNotFound);

  await page.goto(`/en/dashboard?view=${viewId}`);
  await expect(page.getByRole("heading", { name: "Berlin via API", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Berlin starter", exact: true })).toBeVisible();

  await page.locator("#global-data-views-menu").click();
  await page.getByRole("menuitem", { name: englishMessages.DataView.views.delete, exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText('Delete "Site Berlin"? Its 2 widgets move to Trash with it:');
  await expect
    .poll(async () => (await confirm.locator("[data-delete-confirmation-details] li").allTextContents()).sort())
    .toEqual(["Berlin starter", "Berlin via API"]);
  await confirm.getByRole("button", { name: englishMessages.Common.actions.delete, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]view=/);
  await expect(rail.getByText("Site Berlin", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Berlin via API", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Berlin starter", exact: true })).toHaveCount(0);
  const kept = await database.query(
    'SELECT name, "viewId" FROM "Widget" WHERE "companyId"=$1 AND name = ANY($2) ORDER BY name',
    [companyId, ["Berlin starter", "Berlin via API"]],
  );
  expect(kept.rows).toEqual([
    { name: "Berlin starter", viewId },
    { name: "Berlin via API", viewId },
  ]);

  const toast = page.locator("[data-sonner-toast]").filter({ hasText: englishMessages.Trash.movedToTrash });
  await toast.getByRole("button", { name: englishMessages.Trash.undo, exact: true }).click();
  await expect(rail.getByText("Site Berlin", { exact: true })).toBeVisible();
  await rail.getByText("Site Berlin", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Berlin via API", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Berlin starter", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
