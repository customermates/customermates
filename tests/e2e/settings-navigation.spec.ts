import type { Page } from "@playwright/test";

import { presetId } from "../../features/records/crm-preset";
import { expect, isAppConsoleError, isBenignPageError, test } from "./fixtures";

const COUNTRY_FLAG_ORIGIN = "https://flagcdn.com/";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message) && !message.location().url.startsWith(COUNTRY_FLAG_ORIGIN))
      errors.push(message.text());
  });
  return errors;
}

async function openSidebar(page: Page) {
  await page.waitForFunction(() =>
    ["sidebar-trigger", "scroll-container"].every((id) => {
      const element = document.getElementById(id);
      return element !== null && Object.keys(element).some((key) => key.startsWith("__reactProps"));
    }),
  );
  if (!(await page.locator("#nav-workspace-menu").isVisible())) await page.locator("#sidebar-trigger").click();
  await expect(page.locator("#nav-workspace-menu")).toBeVisible();
}

async function openMenu(page: Page, trigger: "#nav-workspace-menu" | "#nav-personal-menu") {
  await openSidebar(page);
  await page.locator(trigger).click();
  return page.getByRole("menu");
}

test("settings live in one area reached from the workspace menu, with Back to the work page", async ({
  page,
  companyId,
}) => {
  const errors = collectErrors(page);
  const deals = `/en/records/${presetId(companyId, "deal")}`;
  await page.goto(deals);
  await page.waitForLoadState("networkidle");

  await test.step("the sidebar holds only work", async () => {
    await openSidebar(page);
    for (const removed of ["Workspace", "Admin"])
      await expect(page.locator(`[data-sidebar-section-label="${removed}"]`)).toHaveCount(0);
    for (const removed of ["#nav-profile", "#nav-company", "#nav-documentation", "#nav-feedback", "#nav-customize-sidebar"])
      await expect(page.locator(removed)).toHaveCount(0);
  });

  await test.step("the workspace menu opens Settings on Profile & preferences", async () => {
    const menu = await openMenu(page, "#nav-workspace-menu");
    await expect(menu.getByRole("menuitem", { name: "Invite members" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/settings\/profile$/);
    await openSidebar(page);
    const nav = page.locator("[data-area-nav]");
    await expect(nav.locator('[data-area-nav-group="account"]')).toContainText("Profile & preferences");
    await expect(nav.locator('[data-area-nav-group="workspace"]')).toContainText("Members");
    await expect(page.locator("#nav-settings-profile")).toHaveAttribute("data-active", "true");
    await expect(page.locator("#nav-search")).toHaveCount(0);
    await expect(page.locator("[data-sidebar-section]")).toHaveCount(0);
  });

  await test.step("webhook deliveries are a tab inside Webhooks", async () => {
    await page.locator("#nav-settings-webhooks").click();
    await expect(page).toHaveURL(/\/en\/settings\/webhooks$/);
    const tabs = page.locator("[data-route-tabs]");
    await expect(tabs.getByRole("tab", { name: "Webhooks" })).toHaveAttribute("aria-selected", "true");
    await tabs.getByRole("tab", { name: "Deliveries" }).click();
    await expect(page).toHaveURL(/\/en\/settings\/webhooks\/deliveries$/);
    await expect(tabs.getByRole("tab", { name: "Deliveries" })).toHaveAttribute("aria-selected", "true");
  });

  await test.step("Back returns to the page Settings was opened from", async () => {
    await openSidebar(page);
    await page.locator("#nav-area-back").click();
    await expect(page).toHaveURL(new RegExp(`${deals}$`));
    await openSidebar(page);
    await expect(page.locator("[data-area-nav]")).toHaveCount(0);
  });

  await test.step("the old profile and company routes are gone", async () => {
    for (const path of ["/en/profile/settings", "/en/company/members", "/en/company/webhook-deliveries"])
      expect((await page.request.get(path)).status(), path).toBe(404);
  });

  expect(errors).toEqual([]);
});

test("the personal menu holds profile, theme, docs, feedback and customize", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectErrors(page);
  await page.goto("/en/dashboard");
  await page.waitForLoadState("networkidle");

  let menu = await openMenu(page, "#nav-personal-menu");
  for (const item of ["Profile & preferences", "Keyboard shortcuts", "Documentation", "Send feedback", "Customize sidebar", "Sign Out"])
    await expect(menu.getByRole("menuitem", { name: item, exact: true })).toBeVisible();

  await menu.getByRole("menuitem", { name: "Theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect
    .poll(async () => (await database.query<{ theme: string }>('SELECT theme FROM "User" WHERE id=$1', [workspace.userId])).rows[0]?.theme)
    .toBe("dark");
  await page.keyboard.press("Escape");

  menu = await openMenu(page, "#nav-personal-menu");
  await menu.getByRole("menuitem", { name: "Send feedback", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  menu = await openMenu(page, "#nav-personal-menu");
  await menu.getByRole("menuitem", { name: "Profile & preferences", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/settings\/profile$/);
  expect(errors).toEqual([]);
});
