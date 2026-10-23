import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { appUrlPattern } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { addBrowserWorkspace } from "./workspace";
import {
  activeWorkspaceOf,
  e2eAppMode,
  expectCurrentWorkspace,
  openBlockedPageSwitcher,
  openWorkspaceSwitcher,
  setActiveWorkspace,
  setMembershipStatus,
  switcherWorkspaces,
  switchFromBlockedPage,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

test("a pending membership waits on its approval screen and leaves the way to the other workspaces to the sidebar switcher", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await setMembershipStatus(database, second, "pendingAuthorization");
  await setActiveWorkspace(database, workspace, second.companyId);
  await page.goto("/en/dashboard");

  await expect(page).toHaveURL(/\/en\/auth\/pending$/);
  await expect(page.getByRole("heading", { level: 1, name: englishMessages.PendingCard.title })).toBeVisible();
  await expect(
    page.getByText(englishMessages.PendingCard.subtitle.replace("{workspace}", "Bergmann Steuern"), { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Switch workspace", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("ws-restricted-pending.png"), fullPage: true });
  const restricted = await openBlockedPageSwitcher(page);
  await expect(switcherWorkspaces(restricted)).toHaveCount(2);
  await expect(restricted.locator("#workspace-menu-create")).toBeVisible();
  await restricted.locator(`[data-workspace-id="${workspace.companyId}"]`).click();

  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(await activeWorkspaceOf(database, workspace)).toEqual({ lastUsed: workspace.companyId });
  const menu = await openWorkspaceSwitcher(page);
  await expect(menu.locator(`[data-workspace-id="${second.companyId}"]`)).toContainText(
    englishMessages.Common.userStatuses.pendingAuthorization,
  );
  expect(errors).toEqual([]);
});

test("a deactivated membership explains itself and leaves the way to the other workspaces to the sidebar switcher", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await setMembershipStatus(database, second, "inactive");
  await setActiveWorkspace(database, workspace, second.companyId);
  await page.goto("/en/dashboard");

  await expect(page).toHaveURL(/\/en\/auth\/error\?type=inactiveUser$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: englishMessages.InactiveCard.title.replace("{workspace}", "Bergmann Steuern"),
    }),
  ).toBeVisible();
  await expect(page.getByText(englishMessages.InactiveCard.otherWorkspaces, { exact: true })).toBeVisible();
  await expect(page.getByText(englishMessages.ErrorCard.subtitle)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Switch workspace", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("ws-restricted-inactive.png"), fullPage: true });
  await switchFromBlockedPage(page, workspace.companyId);

  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Browser workspace");
  const menu = await openWorkspaceSwitcher(page);
  await expect(menu.locator(`[data-workspace-id="${second.companyId}"]`)).toContainText(
    englishMessages.Common.userStatuses.inactive,
  );
  expect(errors).toEqual([]);
});
