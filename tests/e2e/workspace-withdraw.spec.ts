import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { createBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import {
  approvalTaskCount,
  inviteToken,
  joinFromInvitation,
  loginEmail,
  memberItem,
  membershipIn,
  nameLogin,
  taskList,
} from "./workspace-membership";
import {
  activeWorkspaceOf,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  openWorkspaceSwitcher,
  signInLogin,
  switcherWorkspaces,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

test("a person withdraws a pending request from the waiting screen and the admin no longer sees it", async ({
  browser,
  page,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(240_000);
  const errors = collectPageErrors(page);
  await nameLogin(database, workspace, "Jonas", "Keller");
  const email = await loginEmail(database, workspace);
  const inviter = await createBrowserWorkspace(database, "Hoffmann Consulting");
  try {
    const token = await inviteToken(database, { companyId: inviter.companyId, createdById: inviter.userId });
    await page.goto(`/en/invitation/${token}`);
    await joinFromInvitation(page);
    await expect(page).toHaveURL(/\/en\/auth\/pending$/);
    await expect.poll(() => approvalTaskCount(database, inviter.companyId, email)).toBe(1);

    const admin = await signInLogin(browser, database, inviter, testInfo);
    try {
      await admin.page.goto(taskList(inviter.companyId));
      await expect(admin.page.getByText(`User Pending Authorization (${email})`, { exact: true })).toBeVisible();
      await admin.page.goto("/en/settings/members");
      await expect(memberItem(admin.page, "Jonas Keller")).toContainText(
        englishMessages.Common.userStatuses.pendingAuthorization,
      );

      await clickHydrated(page.locator("#pending-withdraw"));
      const confirm = page.getByRole("alertdialog", { name: "Withdraw your request to join Hoffmann Consulting?" });
      await expect(confirm).toContainText(englishMessages.PendingCard.withdrawConfirmDescription);
      await page.screenshot({ path: testInfo.outputPath(`ws-withdraw-confirm-${testInfo.project.name}.png`) });
      await confirm.getByRole("button", { name: englishMessages.PendingCard.withdrawShort, exact: true }).click();

      await expect(page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(page, "Browser workspace");
      expect(await membershipIn(database, inviter.companyId, email)).toMatchObject({ status: "inactive", left: true });
      expect(await approvalTaskCount(database, inviter.companyId, email)).toBe(0);
      expect(await activeWorkspaceOf(database, workspace)).toEqual({
        session: workspace.companyId,
        lastUsed: workspace.companyId,
      });
      const menu = await openWorkspaceSwitcher(page);
      await expect(switcherWorkspaces(menu)).toHaveText([/Browser workspace/]);
      await page.keyboard.press("Escape");

      await admin.page.reload();
      await expect(memberItem(admin.page, "Browser Administrator")).toBeVisible();
      await expect(memberItem(admin.page, "Jonas Keller")).toHaveCount(0);
      await admin.page.screenshot({
        path: testInfo.outputPath(`ws-withdraw-admin-members-${testInfo.project.name}.png`),
      });

      await admin.page.goto(taskList(inviter.companyId));
      await admin.page.waitForLoadState("networkidle");
      await expect(admin.page.getByText(`User Pending Authorization (${email})`, { exact: true })).toHaveCount(0);
      expect(admin.errors).toEqual([]);
    } finally {
      await admin.close();
    }
  } finally {
    await removeBrowserWorkspace(database, inviter);
  }
  expect(errors).toEqual([]);
});
