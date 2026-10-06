import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { GRID_BREAKPOINTS, GRID_COLS } from "../../app/[locale]/(protected)/dashboard/components/grid.constants";
import { DisplayType } from "../../features/widget/widget-display.schema";
import { widgetDisplayRequirement } from "../../features/widget/widget-display-rules";
import { presetId } from "../../features/records/crm-preset";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

test("persists every chart style, appearance, a copied template, resizing and deletion through the unified builder", async ({
  page,
  database,
  companyId,
  isMobile,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const dialog = page.getByRole("dialog");
  await page.goto(`/en/records/${presetId(companyId, "service")}`);
  for (const [name, price] of [
    ["First category", "5"],
    ["Second category", "8"],
  ]) {
    await page.locator("#records-add").click();
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
    await dialog.getByRole("textbox", { name: "Price", exact: false }).fill(price);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();
  await dialog.locator("#widget-kind-chart").click();
  await dialog.getByRole("button", { name: englishMessages.Common.actions.back, exact: true }).click();
  await expect(dialog.locator("#widget-modal-kind")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveCount(0);
  await expect(dialog.locator("#widget-kind-chart")).toBeFocused();
  expect(
    (await database.query('SELECT COUNT(*)::integer AS count FROM "Widget" WHERE "companyId"=$1', [companyId])).rows,
  ).toEqual([{ count: 0 }]);
  await dialog.locator("#widget-kind-chart").click();
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Complete chart controls");
  await dialog.getByRole("combobox", { name: "Records from", exact: true }).click();
  await page.getByRole("option", { name: "Services", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Group by", exact: true }).click();
  await page.getByRole("option", { name: "Each record", exact: true }).click();
  await dialog.getByRole("switch", { name: "Share as a template", exact: true }).check();
  await dialog.getByRole("switch", { name: "Show metric and filters", exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Preview measure", exact: true }).click();
  await expect(dialog.locator("svg.recharts-surface")).toBeVisible();
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).not.toBeVisible();
  const read = async (name: string) =>
    (
      await database.query(
        'SELECT id,version,"displayOptions",layout,"isTemplate",measure FROM "Widget" WHERE "companyId"=$1 AND name=$2',
        [companyId, name],
      )
    ).rows;
  const saved = (await read("Complete chart controls"))[0];
  expect(saved.isTemplate).toBe(true);
  expect(saved.displayOptions.showFilters).toBe(false);
  const edit = async (name: string) => {
    const opener = page.getByRole("button", { name: `Edit ${name}`, exact: true });
    await opener.focus();
    await opener.press("Enter");
    await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveValue(name);
  };
  for (const displayType of Object.values(DisplayType).filter((type) => widgetDisplayRequirement(type) === null)) {
    await test.step(`save and reload ${displayType}`, async () => {
      await edit("Complete chart controls");
      await dialog.locator(`[id="display-type-${displayType}"]`).check();
      if (displayType === DisplayType.doughnutChart)
        await dialog.getByRole("switch", { name: "Show legend", exact: true }).uncheck();
      if (![DisplayType.doughnutChart, DisplayType.radarChart].includes(displayType)) {
        await dialog.getByRole("switch", { name: "Reverse X-axis", exact: true }).check();
        await dialog.getByRole("switch", { name: "Reverse Y-axis", exact: true }).check();
      }
      await dialog.getByRole("button", { name: "Colors", exact: true }).click();
      const secondColor = page.getByRole("menuitemcheckbox", { name: "Color 2", exact: true });
      if ((await secondColor.getAttribute("aria-checked")) !== "true") await secondColor.click();
      const firstColor = page.getByRole("menuitemcheckbox", { name: "Color 4", exact: true });
      if ((await firstColor.getAttribute("aria-checked")) === "true") await firstColor.click();
      await page.keyboard.press("Escape");
      const save = dialog.getByRole("button", { name: "Save changes", exact: true });
      if (await save.isEnabled()) {
        await save.click();
        await expect(dialog).not.toBeVisible();
      } else await page.keyboard.press("Escape");

      const options = (await read("Complete chart controls"))[0].displayOptions;
      expect(options.displayType).toBe(displayType);
      expect(options.barColors).toContain("default2");
      expect(options.barColors).not.toContain("primary1");
      if (displayType === DisplayType.doughnutChart) expect(options.showLegend).toBe(false);
      await page.reload();
      const chart = page
        .locator('[data-uid="app-card"]')
        .filter({ has: page.getByRole("heading", { name: "Complete chart controls", exact: true }) });
      await expect(chart.locator("svg.recharts-surface")).toBeVisible();
      await expect(chart).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`chart-${displayType}.png`), animations: "disabled" });
    });
  }
  if (!isMobile) {
    const gridItem = page
      .locator(".react-grid-item")
      .filter({ has: page.getByRole("heading", { name: "Complete chart controls", exact: true }) });
    const grid = page.locator(".react-grid-layout");
    const gridBounds = await grid.boundingBox();
    const titleBounds = await gridItem
      .getByRole("heading", { name: "Complete chart controls", exact: true })
      .boundingBox();
    if (!gridBounds || !titleBounds) throw new Error("The desktop widget drag surface is missing");
    const breakpoint =
      gridBounds.width >= GRID_BREAKPOINTS.lg
        ? "lg"
        : gridBounds.width >= GRID_BREAKPOINTS.md
          ? "md"
          : gridBounds.width >= GRID_BREAKPOINTS.sm
            ? "sm"
            : "xs";
    const beforeMove = (await read("Complete chart controls"))[0];
    const step = (gridBounds.width + 16) / GRID_COLS[breakpoint];
    const initialBounds = await gridItem.boundingBox();
    if (!initialBounds) throw new Error("The widget has no rendered geometry");
    const position = beforeMove.layout?.[breakpoint] ?? {
      x: Math.round((initialBounds.x - gridBounds.x) / step),
      y: Math.round((initialBounds.y - gridBounds.y) / 140),
      w: Math.round((initialBounds.width + 16) / step),
      h: Math.round((initialBounds.height + 16) / 140),
    };
    const direction = position.x + position.w < GRID_COLS[breakpoint] ? 1 : -1;
    const start = { x: titleBounds.x + titleBounds.width / 2, y: titleBounds.y + titleBounds.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + direction * step, start.y, { steps: 10 });
    await expect(gridItem).toHaveClass(/\breact-draggable-dragging\b/);
    await page.mouse.up();
    await expect(gridItem).not.toHaveClass(/\breact-draggable-dragging\b/);
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => (await read("Complete chart controls"))[0].layout?.[breakpoint]?.x)
      .toBe(position.x + direction);
    const moved = (await read("Complete chart controls"))[0];
    expect(moved.layout[breakpoint]).toMatchObject({ y: position.y, w: position.w, h: position.h });
    expect(moved.version).toBeGreaterThan(beforeMove.version);
    await expect
      .poll(async () => (await gridItem.boundingBox())?.x)
      .toBeCloseTo(gridBounds.x + (position.x + direction) * step, 0);
    const movedBounds = await gridItem.boundingBox();
    if (!movedBounds) throw new Error("The moved widget is not visible");
    await page.reload();
    await expect(gridItem).toBeVisible();
    await expect.poll(async () => (await gridItem.boundingBox())?.x).toBeCloseTo(movedBounds.x, 0);
    expect((await read("Complete chart controls"))[0].layout).toEqual(moved.layout);
    await page.screenshot({ path: testInfo.outputPath("widget-moved.png"), animations: "disabled" });
    const handle = gridItem.locator(".react-resizable-handle-se");
    const before = JSON.stringify((await read("Complete chart controls"))[0].layout);
    const bounds = await handle.boundingBox();
    if (!bounds) throw new Error("The desktop resize handle is missing");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 140, bounds.y + bounds.height / 2, { steps: 10 });
    await expect(gridItem).toHaveClass(/\bresizing\b/);
    await page.mouse.up();
    await expect(gridItem).not.toHaveClass(/\bresizing\b/);
    await expect.poll(async () => JSON.stringify((await read("Complete chart controls"))[0].layout)).not.toBe(before);
    const after = (await read("Complete chart controls"))[0].layout;
    await page.reload();
    expect((await read("Complete chart controls"))[0].layout).toEqual(after);
  }
  await page.locator("#dashboard-add-widget").click();
  await dialog.locator(`#widget-template-${saved.id}`).click();
  await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Complete chart controls");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Independent copied chart");
  await dialog.getByRole("switch", { name: "Share as a template", exact: true }).uncheck();
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).not.toBeVisible();
  const copied = (await read("Independent copied chart"))[0];
  expect(copied.id).not.toBe(saved.id);
  expect(copied.measure).toEqual(saved.measure);
  expect(copied.isTemplate).toBe(false);
  await edit("Independent copied chart");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Edited copied chart");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await read("Complete chart controls")).toHaveLength(1);
  await edit("Edited copied chart");
  await dialog.getByRole("button", { name: "Delete widget Edited copied chart", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  const beforeCancel = await read("Edited copied chart");
  const originalBeforeCancel = await read("Complete chart controls");
  await confirmation.locator("#confirm-delete-cancel").click();
  await expect(confirmation).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Edited copied chart");
  expect(await read("Edited copied chart")).toEqual(beforeCancel);
  expect(await read("Complete chart controls")).toEqual(originalBeforeCancel);
  await dialog.getByRole("button", { name: "Delete widget Edited copied chart", exact: true }).click();
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(dialog).not.toBeVisible();
  expect(await read("Edited copied chart")).toEqual([]);
  expect(await read("Complete chart controls")).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Complete chart controls", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edited copied chart", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("preserves widget previews and accessible draft confirmations across responsive breakpoint changes", async ({
  page,
  database,
  companyId,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`/en/records/${presetId(companyId, "service")}`);
  await page.locator("#records-add").click();
  const recordDrawer = page.getByRole("dialog");
  await recordDrawer.getByRole("textbox", { name: "Name", exact: false }).fill("Responsive preview source");
  await recordDrawer.getByRole("textbox", { name: "Price", exact: false }).fill("5");
  await recordDrawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(recordDrawer).toHaveCount(0);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  const preview = page.locator('[data-widget-editor="split"] svg.recharts-surface');
  const guard = page.getByRole("alertdialog", { name: "Unsaved Changes", exact: true });
  for (const [initialWidth, changedWidth, surface] of [
    [1100, 600, "dialog"],
    [600, 1100, "drawer"],
  ] as const) {
    await page.setViewportSize({ width: initialWidth, height: 900 });
    await page.locator("#dashboard-add-widget").click();
    const widget = page.getByRole("dialog", { name: "Add widget", exact: true });
    await page.getByRole("dialog").locator("#widget-kind-chart").click();
    await expect(widget).toHaveAttribute("data-overlay-surface", surface);
    await widget.getByRole("textbox", { name: "Name", exact: true }).fill("Keep this responsive widget draft");
    await widget.getByRole("combobox", { name: "Records from", exact: true }).click();
    await page.getByRole("option", { name: "Services", exact: true }).click();
    await widget.getByRole("button", { name: "Preview measure", exact: true }).click();
    await expect(preview).toBeVisible();
    await widget.getByRole("button", { name: "Close", exact: true }).click();
    await expect(guard).toBeVisible();
    await page.setViewportSize({ width: changedWidth, height: 900 });
    await expect(guard).toBeVisible();
    await expect(page.locator('[role="alertdialog"]')).not.toHaveAttribute("aria-hidden", "true");
    await expect(preview).toHaveCount(1);
    await guard.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(guard).toHaveCount(0);
    await expect(widget).toHaveAttribute("data-overlay-surface", surface);
    await expect(widget.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(
      "Keep this responsive widget draft",
    );
    await expect(preview).toBeVisible();
    await widget.getByRole("button", { name: "Close", exact: true }).click();
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(guard).toHaveCount(0);
    await expect(widget).toHaveCount(0);
    expect(
      (await database.query('SELECT COUNT(*)::integer AS count FROM "Widget" WHERE "companyId"=$1', [companyId])).rows,
    ).toEqual([{ count: 0 }]);
  }
  if (originalViewport) await page.setViewportSize(originalViewport);
  expect(errors).toEqual([]);
});
