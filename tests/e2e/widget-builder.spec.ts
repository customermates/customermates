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

test("starts from a recommended starter, previews it live at dashboard size and arranges widgets through the API", async ({
  page,
  database,
  companyId,
  isMobile,
}) => {
  test.skip(isMobile, "Grid positions are asserted on the desktop grid");
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const dialog = page.getByRole("dialog");
  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();

  await expect(dialog.locator("#widget-gallery-heading")).toHaveText(englishMessages.Dashboard.widgetGallery.title);
  await expect(dialog.locator("#widget-modal-kind-heading")).toHaveText(
    englishMessages.Dashboard.widgetEditor.kind.scratchTitle,
  );
  const starter = dialog.locator("#widget-gallery-openValueTotal");
  await expect(starter).toBeVisible();
  await expect(starter).toContainText("Deals");
  const cards = dialog.locator('[data-slot="widget-chooser-card"]');
  expect(await cards.count()).toBeGreaterThan(2);
  const heights = await cards.evaluateAll((elements) =>
    elements.map((element) => element.querySelector("span")?.getBoundingClientRect().height),
  );
  expect(new Set(heights).size).toBe(1);

  await starter.click();
  const name = await dialog.getByRole("textbox", { name: "Name", exact: false }).inputValue();
  expect(name.length).toBeGreaterThan(0);
  const preview = dialog.locator('[data-slot="widget-preview"]');
  await expect(preview.locator('[data-uid="app-card"]').getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(preview.locator('[data-slot="widget-number"]')).toBeVisible();
  await expect(preview.locator('[data-preview-current="true"]')).toBeVisible();
  const size = await preview.boundingBox();
  expect(size && size.height).toBe(2 * 124 + 16);

  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Open value overview");
  await expect(preview.getByRole("heading", { name: "Open value overview", exact: true })).toBeVisible();
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).toHaveCount(0);
  const saved = await database.query('SELECT layout FROM "Widget" WHERE "companyId"=$1 AND name=$2', [
    companyId,
    "Open value overview",
  ]);
  expect(saved.rows[0]?.layout?.lg).toMatchObject({ x: 0, y: 0, w: 3, h: 2 });

  const measure = {
    source: { typeId: presetId(companyId, "deal"), filters: [], relationships: [] },
    aggregation: "count",
    valueFieldId: null,
    groupBy: null,
    groupLimit: 100,
  };
  const create = (widgetName: string, layout: object) =>
    revision(page).then((expectedRevision) =>
      page.request.post("/api/v1/widgets/save", {
        data: {
          expectedRevision,
          idempotencyKey: randomUUID(),
          name: widgetName,
          isTemplate: false,
          measure,
          displayOptions: { displayType: "number" },
          layout,
        },
      }),
    );
  const placed = await create("Placed by the API", { x: 6, y: 0, w: 6, h: 2 });
  expect(placed.status(), await placed.text()).toBe(200);
  expect((await placed.json()).layout.lg).toMatchObject({ x: 6, y: 0, w: 6, h: 2 });
  const overlapping = await create("Overlapping", { x: 2, y: 0, w: 6, h: 2 });
  expect(overlapping.status()).toBe(400);
  expect(await overlapping.text()).toContain(englishMessages.Common.errors.widgetLayoutOverlap);

  await page.reload();
  const first = page.locator(".react-grid-item").filter({ hasText: "Open value overview" });
  const second = page.locator(".react-grid-item").filter({ hasText: "Placed by the API" });
  await expect(second).toBeVisible();
  const [left, right] = [await first.boundingBox(), await second.boundingBox()];
  expect(left && right).toBeTruthy();
  if (!left || !right) return;
  expect(Math.abs(left.y - right.y)).toBeLessThan(2);
  expect(right.x).toBeGreaterThan(left.x + left.width);
  expect(right.width).toBeGreaterThan(left.width * 1.8);
  expect(errors).toEqual([]);
});
