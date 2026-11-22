import type { Page } from "@playwright/test";

import { expect } from "./fixtures";

const addPalette = (page: Page) => page.getByRole("dialog", { name: "Create new…", exact: true });

/** Opens the sidebar's Add palette and picks "Add <type>". */
export async function addRecordFromPalette(page: Page, typeId: string) {
  await page.locator("#nav-add").click();
  await addPalette(page).locator(`[data-create-palette-template="${typeId}"]`).click();
}

/**
 * Opens the sidebar's Add palette and starts a blank list. Where Mate is available, Create list first offers the
 * template library and the blank list is the last row of that second palette; without Mate it opens the editor directly.
 */
export async function createBlankListFromPalette(page: Page) {
  await page.locator("#nav-add").click();
  await addPalette(page).locator("[data-create-palette-blank]").click();
  const libraryBlank = page
    .getByRole("dialog", { name: "Create list", exact: true })
    .locator("[data-create-palette-blank]");
  const name = page.getByRole("dialog").getByRole("textbox", { name: "Name", exact: false }).first();
  await expect(libraryBlank.or(name).first()).toBeVisible();
  if (await libraryBlank.isVisible()) await libraryBlank.click();
  await expect(name).toBeVisible();
}
