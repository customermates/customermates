import { configureTopBar } from "./configure";
import { test, expect } from "./fixtures";

test("keeps currency on Settings and routes CRM configuration to Configure", async ({ page, database, companyId }) => {
  await page.goto("/en/company/settings");
  await expect(page.locator("#company-settings-currency")).toBeVisible();
  await expect(page.locator("#company-settings-data-model").getByRole("link", { name: "Configure" })).toBeVisible();
  await expect(page.locator("#company-settings-deal-stage-field")).toHaveCount(0);
  await expect(page.locator("#company-settings-stage-weights")).toHaveCount(0);
  await expect(page.locator("#terminology-contact")).toHaveCount(0);

  await page.locator("#company-settings-currency").click();
  await page.getByRole("option", { name: /USD/ }).click();
  await page.locator("#company-settings-save").click();
  await expect
    .poll(async () => {
      const result = await database.query('SELECT currency FROM "Company" WHERE id=$1', [companyId]);
      return result.rows[0]?.currency;
    })
    .toBe("usd");
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.locator("#company-settings-currency")).toContainText("USD");

  await page.locator("#company-settings-data-model").getByRole("link", { name: "Configure" }).click();
  await expect(page).toHaveURL(/\/en\/configure(?:\?typeId=[a-f0-9-]+)?$/);
  await expect(configureTopBar(page)).toContainText("Configure");
  await expect(configureTopBar(page)).not.toContainText("My Company");
  await expect(configureTopBar(page).getByRole("button", { name: "Add", exact: true })).toBeVisible();
  await page.goto("/en/company/settings");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Settings")).toBeVisible();
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("menuitem", { name: "Members", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Data model", exact: true })).toHaveCount(0);
});
