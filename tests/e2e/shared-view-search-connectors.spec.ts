import type { Page } from "@playwright/test";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { companyPath, companyUrlPattern } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { invokesServerAction, serverActionIds } from "./server-actions";
import { createView, openShareDialog, rail, teammate } from "./view-sharing-helpers";
import { e2eAppMode } from "./workspace-switching";

const editWidget = (name: string) => englishMessages.Dashboard.widgetEditor.editTitle.replace("{name}", name);
const connect = englishMessages.CommandPalette.labels.connect;

async function openPalette(page: Page) {
  const input = page.locator("#global-search-input input");
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(input).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  return input;
}

async function openWidget(page: Page, name: string) {
  const card = page.locator("[data-focus-target^='widget:']").filter({
    has: page.getByRole("heading", { name, exact: true }),
  });
  await card.scrollIntoViewIfNeeded();
  await card.locator('[data-slot="widget-number"]').click();
  const drawer = page.getByRole("dialog", { name, exact: true });
  await expect(drawer).toBeVisible();
  return drawer;
}

test("a widget on a dashboard view someone else shared opens its records without the edit action", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  const roles = await database.query(
    'SELECT id FROM "UserRole" WHERE "companyId"=$1 AND "isSystemRole"=true ORDER BY name LIMIT 1',
    [companyId],
  );
  const member = await teammate(browser, database, companyId, roles.rows[0].id, testInfo);
  try {
    const dashboardPath = companyPath(companyId, "/dashboard");
    await page.goto(dashboardPath);
    const viewId = await createView(page, "Shared board");
    const dialog = page.getByRole("dialog");
    await page.locator("#dashboard-add-widget").click();
    await dialog.locator("#widget-starter-number").click();
    await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Board number");
    await dialog.locator("#widget-modal-save").click();
    await expect(page.getByRole("heading", { name: "Board number", exact: true })).toBeVisible();

    const ownDrawer = await openWidget(page, "Board number");
    await expect(ownDrawer.getByRole("button", { name: editWidget("Board number") })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ownDrawer).toBeHidden();

    const shareDialog = await openShareDialog(page);
    await shareDialog.locator("#share-scope-workspace").check();
    await shareDialog.locator("#share-view-save").click();
    await expect(page.getByText(englishMessages.DataView.share.savedWorkspace, { exact: true })).toBeVisible();

    await member.page.goto(`${dashboardPath}?view=${viewId}`);
    const chip = rail(member.page).getByRole("link", { name: "Shared board", exact: true });
    await expect(chip).toHaveAttribute("aria-current", "page");
    await expect(chip).toHaveAttribute("data-view-shared", "others");
    await expect(member.page.getByRole("heading", { name: "Board number", exact: true })).toBeVisible();

    await openWidget(member.page, "Board number");
    await expect(member.page.getByRole("button", { name: editWidget("Board number") })).toHaveCount(0);
    await expect(member.page.locator("#edit-widget")).toHaveCount(0);
    await member.page.screenshot({ path: testInfo.outputPath("shared-widget-drawer.png"), animations: "disabled" });

    expect(errors).toEqual([]);
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});

test("the search finds every channel and AI client connection and starts it on its settings page", async ({
  page,
  companyId,
}, testInfo) => {
  test.skip(e2eAppMode() === "demo", "The demo account cannot create API keys or connect channels");
  test.setTimeout(240000);
  const dialog = page.getByRole("dialog");
  const options = dialog.getByRole("option");

  await page.goto(companyPath(companyId, "/dashboard"));
  const input = await openPalette(page);
  await input.fill("Claude");
  await expect(options.first()).toContainText(connect.claude);
  await expect(options.first()).toContainText(englishMessages.SettingsNav.apiKeys);
  await input.fill("codex");
  await expect(options.filter({ hasText: connect.openai })).toBeVisible();
  await input.fill("gemini");
  await expect(options.filter({ hasText: connect.gemini })).toBeVisible();
  await input.fill("connectors");
  await expect(options.filter({ hasText: englishMessages.SettingsNav.apiKeys }).first()).toBeVisible();

  if (e2eAppMode() !== "self-hosted") {
    await input.fill("Google Calendar");
    await expect(options.first()).toContainText(connect.google);
    await input.fill("Microsoft");
    await expect(options.first()).toContainText(connect.outlook);
    for (const [query, label] of [
      ["Telegram", connect.telegram],
      ["Instagram", connect.instagram],
      ["LinkedIn", connect.linkedin],
      ["WhatsApp", connect.whatsapp],
    ] as const) {
      await input.fill(query);
      await expect(options.filter({ hasText: label }).first()).toBeVisible();
    }
  }

  await input.fill("Claude");
  await expect(options.first()).toContainText(connect.claude);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/api-keys$"));
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: englishMessages.OnboardingWizard.ai.screen.claude.title })
      .first(),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("connect-claude.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: englishMessages.SettingsNav.apiKeys, exact: true }).first(),
  ).toBeVisible();

  if (e2eAppMode() === "self-hosted") return;
  const startConnect = serverActionIds(
    "app/[locale]/(protected)/w/[workspace]/settings/(account)/channels/actions.ts",
    "startConnectAccountAction",
  );
  const started = page.waitForRequest((request) => invokesServerAction(request, startConnect));
  const again = await openPalette(page);
  await again.fill("Google Calendar");
  await expect(options.first()).toContainText(connect.google);
  await page.keyboard.press("Enter");
  const request = await started;
  expect(request.postData()).toContain("google");
  await expect(page).toHaveURL(companyUrlPattern(companyId, "/settings/channels$"));
});
