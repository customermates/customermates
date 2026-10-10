import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";
import { openFilterPalette } from "./filter-palette";

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

  await expect(dialog.locator("#widget-gallery-heading")).toHaveCount(0);
  await expect(dialog.locator("section").first().locator("h3")).toHaveText(
    englishMessages.Dashboard.widgetEditor.kind.scratchTitle,
  );
  const starter = dialog.locator("#widget-starter-number");
  await expect(starter).toContainText(englishMessages.Dashboard.widgetEditor.starters.number.title);
  await expect(starter).toContainText(englishMessages.Dashboard.widgetEditor.starters.number.description);
  await expect(dialog.locator('[id^="widget-starter-"]')).toHaveCount(8);
  await expect(dialog.locator('[id$="WithLabels"]')).toHaveCount(0);
  const cards = dialog.locator('[data-slot="widget-chooser-card"]');
  const heights = await cards.evaluateAll((elements) =>
    elements.map((element) => element.querySelector<HTMLElement>("span")?.offsetHeight),
  );
  expect(new Set(heights).size).toBe(1);

  await starter.click();
  const preview = dialog.locator('[data-slot="widget-preview"]');
  await expect(preview.locator('[data-slot="widget-number"]')).toBeVisible();
  await expect(preview.locator('[data-preview-current="true"]')).toBeVisible();
  const size = await preview.boundingBox();
  const real = await preview.evaluate((element) => [
    Number(element.getAttribute("data-preview-width")),
    Number(element.getAttribute("data-preview-height")),
  ]);
  expect(real[1]).toBe(2 * 124 + 16);
  expect(size && Math.abs(size.height - (real[1] * size.width) / real[0])).toBeLessThan(2);
  expect(size && Math.abs(size.width - real[0])).toBeLessThan(2);
  expect(size && size.height).toBeLessThan((page.viewportSize()?.height ?? 0) * 0.8);

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

for (const action of ["outside", "save", "cancel"] as const) {
  test(`pending scalar array token: ${action}`, async ({ page, database, companyId, isMobile }) => {
    test.skip(isMobile, "Outside parent actions are available with the desktop palette popover");
    const name = `Pending array ${action}`;
    const filter = {
      fieldId: presetId(companyId, "deal.totalQuantity"),
      operator: "notIn",
      value: null,
      values: [{ kind: "decimal", value: "10", currency: null }],
    };
    const measure = {
      source: {
        typeId: presetId(companyId, "deal"),
        filters: [filter],
        relationships: [],
      },
      aggregation: "count",
      valueFieldId: null,
      groupBy: { path: [], fieldId: null },
      groupLimit: 100,
    };
    const response = await page.request.post("/api/v1/widgets/save", {
      data: {
        expectedRevision: await revision(page),
        idempotencyKey: randomUUID(),
        name,
        measure,
        displayOptions: { displayType: "verticalBarChart" },
        isTemplate: false,
      },
    });
    expect(response.status(), await response.text()).toBe(200);
    await page.goto("/en/dashboard");
    await page.getByRole("heading", { name, exact: true }).click();
    await page.locator("#name").fill(name + " changed");
    await page.locator("#widget-config-filters").click();
    await openFilterPalette(page, "widget-source-filters");
    await page.locator('[data-filter-index="0"]').click();
    await page.locator('[id="draft.value"]').fill("25.5");
    if (action === "outside") {
      await page.locator("#name").click();
      await page.locator("#widget-modal-save").click();
    }
    if (action === "save") await page.locator("#widget-modal-save").click();
    if (action === "cancel") {
      await page.locator("#widget-modal-cancel").click();
      await page.locator("#discard-changes").click();
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const rows = (await database.query('SELECT name, measure FROM "Widget" WHERE "companyId"=$1', [companyId])).rows;
    const saved = rows.find((row) => row.name.startsWith(name));
    expect(saved.name).toBe(action === "cancel" ? name : name + " changed");
    expect(saved.measure.source.filters[0].values).toEqual(
      action === "cancel" ? filter.values : [...filter.values, { kind: "decimal", value: "25.5", currency: null }],
    );
  });
}

for (const valueKind of ["decimal", "dateTime"] as const) {
  for (const action of ["outside", "save", "cancel"] as const) {
    test(`rejects pending ${valueKind} token on ${action} and applies a complete corrected array`, async ({
      page,
      database,
      companyId,
      isMobile,
    }) => {
      test.skip(isMobile, "Outside parent actions are available with the desktop palette popover");
      const name = `Rejected array ${valueKind} ${action}`;
      const initial =
        valueKind === "decimal"
          ? { kind: "decimal", value: "10", currency: null }
          : { kind: "dateTime", value: "2026-01-01T00:00:00Z" };
      const corrected =
        valueKind === "decimal"
          ? { kind: "decimal", value: "25.5", currency: null }
          : { kind: "dateTime", value: "2026-02-01T00:00:00Z" };
      const filter = {
        fieldId: valueKind === "decimal" ? presetId(companyId, "deal.totalQuantity") : "system:createdAt",
        operator: "in",
        value: null,
        values: [initial],
      };
      const measure = {
        source: {
          typeId: presetId(companyId, "deal"),
          filters: [filter],
          relationships: [],
        },
        aggregation: "count",
        valueFieldId: null,
        groupBy: { path: [], fieldId: null },
        groupLimit: 100,
      };
      const response = await page.request.post("/api/v1/widgets/save", {
        data: {
          expectedRevision: await revision(page),
          idempotencyKey: randomUUID(),
          name,
          measure,
          displayOptions: { displayType: "verticalBarChart" },
          isTemplate: false,
        },
      });
      expect(response.status(), await response.text()).toBe(200);
      await page.goto("/en/dashboard");
      await page.getByRole("heading", { name, exact: true }).click();
      await page.locator("#name").fill(name + " changed");
      await page.locator("#widget-config-filters").click();
      await openFilterPalette(page, "widget-source-filters");
      await page.locator('[data-filter-index="0"]').click();
      await page.locator('[id="draft.value"]').fill(valueKind === "decimal" ? "not-a-number" : "2026-02-30T00:00:00Z");
      if (action === "outside") await page.locator("#name").click();
      if (action === "cancel") {
        await page.locator("#widget-modal-cancel").click();
        await page.locator("#discard-changes").click();
      } else await page.locator("#widget-modal-save").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText(
        englishMessages.Common.errors.invalidFilterValue,
      );
      const savedName = action === "cancel" ? name : name + " changed";
      const query = async (widgetName: string) =>
        (await database.query('SELECT measure FROM "Widget" WHERE "companyId"=$1 AND name=$2', [companyId, widgetName]))
          .rows[0].measure;
      expect((await query(savedName)).source.filters[0].values).toEqual([initial]);
      await page.getByRole("heading", { name: savedName, exact: true }).click();
      await page.locator("#name").fill(name + " corrected");
      await page.locator("#widget-config-filters").click();
      await openFilterPalette(page, "widget-source-filters");
      await page.locator('[data-filter-index="0"]').click();
      await page.locator('[id="draft.value"]').fill(corrected.value);
      if (action === "outside") await page.locator("#name").click();
      await page.locator("#widget-modal-save").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect((await query(name + " corrected")).source.filters[0].values).toEqual([initial, corrected]);
    });
  }
}
