import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { addBrowserWorkspace } from "./workspace";
import {
  activeWorkspaceOf,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  openWorkspaceSwitcher,
  setActiveWorkspace,
  setMembershipStatus,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

test("a pending membership waits on its approval screen and keeps the way to the other workspaces open", async ({
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
  const others = page.locator("[data-slot='restricted-workspace-switch']");
  await expect(others.getByRole("heading", { name: "Switch workspace", exact: true })).toBeVisible();
  await expect(others.locator("[data-workspace-id]")).toHaveCount(1);
  await expect(others.getByRole("button", { name: "Create workspace", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ws-restricted-pending.png"), fullPage: true });
  await clickHydrated(others.getByRole("button", { name: "Browser workspace", exact: true }));

  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(await activeWorkspaceOf(database, workspace)).toEqual({
    session: workspace.companyId,
    lastUsed: workspace.companyId,
  });
  const menu = await openWorkspaceSwitcher(page);
  await expect(menu.locator(`[data-workspace-id="${second.companyId}"]`)).toContainText(
    englishMessages.Workspaces.status.pending,
  );
  expect(errors).toEqual([]);
});

test("a deactivated membership explains itself and keeps the way to the other workspaces open", async ({
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
  await expect(page.getByText(englishMessages.ErrorCard.inactiveUser, { exact: true })).toBeVisible();
  const others = page.locator("[data-slot='restricted-workspace-switch']");
  await expect(others.locator("[data-workspace-id]")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("ws-restricted-inactive.png"), fullPage: true });
  await clickHydrated(others.getByRole("button", { name: "Browser workspace", exact: true }));

  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");
  const menu = await openWorkspaceSwitcher(page);
  await expect(menu.locator(`[data-workspace-id="${second.companyId}"]`)).toContainText(
    englishMessages.Common.userStatuses.inactive,
  );
  expect(errors).toEqual([]);
});
