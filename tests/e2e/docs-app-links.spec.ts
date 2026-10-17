import { CONTENT_LOCALES } from "../../i18n/locale-registry";
import { expect, test } from "./fixtures";

const ADD_ROLE = "/settings/roles?focus=control%3Asettings-roles-add";

test("opens a docs page link and highlights its control", async ({ page }) => {
  await page.goto(`/en${ADD_ROLE}`);
  await expect(page.locator("#settings-roles-add")).toHaveAttribute("data-focus-highlight", "");
  await expect(page).toHaveURL("/en/settings/roles");
});

test("rendered Add links on Roles in both languages open the page and highlight Add", async ({ page }) => {
  for (const locale of CONTENT_LOCALES) {
    await page.goto(`/${locale}/docs/app-company`);
    const link = page.locator(`a[href="${ADD_ROLE}"]`).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/[a-z]{2}\/settings\/roles(?:\?|$)/);
    await expect(page.locator("#settings-roles-add")).toHaveAttribute("data-focus-highlight", "");
  }
});
