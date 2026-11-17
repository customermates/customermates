import { randomUUID } from "node:crypto";

import type { Client } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { appPath, appUrlPattern } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { addBrowserWorkspace } from "./workspace";
import { loginEmail, membershipIn } from "./workspace-membership";
import {
  activeWorkspaceOf,
  addAdministrator,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  openWorkspaceSwitcher,
  setActiveWorkspace,
  setMembershipStatus,
  switcherWorkspaces,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const INACTIVE = "Bergmann Steuern";

/** A second workspace with its own active admin, in which the browser login is a member an admin can deactivate. */
async function addStaffedWorkspace(database: Client, workspace: Parameters<typeof addBrowserWorkspace>[1]) {
  const second = await addBrowserWorkspace(database, workspace, INACTIVE);
  await addAdministrator(database, second.companyId, `clara-${randomUUID()}@example.test`);
  return second;
}

async function pauseMarker(database: Client, membership: { companyId: string; userId: string }) {
  const result = await database.query<{ paused: boolean }>(
    'SELECT "pausedByPlanAt" IS NOT NULL AS paused FROM "User" WHERE id=$1 AND "companyId"=$2',
    [membership.userId, membership.companyId],
  );
  return result.rows[0]?.paused ?? null;
}

test("a member an admin deactivated leaves that workspace from its inactive page and lands in their other workspace", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const email = await loginEmail(database, workspace);
  const second = await addStaffedWorkspace(database, workspace);
  await setMembershipStatus(database, second, "inactive");
  await setActiveWorkspace(database, workspace, second.companyId);
  await page.goto("/en/dashboard");

  await expect(page).toHaveURL(/\/en\/auth\/error\?type=inactiveUser$/);
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.InactiveCard.title.replace("{workspace}", INACTIVE) }),
  ).toBeVisible();
  await clickHydrated(page.locator("#inactive-leave"));
  const confirm = page.getByRole("alertdialog", { name: `Leave ${INACTIVE}?` });
  await expect(confirm).toContainText(englishMessages.Workspaces.leaveInactiveConfirmDescription);
  await page.screenshot({ path: testInfo.outputPath(`ws-leave-inactive-confirm-${testInfo.project.name}.png`) });
  expect(await membershipIn(database, second.companyId, email)).toMatchObject({ status: "inactive", left: false });
  await confirm.getByRole("button", { name: englishMessages.Workspaces.leaveShort, exact: true }).click();

  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(await membershipIn(database, second.companyId, email)).toMatchObject({ status: "inactive", left: true });
  expect(await activeWorkspaceOf(database, workspace)).toEqual({ lastUsed: workspace.companyId });
  const menu = await openWorkspaceSwitcher(page);
  await expect(switcherWorkspaces(menu)).toHaveText([/Browser workspace/]);
  expect(errors).toEqual([]);
});

test("a member the Free plan paused is told that leaving is final and leaves from the paused page", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const email = await loginEmail(database, workspace);
  const second = await addStaffedWorkspace(database, workspace);
  await setMembershipStatus(database, second, "inactive");
  await database.query('UPDATE "User" SET "pausedByPlanAt"=NOW() WHERE id=$1 AND "companyId"=$2', [
    second.userId,
    second.companyId,
  ]);
  await setActiveWorkspace(database, workspace, second.companyId);
  await page.goto("/en/dashboard");

  await expect(page).toHaveURL(/\/en\/auth\/paused$/);
  await expect(page.getByTestId("plan-paused-card")).toContainText(englishMessages.PlanPausedCard.title);
  await clickHydrated(page.locator("#plan-paused-leave"));
  const confirm = page.getByRole("alertdialog", { name: `Leave ${INACTIVE}?` });
  await expect(confirm).toContainText(englishMessages.Workspaces.leavePausedConfirmDescription);
  await page.screenshot({ path: testInfo.outputPath(`ws-leave-paused-confirm-${testInfo.project.name}.png`) });

  await confirm.getByRole("button", { name: englishMessages.Common.actions.cancel, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(await membershipIn(database, second.companyId, email)).toMatchObject({ status: "inactive", left: false });
  expect(await pauseMarker(database, second)).toBe(true);

  await clickHydrated(page.locator("#plan-paused-leave"));
  await confirm.getByRole("button", { name: englishMessages.Workspaces.leaveShort, exact: true }).click();

  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(await membershipIn(database, second.companyId, email)).toMatchObject({ status: "inactive", left: true });
  expect(await pauseMarker(database, second)).toBe(false);
  expect(errors).toEqual([]);
});

test("an inactive workspace is left from the list of workspaces without opening it", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const email = await loginEmail(database, workspace);
  const second = await addStaffedWorkspace(database, workspace);
  await setMembershipStatus(database, second, "inactive");
  await page.goto(appPath(workspace.slug, "/settings/workspaces"));

  const row = page.locator(`li[data-workspace-id="${second.companyId}"]`);
  await expect(row).toContainText(englishMessages.Common.userStatuses.inactive);
  await expect(
    page.locator(`li[data-workspace-id="${workspace.companyId}"]`).getByRole("button", { name: `Leave ${INACTIVE}` }),
  ).toHaveCount(0);
  await clickHydrated(row.getByRole("button", { name: `Leave ${INACTIVE}`, exact: true }));
  const confirm = page.getByRole("alertdialog", { name: `Leave ${INACTIVE}?` });
  await expect(confirm).toContainText(englishMessages.Workspaces.leaveInactiveConfirmDescription);
  await page.screenshot({ path: testInfo.outputPath(`ws-leave-inactive-list-${testInfo.project.name}.png`) });
  await confirm.getByRole("button", { name: englishMessages.Workspaces.leaveShort, exact: true }).click();

  await expect(row).toHaveCount(0);
  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/settings/workspaces$"));
  await expect(page.locator(`li[data-workspace-id="${workspace.companyId}"]`)).toBeVisible();
  expect(await membershipIn(database, second.companyId, email)).toMatchObject({ status: "inactive", left: true });
  expect(await membershipIn(database, workspace.companyId, email)).toMatchObject({ status: "active", left: false });
  expect(await activeWorkspaceOf(database, workspace)).toEqual({ lastUsed: workspace.companyId });
  expect(errors).toEqual([]);
});

test("a person whose only workspace is inactive leaves it and is asked to set up a workspace", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const email = await loginEmail(database, workspace);
  await addAdministrator(database, workspace.companyId, `clara-${randomUUID()}@example.test`);
  await setMembershipStatus(database, workspace, "inactive");
  await page.goto("/en/dashboard");

  await expect(page).toHaveURL(/\/en\/auth\/error\?type=inactiveUser$/);
  await expect(page.getByText(englishMessages.InactiveCard.otherWorkspaces, { exact: true })).toHaveCount(0);
  await clickHydrated(page.locator("#inactive-leave"));
  await page
    .getByRole("alertdialog", { name: "Leave Browser workspace?" })
    .getByRole("button", { name: englishMessages.Workspaces.leaveShort, exact: true })
    .click();

  await expect(page).toHaveURL(/\/en\/onboarding(?:[/?]|$)/);
  expect(await membershipIn(database, workspace.companyId, email)).toMatchObject({ status: "inactive", left: true });
  expect(await activeWorkspaceOf(database, workspace)).toEqual({ lastUsed: null });
  expect(errors).toEqual([]);
});
