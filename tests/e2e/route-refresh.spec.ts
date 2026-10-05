import type { Page } from "@playwright/test";
import { presetId } from "../../features/records/crm-preset";
import { addFromConfigure, configureDrawer, openConfigure } from "./configure";
import { expect, test } from "./fixtures";

async function refreshRoute(page: Page) {
  const refreshed = page.waitForResponse(
    (response) => response.request().headers()["rsc"] === "1" && response.request().method() === "GET",
  );
  await page.evaluate(() => (window as unknown as { next: { router: { refresh: () => void } } }).next.router.refresh());
  expect((await refreshed).ok()).toBe(true);
  await page.waitForLoadState("networkidle");
}

async function markPageRoot(page: Page, selector: string) {
  await page.locator(selector).evaluate((element) => element.setAttribute("data-refresh-marker", "kept"));
}

test("keeps an open Configure drawer and its unsaved edits through a route refresh", async ({ page, companyId }) => {
  await openConfigure(page, presetId(companyId, "deal"));
  await markPageRoot(page, "[data-configure-page]");
  await addFromConfigure(page, "List");
  const name = configureDrawer(page).getByRole("textbox").first();
  await name.fill("Refresh survivor");

  await refreshRoute(page);

  await expect(configureDrawer(page)).toBeVisible();
  await expect(name).toHaveValue("Refresh survivor");
  await expect(page.locator("[data-configure-page]")).toHaveAttribute("data-refresh-marker", "kept");
});

test("keeps an unsaved Knowledge Base draft through a route refresh", async ({ page }) => {
  await page.goto("/en/wiki");
  await page.getByRole("button", { name: "New page", exact: true }).first().click();
  const title = page.getByRole("textbox", { name: "Page title", exact: true });
  await expect(title).toBeVisible();
  await markPageRoot(page, "[data-wiki-document-layout]");
  await title.fill("Unsaved refresh draft");

  await refreshRoute(page);

  await expect(title).toHaveValue("Unsaved refresh draft");
  await expect(page.locator("[data-wiki-document-layout]")).toHaveAttribute("data-refresh-marker", "kept");
});
