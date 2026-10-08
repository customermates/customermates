import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export async function openFilterPalette(page: Page, anchor: string) {
  await page.locator(`#${anchor}`).click();
  await expect(page.locator("#filter-palette-search")).toBeVisible();
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
  await page.keyboard.press("Escape");
  await expect(page.locator("#filter-palette-search")).toHaveCount(0);
}
export async function expectPaletteText(page: Page, anchor: string, field: string, value: string) {
  await openFilterPalette(page, anchor);
  await pickPaletteField(page, field);
  await expect(page.locator('[id="draft.value"]')).toHaveValue(value);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("#filter-palette-search")).toHaveCount(0);
}
export async function choosePaletteValue(page: Page, anchor: string, field: string, label: string) {
  await openFilterPalette(page, anchor);
  await pickPaletteField(page, field);
  await page.locator("#filter-palette-search").getByRole("combobox").fill(label);
  await page.getByRole("option").getByText(label, { exact: true }).click();
  await page.locator("#filter-palette-back").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#filter-palette-search")).toHaveCount(0);
}
