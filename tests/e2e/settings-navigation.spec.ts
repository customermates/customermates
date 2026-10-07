import { presetId } from "../../features/records/crm-preset";
import { expect, test } from "./fixtures";
import { collectErrors, openMenu, openSidebar } from "./sidebar";

const COUNTRY_FLAG_ORIGIN = "https://flagcdn.com/";

test("settings live in one area reached from the workspace menu, with Back to the work page", async ({
  page,
  companyId,
}) => {
  const errors = collectErrors(page, [COUNTRY_FLAG_ORIGIN]);
  const deals = `/en/records/${presetId(companyId, "deal")}`;
  await page.goto(deals);
  await page.waitForLoadState("networkidle");

  await test.step("the sidebar holds only work", async () => {
    await openSidebar(page);
    for (const removed of ["Workspace", "Admin"])
      await expect(page.locator(`[data-sidebar-section-label="${removed}"]`)).toHaveCount(0);
    for (const removed of [
      "#nav-profile",
      "#nav-company",
      "#nav-documentation",
      "#nav-feedback",
      "#nav-customize-sidebar",
    ])
      await expect(page.locator(removed)).toHaveCount(0);
  });

  await test.step("the workspace menu opens Settings on Profile & preferences", async () => {
    const menu = await openMenu(page, "#nav-workspace-menu");
    await expect(menu.getByRole("menuitem").first()).toHaveText("Invite members");
    expect((await menu.getByRole("menuitem").allTextContents()).slice(0, 4)).toEqual([
      "Invite members",
      "Members",
      "Settings",
      expect.stringMatching(/^Billing/),
    ]);
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

test("the personal menu holds profile, theme, language, docs, feedback and customize", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectErrors(page, [COUNTRY_FLAG_ORIGIN]);
  await page.goto("/en/dashboard");
  await page.waitForLoadState("networkidle");

  let menu = await openMenu(page, "#nav-personal-menu");
  for (const item of ["Profile & preferences", "Documentation", "Send feedback", "Customize sidebar", "Sign Out"])
    await expect(menu.getByRole("menuitem", { name: item, exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /keyboard shortcuts/i })).toHaveCount(0);

  await menu.getByRole("menuitem", { name: "Theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect
    .poll(
      async () =>
        (await database.query<{ theme: string }>('SELECT theme FROM "User" WHERE id=$1', [workspace.userId])).rows[0]
          ?.theme,
    )
    .toBe("dark");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  menu = await openMenu(page, "#nav-personal-menu");
  await menu.getByRole("menuitem", { name: "Send feedback", exact: true }).click();
  const feedback = page.getByRole("dialog", { name: "Share Your Feedback" });
  await expect(feedback).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(feedback).toHaveCount(0);

  menu = await openMenu(page, "#nav-personal-menu");
  await menu.getByRole("menuitem", { name: "Profile & preferences", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/settings\/profile$/);

  menu = await openMenu(page, "#nav-personal-menu");
  await menu.getByRole("menuitem", { name: /^Language/ }).click();
  await page.getByRole("menuitemradio", { name: "German", exact: true }).click();
  await expect(page).toHaveURL(/\/de\/settings\/profile$/);
  await expect
    .poll(
      async () =>
        (
          await database.query<{ language: string }>('SELECT "displayLanguage" AS language FROM "User" WHERE id=$1', [
            workspace.userId,
          ])
        ).rows[0]?.language,
    )
    .toBe("de");
  expect(errors).toEqual([]);
});
