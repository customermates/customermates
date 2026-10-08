import { expect, type Page } from "@playwright/test";

export function recordItem(page: Page, name: string) {
  return page
    .locator("tr, [data-item-id]")
    .filter({ has: page.getByRole("link", { name, exact: true }) })
    .first();
}

export async function openRecordDetails(page: Page, name: string) {
  const item = recordItem(page, name);
  const openDetails = page.getByRole("menuitem", { name: "Open details", exact: true });
  await page.waitForLoadState("networkidle");
  await expect(async () => {
    if (!(await openDetails.isVisible())) {
      await item.hover();
      await item.getByRole("button", { name: `More actions for ${name}`, exact: true }).click();
    }
    await expect(openDetails).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await openDetails.click();
}
