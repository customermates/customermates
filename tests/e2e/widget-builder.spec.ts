import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { expect, test, collectPageErrors } from "./fixtures";
import { openFilterPalette } from "./filter-palette";

async function revision(page: Page) {
  const response = await page.request.post("/api/v1/model/read", {
    data: {},
  });
  expect(response.status()).toBe(200);
  return RecordModelSchema.parse(await response.json()).revision;
}

async function editWidgetName(page: Page, value: string) {
  const name = page.locator("#name");
  await name.fill("");
  await name.pressSequentially(value);
  await expect(name).toHaveValue(value);
  await expect(page.locator("#widget-modal-save")).toBeEnabled();
}

async function openWidgetForEdit(page: Page, name: string, id: string) {
  const widgetLoaded = page.waitForResponse(
    (response) =>
      response.url().includes("/en/dashboard") &&
      response.request().method() === "POST" &&
      Boolean(response.request().postData()?.includes(id)),
  );
  await page.getByRole("heading", { name, exact: true }).click();
  await widgetLoaded;
  await expect(page.locator("#name")).toBeEnabled();
  await expect(page.locator("#name")).toHaveValue(name);
}

test("starts from a recommended starter, previews it live at dashboard size and arranges widgets through the API", async ({
  page,
  database,
  companyId,
  isMobile,
}) => {
  test.skip(isMobile, "Grid positions are asserted on the desktop grid");
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const dialog = page.getByRole("dialog");
  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();

  await expect(dialog.locator("#widget-gallery-heading")).toHaveCount(0);
  await expect(dialog.locator("section").first().locator("h3")).toHaveText(
    englishMessages.Dashboard.widgetEditor.kind.scratchTitle,
  );
  const starter = dialog.locator("#widget-starter-number");
  await expect(starter).toContainText(
    englishMessages.Dashboard.widgetEditor.starters.number.title,
  );
  await expect(starter).toContainText(
    englishMessages.Dashboard.widgetEditor.starters.number.description,
  );
  await expect(dialog.locator('[id^="widget-starter-"]')).toHaveCount(8);
  await expect(dialog.locator('[id$="WithLabels"]')).toHaveCount(0);
  const cards = dialog.locator('[data-slot="widget-chooser-card"]');
  const heights = await cards.evaluateAll((elements) =>
    elements.map(
      (element) => element.querySelector<HTMLElement>("span")?.offsetHeight,
    ),
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
  expect(real[1]).toBe(2 * 54 + 12);
  expect(
    size && Math.abs(size.height - (real[1] * size.width) / real[0]),
  ).toBeLessThan(2);
  expect(size && Math.abs(size.width - real[0])).toBeLessThan(2);
  expect(size && size.height).toBeLessThan(
    (page.viewportSize()?.height ?? 0) * 0.8,
  );

  await dialog
    .getByRole("textbox", { name: "Name", exact: false })
    .fill("Open value overview");
  await expect(
    preview.getByRole("heading", { name: "Open value overview", exact: true }),
  ).toBeVisible();
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).toHaveCount(0);
  const saved = await database.query(
    'SELECT layout FROM "Widget" WHERE "companyId"=$1 AND name=$2',
    [companyId, "Open value overview"],
  );
  expect(saved.rows[0]?.layout?.lg).toMatchObject({ x: 0, y: 0, w: 3, h: 2 });

  const measure = {
    source: {
      typeId: presetId(companyId, "deal"),
      filters: [],
      relationships: [],
    },
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
  const tooShort = await create("Too short", { x: 6, y: 0, w: 6, h: 1 });
  expect(tooShort.status()).toBe(400);
  const placed = await create("Placed by the API", { x: 6, y: 0, w: 6, h: 2 });
  expect(placed.status(), await placed.text()).toBe(200);
  expect((await placed.json()).layout.lg).toMatchObject({
    x: 6,
    y: 0,
    w: 6,
    h: 2,
  });
  const overlapping = await create("Overlapping", { x: 2, y: 0, w: 6, h: 2 });
  expect(overlapping.status()).toBe(400);
  expect(await overlapping.text()).toContain(
    englishMessages.Common.errors.widgetLayoutOverlap,
  );

  await page.reload();
  const first = page
    .locator(".react-grid-item")
    .filter({ hasText: "Open value overview" });
  const second = page
    .locator(".react-grid-item")
    .filter({ hasText: "Placed by the API" });
  await expect(second).toBeVisible();
  await expect
    .poll(async () => {
      const [left, right] = [
        await first.boundingBox(),
        await second.boundingBox(),
      ];
      return {
        sameRow: Boolean(left && right && Math.abs(left.y - right.y) < 2),
        separated: Boolean(left && right && right.x > left.x + left.width),
        wider: Boolean(left && right && right.width > left.width * 1.8),
      };
    })
    .toEqual({ sameRow: true, separated: true, wider: true });
  expect(errors).toEqual([]);
});

for (const action of ["outside", "save", "cancel"] as const) {
  test(`pending scalar array token: ${action}`, async ({
    page,
    database,
    companyId,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Outside parent actions are available with the desktop palette popover",
    );
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
    const widget = await response.json();
    expect(response.status(), JSON.stringify(widget)).toBe(200);
    expect(widget.id).toEqual(expect.any(String));
    await page.goto("/en/dashboard");
    await openWidgetForEdit(page, name, widget.id);
    await editWidgetName(page, name + " changed");
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
    const rows = (
      await database.query(
        'SELECT name, measure FROM "Widget" WHERE "companyId"=$1',
        [companyId],
      )
    ).rows;
    const saved = rows.find((row) => row.name.startsWith(name));
    expect(saved.name).toBe(action === "cancel" ? name : name + " changed");
    expect(saved.measure.source.filters[0].values).toEqual(
      action === "cancel"
        ? filter.values
        : [
            ...filter.values,
            { kind: "decimal", value: "25.5", currency: null },
          ],
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
      test.skip(
        isMobile,
        "Outside parent actions are available with the desktop palette popover",
      );
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
        fieldId:
          valueKind === "decimal"
            ? presetId(companyId, "deal.totalQuantity")
            : "system:createdAt",
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
      const widget = await response.json();
      expect(response.status(), JSON.stringify(widget)).toBe(200);
      expect(widget.id).toEqual(expect.any(String));
      await page.goto("/en/dashboard");
      await openWidgetForEdit(page, name, widget.id);
      await editWidgetName(page, name + " changed");
      await page.locator("#widget-config-filters").click();
      await openFilterPalette(page, "widget-source-filters");
      await page.locator('[data-filter-index="0"]').click();
      await page
        .locator('[id="draft.value"]')
        .fill(
          valueKind === "decimal" ? "not-a-number" : "2026-02-30T00:00:00Z",
        );
      await expect(page.locator("#name")).toHaveValue(name + " changed");
      if (action === "outside") await page.locator("#name").click();
      if (action === "cancel") {
        await page.locator("#widget-modal-cancel").click();
        await page.locator("#discard-changes").click();
      } else await page.locator("#widget-modal-save").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.locator('[data-sonner-toast][data-type="error"]'),
      ).toContainText(englishMessages.Common.errors.invalidFilterValue);
      const savedName = action === "cancel" ? name : name + " changed";
      const query = async (widgetName: string) =>
        (
          await database.query(
            'SELECT measure FROM "Widget" WHERE "companyId"=$1 AND name=$2',
            [companyId, widgetName],
          )
        ).rows[0].measure;
      expect((await query(savedName)).source.filters[0].values).toEqual([
        initial,
      ]);
      await openWidgetForEdit(page, savedName, widget.id);
      await editWidgetName(page, name + " corrected");
      await page.locator("#widget-config-filters").click();
      await openFilterPalette(page, "widget-source-filters");
      await page.locator('[data-filter-index="0"]').click();
      await page.locator('[id="draft.value"]').fill(corrected.value);
      await page.locator('[id="draft.value"]').press("Enter");
      await expect(page.locator('[id="draft.value"]')).toHaveValue("");
      await expect(
        page
          .locator('[data-slot="badge"]')
          .filter({ hasText: corrected.value }),
      ).toBeVisible();
      if (action === "outside") await page.locator("#name").click();
      await expect(page.locator("#name")).toHaveValue(name + " corrected");
      await expect(page.locator("#widget-modal-save")).toBeEnabled();
      await page.locator("#widget-modal-save").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(
        (await query(name + " corrected")).source.filters[0].values,
      ).toEqual([initial, corrected]);
    });
  }
}
