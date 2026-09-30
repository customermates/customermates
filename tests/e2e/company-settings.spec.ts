import { test, expect } from "./fixtures";

test("keeps currency on Settings and routes CRM configuration to Data model", async ({ page, database, companyId }) => {
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
  await page.reload();
  await expect(page.locator("#company-settings-currency")).toContainText("USD");

  await page.locator("#company-settings-data-model").getByRole("link", { name: "Configure" }).click();
  await expect(page).toHaveURL(/\/en\/company\/data-model$/);
  await expect(page.getByRole("heading", { name: "Data model", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create list", exact: true })).toBeVisible();
});
