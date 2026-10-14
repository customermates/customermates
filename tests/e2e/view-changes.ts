import type { Page } from "@playwright/test";

import { expect } from "./fixtures";

export async function saveViewChanges(page: Page) {
  const modified = page.locator("#global-data-views [data-view-modified]");
  await expect(modified).toHaveCount(1);
  await page.locator("#global-data-views-menu").click();
  await page.locator("#global-data-views-save").click();
  await expect(modified).toHaveCount(0);
}
