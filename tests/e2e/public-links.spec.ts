import type { Page } from "@playwright/test";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { expect, test, collectPageErrors } from "./fixtures";
import { companyPath } from "./app-paths";
import { createBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import { anonymous, createView, openShareDialog, rail, saveRole, teammate } from "./view-sharing-helpers";

const publicLink = englishMessages.DataView.share.public;
const publicPage = englishMessages.PublicLink;
const settings = englishMessages.Workspaces.publicLinks;

async function addNumberWidget(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  await page.locator("#dashboard-add-widget").click();
  await dialog.locator("#widget-starter-number").click();
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await dialog.locator("#widget-modal-save").click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function setPublicLink(page: Page, on: boolean) {
  const dialog = await openShareDialog(page);
  const section = dialog.locator("#share-view-public");
  await expect(section).toBeVisible();
  const toggle = section.locator("#share-view-public-switch");
  await expect(toggle).toHaveAttribute("aria-checked", on ? "false" : "true");
  await toggle.click();
  await expect(page.getByText(on ? publicLink.published : publicLink.revoked, { exact: true })).toBeVisible();
  const url = on ? await section.locator("#share-view-public-link").inputValue() : null;
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  return url;
}

test("publishes a dashboard view by public link for outsiders, read-only, and stops it when revoked or turned off", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  const guests = await saveRole(page, {
    name: "Dashboard guests",
    description: "May not publish",
    permissions: [{ resource: "company", actions: [] }],
    recordGrants: [],
  });
  const member = await teammate(browser, database, companyId, guests.role.id, testInfo);
  const outsider = await anonymous(browser, testInfo);
  try {
    const dashboardPath = companyPath(companyId, "/dashboard");
    await page.goto(dashboardPath);
    await createView(page, "Investor board");
    await addNumberWidget(page, "Pipeline count");

    const url = await setPublicLink(page, true);
    if (!url) throw new Error("No public link was shown");
    const path = new URL(url).pathname;
    expect(path).toMatch(/^\/p\/[0-9a-f]{64}$/u);
    await expect(
      rail(page).getByRole("link", { name: "Investor board", exact: true }).locator("[data-view-public]"),
    ).toHaveCount(1);

    await outsider.page.goto(path);
    await expect(outsider.page.locator("#public-dashboard-title")).toHaveText("Investor board");
    await expect(outsider.page.getByRole("heading", { name: "Pipeline count", exact: true })).toBeVisible();
    await expect(outsider.page.locator("#public-dashboard-branding")).toHaveText(publicPage.branding);
    await expect(outsider.page.locator("#global-data-views")).toHaveCount(0);
    await expect(outsider.page.locator("#dashboard-add-widget")).toHaveCount(0);
    await expect(outsider.page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u);
    if (process.env.APP_MODE === "self-hosted") {
      await expect(outsider.page.locator("#public-dashboard-badge")).toHaveCount(0);
      await expect(outsider.page.locator("#public-dashboard-branding")).toHaveAttribute(
        "href",
        "https://customermates.com",
      );
    } else {
      await expect(outsider.page.locator("#public-dashboard-badge")).toHaveAttribute(
        "href",
        "/auth/signup?utm_source=public_dashboard&utm_medium=referral&utm_campaign=public_link&utm_content=badge",
      );
      await expect(outsider.page.locator("#public-dashboard-badge")).toContainText(publicPage.upsell.badge);
      await expect(outsider.page.locator("#public-dashboard-branding")).toHaveAttribute(
        "href",
        /utm_source=public_dashboard.*utm_content=footer/u,
      );
    }
    await expect(outsider.page.locator("header")).toHaveCount(0);

    const shown = (await outsider.page.locator("[data-public-widget]").first().textContent()) ?? "";
    const shownCount = Number(/(\d+)\s*$/u.exec(shown.trim())?.[1] ?? Number.NaN);
    await outsider.page.getByRole("heading", { name: "Pipeline count", exact: true }).click();
    const drawer = outsider.page.getByRole("dialog", { name: "Pipeline count", exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator("#public-widget-drawer-summary")).toContainText(
      Number.isNaN(shownCount) ? "contributing record" : `${shownCount} contributing record`,
    );
    await expect(drawer.locator('a[href*="/records/"]')).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: /edit/iu })).toHaveCount(0);
    await expect(async () => {
      await outsider.page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0, { timeout: 1000 });
    }).toPass();

    await member.page.goto(path);
    await expect(member.page.locator("#public-dashboard-title")).toHaveText("Investor board");
    await expect(member.page.locator("#global-data-views")).toHaveCount(0);
    await expect(member.page.locator('[data-sidebar="sidebar"]')).toHaveCount(0);

    const foreign = await createBrowserWorkspace(database, "Another workspace");
    const foreignRole = await database.query('SELECT id FROM "UserRole" WHERE "companyId"=$1 LIMIT 1', [
      foreign.companyId,
    ]);
    const stranger = await teammate(browser, database, foreign.companyId, foreignRole.rows[0].id as string, testInfo);
    try {
      await stranger.page.goto(path);
      await expect(stranger.page.locator("#public-dashboard-title")).toHaveText("Investor board");
      await stranger.page.getByRole("heading", { name: "Pipeline count", exact: true }).click();
      await expect(stranger.page.getByRole("dialog", { name: "Pipeline count", exact: true })).toBeVisible();
    } finally {
      await stranger.close();
      await removeBrowserWorkspace(database, foreign);
    }

    await outsider.page.goto(`${path.slice(0, -1)}${path.endsWith("0") ? "1" : "0"}`);
    await expect(outsider.page.getByText(publicPage.unavailableTitle, { exact: true })).toBeVisible();
    await expect(outsider.page.getByText("Pipeline count", { exact: true })).toHaveCount(0);

    const dialog = await openShareDialog(page);
    await expect(dialog.locator("#share-view-public-link")).toHaveValue(url);
    await expect(dialog.locator("#share-view-public-meta")).not.toContainText("Not opened yet");
    await page.keyboard.press("Escape");

    await setPublicLink(page, false);
    await outsider.page.goto(path);
    await expect(outsider.page.getByText(publicPage.unavailableTitle, { exact: true })).toBeVisible();
    await expect(outsider.page.getByText("Pipeline count", { exact: true })).toHaveCount(0);

    const second = await setPublicLink(page, true);
    if (!second) throw new Error("No second public link was shown");
    expect(second).not.toBe(url);
    const secondPath = new URL(second).pathname;
    await outsider.page.goto(secondPath);
    await expect(outsider.page.getByRole("heading", { name: "Pipeline count", exact: true })).toBeVisible();

    await page.goto(companyPath(companyId, "/settings/general"));
    const workspaceSwitch = page.locator("#settings-general-public-links");
    await expect(workspaceSwitch).toHaveAttribute("aria-checked", "true");
    await workspaceSwitch.click();
    await expect(page.getByText(settings.blocked, { exact: true })).toBeVisible();
    await outsider.page.goto(secondPath);
    await expect(outsider.page.getByText(publicPage.unavailableTitle, { exact: true })).toBeVisible();
    await workspaceSwitch.click();
    await expect(page.getByText(settings.allowed, { exact: true })).toBeVisible();
    await outsider.page.goto(secondPath);
    await expect(outsider.page.getByRole("heading", { name: "Pipeline count", exact: true })).toBeVisible();

    await member.page.goto(dashboardPath);
    await createView(member.page, "Guest board");
    const memberDialog = await openShareDialog(member.page);
    await expect(memberDialog.locator("#share-view-public-blocked")).toHaveText(publicLink.permissionDenied);
    await expect(memberDialog.locator("#share-view-public-switch")).toBeDisabled();

    expect(errors).toEqual([]);
    expect(member.errors).toEqual([]);
    expect(outsider.errors).toEqual([]);
  } finally {
    await outsider.close();
    await member.close();
  }
});
