import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export async function openFilterPalette(page: Page, anchor: string) {
  const target = page.locator(`#${anchor}`);
  if ((await target.getAttribute("data-filter-inline")) === null) await target.click();
  await expect(page.locator("#filter-palette-search")).toBeVisible();
}
async function dismissPalette(page: Page, anchor: string) {
  if ((await page.locator(`#${anchor}`).getAttribute("data-filter-inline")) !== null) {
    await expect(page.locator(`#${anchor} [data-palette-field]`).first()).toBeVisible();
    return;
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#filter-palette-search")).toHaveCount(0);
}
export async function pickPaletteField(page: Page, field: string) {
  await page.locator(`[data-palette-field="${field}"]`).click();
}
export async function setPaletteText(page: Page, anchor: string, field: string, value: string, operator?: string) {
  await openFilterPalette(page, anchor);
  await pickPaletteField(page, field);
  if (operator) {
    await page.locator("[data-palette-operator-trigger]").click();
    await page.getByRole("menuitem", { name: operator, exact: true }).click();
  }
  await page.locator('[id="draft.value"]').fill(value);
  await page.locator('[id="draft.value"]').press("Enter");
  await dismissPalette(page, anchor);
}
export async function expectPaletteText(page: Page, anchor: string, field: string, value: string) {
  await openFilterPalette(page, anchor);
  await pickPaletteField(page, field);
  await expect(page.locator('[id="draft.value"]')).toHaveValue(value);
  await page.keyboard.press("Escape");
  await dismissPalette(page, anchor);
}
export async function choosePaletteValue(page: Page, anchor: string, field: string, label: string) {
  await openFilterPalette(page, anchor);
  await pickPaletteField(page, field);
  await page.locator("#filter-palette-search").getByRole("combobox").fill(label);
  await page.getByRole("option").getByText(label, { exact: true }).click();
  await page.locator("#filter-palette-back").click();
  // Escape before the palette is back on its field list can land on the closing value step (seen on Firefox).
  await expect(page.locator("[data-palette-field]").first()).toBeVisible();
  await dismissPalette(page, anchor);
}
export async function applyPaletteSearch(page: Page, anchor: string, text: string, label?: string) {
  await openFilterPalette(page, anchor);
  const input = page.locator("#filter-palette-search").getByRole("combobox");
  await expect(input).toBeFocused();
  await input.fill(text);
  await expect(page.locator("[data-palette-search]")).toContainText(label ? `${label} contains “${text}”` : `“${text}”`);
  await input.press("Enter");
  await expect(page.locator("#filter-palette-search")).toHaveCount(0);
}
export async function expectPaletteSearch(page: Page, anchor: string, text: string) {
  await openFilterPalette(page, anchor);
  await expect(page.locator("[data-palette-active-search]")).toContainText(`“${text}”`);
  await dismissPalette(page, anchor);
}
export async function clearPaletteSearch(page: Page, anchor: string) {
  await openFilterPalette(page, anchor);
  const chip = page.locator("[data-palette-active-search]");
  await chip.getByRole("button", { name: "Remove filter", exact: true }).click();
  await expect(chip).toHaveCount(0);
  await dismissPalette(page, anchor);
}
