import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";

export function calculationFlow(page: Page) {
  return page.getByRole("dialog").locator("[data-calculation-flow]");
}

export function calculationChip(page: Page, kind: string) {
  return calculationFlow(page).locator(`[data-calculation-chip="${kind}"]`);
}

export async function chooseValueSource(page: Page, source: string) {
  await page.getByRole("dialog").getByRole("combobox", { name: "Value source", exact: true }).click();
  await page.getByRole("option", { name: source, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("combobox", { name: "Value source", exact: true })).toContainText(
    source,
  );
}

export async function pickOption(page: Page, chip: Locator, option: string) {
  await chip.click();
  await page.getByRole("option", { name: option, exact: true }).filter({ visible: true }).click();
}

export async function pickFixedValue(page: Page, chip: Locator, value: string) {
  await chip.click();
  await page.locator('[data-calculation-option="fixed-value"]').filter({ visible: true }).click();
  await page.locator('[id="calculation-fixed-value.value.value"]').fill(value);
  await page.getByRole("button", { name: "Use this value", exact: true }).click();
}
