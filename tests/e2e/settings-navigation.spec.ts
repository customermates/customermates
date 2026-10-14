import { presetId } from "../../features/records/crm-preset";
import { collectPageErrors, expect, test } from "./fixtures";
import { openMenu, openSidebar } from "./sidebar";

test("settings live in one area reached from the workspace menu, with Back to the work page", async ({
  page,
  companyId,
}) => {
  const errors = collectPageErrors(page);
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

  await test.step("webhooks and deliveries are separate pages next to each other in the area nav", async () => {
    const workspaceGroup = page.locator('[data-area-nav-group="workspace"]');
    const items = await workspaceGroup
      .locator("a[id^='nav-settings-']")
      .evaluateAll((links) => links.map((link) => link.id));
    expect(items.slice(items.indexOf("nav-settings-webhooks"), items.indexOf("nav-settings-webhooks") + 2)).toEqual([
      "nav-settings-webhooks",
      "nav-settings-webhook-deliveries",
    ]);
    await page.locator("#nav-settings-webhooks").click();
    await expect(page).toHaveURL(/\/en\/settings\/webhooks$/);
    await expect(page.locator('[data-slot="segmented-control-list"]')).toHaveCount(0);
    await openSidebar(page);
    await page.locator("#nav-settings-webhook-deliveries").click();
    await expect(page).toHaveURL(/\/en\/settings\/webhook-deliveries$/);
    await openSidebar(page);
    await expect(page.locator("#nav-settings-webhook-deliveries")).toHaveAttribute("data-active", "true");
    await expect(page.locator("#nav-settings-webhooks")).toHaveAttribute("data-active", "false");
  });

  await test.step("Back returns to the page Settings was opened from", async () => {
    await openSidebar(page);
    await page.locator("#nav-area-back").click();
    await expect(page).toHaveURL(new RegExp(`${deals}$`));
    await openSidebar(page);
    await expect(page.locator("[data-area-nav]")).toHaveCount(0);
  });

  await test.step("the old deliveries links lead to the Deliveries page", async () => {
    await page.goto("/en/settings/webhooks/deliveries?searchTerm=order");
    await expect(page).toHaveURL(/\/en\/settings\/webhook-deliveries\?searchTerm=order$/);
    await page.goto("/en/settings/webhooks?tab=deliveries");
    await expect(page).toHaveURL(/\/en\/settings\/webhook-deliveries$/);
  });

  await test.step("the old profile and company routes are gone", async () => {
    for (const removed of ["profile/settings", "company/members", "company/webhook-deliveries"])
      expect((await page.request.get(`/en/${removed}`)).status(), removed).toBe(404);
  });

  expect(errors).toEqual([]);
});

test("the personal menu holds profile, theme, language, docs, feedback and customize", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  await page.goto("/en/dashboard");
  await page.waitForLoadState("networkidle");

  let menu = await openMenu(page, "#nav-personal-menu");
  for (const item of ["Profile & preferences", "Documentation", "Send feedback", "Customize sidebar", "Sign Out"])
    await expect(menu.getByRole("menuitem", { name: item, exact: true })).toBeVisible();
  await menu.getByRole("menuitem", { name: /^Keyboard shortcuts/ }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
  menu = await openMenu(page, "#nav-personal-menu");

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

test("profile settings show the unsaved-changes bar only while edits are pending", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/en/settings/profile");
  await page.waitForLoadState("networkidle");
  const firstName = page.locator("#settings-profile-first-name");
  const bar = page.locator("[data-slot='unsaved-changes-bar']");
  const original = await firstName.inputValue();
  const edited = `${original} edited`;
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(bar).toHaveCount(0);
  const cleanTop = (await firstName.boundingBox())?.y;

  await firstName.fill(edited);
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("role", "status");
  await expect(bar).toContainText("Unsaved changes");
  expect((await firstName.boundingBox())?.y).toBe(cleanTop);
  await page.locator("#settings-profile-cancel").click();
  await expect(bar).toHaveCount(0);
  await expect(firstName).toHaveValue(original);

  await firstName.fill(edited);
  await page.locator("#settings-profile-save").click();
  await expect(bar).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(firstName).toHaveValue(edited);

  await expect(async () => {
    await firstName.fill(original);
    await expect(bar).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await page.locator("#settings-profile-save").click();
  await expect(bar).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("long profile email stays inside the phone viewport", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  const email = `${"long-profile-address-".repeat(5)}@example.test`;
  await database.query('UPDATE "AuthUser" SET email=$1 WHERE id=$2', [email, workspace.authUserId]);
  await database.query('UPDATE "User" SET email=$1 WHERE id=$2', [email, workspace.userId]);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("/de/settings/profile");
  await expect(page.locator("#settings-profile-first-name")).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await database.query('UPDATE "User" SET theme=$1 WHERE id=$2', [theme, workspace.userId]);
    await page.evaluate((value) => localStorage.setItem("theme", value), theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/de/settings/profile", { waitUntil: "load" });
    await expect(page.locator("#settings-profile-first-name")).toBeVisible();
    const address = page
      .locator("form")
      .filter({ has: page.locator("#settings-profile-first-name") })
      .getByText(email, { exact: true });
    await expect(address).toBeVisible();
    const box = await address.boundingBox();
    if (!box) throw new Error("Profile email is missing");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    await expect(address).toHaveCSS("text-overflow", "ellipsis");
  }
  expect(errors).toEqual([]);
});
