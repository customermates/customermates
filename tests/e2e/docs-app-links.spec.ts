import { presetId } from "../../features/records/crm-preset";
import { CONTENT_LOCALES } from "../../i18n/locale-registry";
import { expect, test } from "./fixtures";

test("opens a docs app link in the reader's own workspace", async ({ page, companyId }) => {
  const contacts = presetId(companyId, "contact");

  await page.goto("/en/open/records/contact?focus=add");
  await expect(page.locator("#records-add")).toHaveAttribute("data-focus-highlight", "");
  await expect(page).toHaveURL(`/en/records/${contacts}`);

  await page.goto("/en/open/configure/deal");
  await expect(page.locator(`[data-focus-target="list:${presetId(companyId, "deal")}"]`)).toHaveAttribute(
    "data-focus-highlight",
    "",
  );
});

test("rendered Configure Deals links in both languages open and highlight the list", async ({ page, companyId }) => {
  const dealId = presetId(companyId, "deal");
  for (const locale of CONTENT_LOCALES) {
    await page.goto(`/${locale}/docs/app-records`);
    const link = page.locator(`a[href="/open/configure/deal"]`).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/[a-z]{2}\/configure(?:\?|$)/);
    await expect(page.locator(`[data-focus-target="list:${dealId}"]`)).toHaveAttribute("data-focus-highlight", "");
  }
});

test("shows not found for an app link the resolver does not know", async ({ page }) => {
  for (const path of ["/en/open/records/projects", "/en/open/records/contact?focus=layout-board", "/en/open/wiki/x"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Back to home" }), path).toBeVisible();
  }
});
