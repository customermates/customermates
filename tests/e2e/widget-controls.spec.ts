import { DisplayType } from "../../features/widget/widget-display.schema";
import { presetId } from "../../features/records/crm-preset";
import { expect, test } from "./fixtures";

test("persists every chart style, appearance, a copied template, resizing and deletion through the unified builder", async ({
  page,
  database,
  companyId,
  isMobile,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message !== "ResizeObserver loop completed with undelivered notifications.") errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
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
  for (const displayType of Object.values(DisplayType)) {
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
      } else {
        await page.keyboard.press("Escape");
      }
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
    const handle = gridItem.locator(".react-resizable-handle-se");
    const before = JSON.stringify((await read("Complete chart controls"))[0].layout);
    const bounds = await handle.boundingBox();
    if (!bounds) throw new Error("The desktop resize handle is missing");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 140, bounds.y + bounds.height / 2 + 140, { steps: 10 });
    await page.mouse.up();
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
