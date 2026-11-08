import type { Page } from "@playwright/test";

import { expect } from "./fixtures";

async function openOnce(page: Page) {
  const trigger = page.locator("#global-data-views-menu");
  const menu = page.getByRole("menu");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await expect(menu).toBeVisible({ timeout: 2_000 });
  return menu;
}

/** Opens the views menu, tapping again when a tap lands before the rail is interactive (seen on mobile). */
export async function openViewsMenu(page: Page) {
  let menu = page.getByRole("menu");
  await expect(async () => {
    menu = await openOnce(page);
  }).toPass();
  return menu;
}

/** Chooses one views-menu item, reopening the menu when a re-render closes it before the click lands. */
export async function openViewsMenuItem(page: Page, name: string) {
  await expect(async () => {
    const menu = await openOnce(page);
    await menu.getByRole("menuitem", { name, exact: true }).click({ timeout: 2_000 });
  }).toPass();
}
