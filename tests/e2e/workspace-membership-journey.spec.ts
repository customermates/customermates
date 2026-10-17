import type { Page } from "@playwright/test";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { expectNotFoundDocuments } from "./browser-diagnostics";
import { collectPageErrors, expect, test } from "./fixtures";
import { runRowAction } from "./record-rows";
import { removeBrowserWorkspace } from "./workspace";
import {
  addMembership,
  addOrganization,
  apiKeyRequest,
  approvalTaskCount,
  createNamedLogin,
  loginEmail,
  memberItem,
  membershipIn,
  nameLogin,
  organizationList,
  readInvitationLink,
} from "./workspace-membership";
import {
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  openWorkspaceSwitcher,
  setActiveWorkspace,
  signInLogin,
  switcherWorkspaces,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const MEMBER = "Jonas Keller";

async function joinByLink(page: Page, link: string) {
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Join Hoffmann Consulting", exact: true })).toBeVisible();
  await clickHydrated(page.getByRole("button", { name: "Join workspace", exact: true }));
  await expect(page).toHaveURL(/\/en\/auth\/pending$/);
}

async function switchTo(page: Page, companyId: string, name: string) {
  const menu = await openWorkspaceSwitcher(page);
  await menu.locator(`[data-workspace-id="${companyId}"]`).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, name);
}

test("a member joins, withdraws, rejoins, works, leaves and is removed across three logins and workspaces", async ({
  browser,
  playwright,
  page,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(900_000);
  const shot = (target: Page, name: string) =>
    target.screenshot({ path: testInfo.outputPath(`ws-journey-${name}-${testInfo.project.name}.png`) });
  const errors = collectPageErrors(page);
  expectNotFoundDocuments(page);
  await nameLogin(database, workspace, "Jonas", "Keller");
  const email = await loginEmail(database, workspace);
  const hoffmann = await createNamedLogin(database, "Hoffmann Consulting", "Anna", "Hoffmann");
  const cleo = await createNamedLogin(database, "Cleo Labs", "Cleo", "Brandt");
  try {
    await addMembership(database, cleo, hoffmann.companyId, { admin: true });
    await setActiveWorkspace(database, cleo, hoffmann.companyId);
    const admin = await signInLogin(browser, database, hoffmann, testInfo);
    const colleague = await signInLogin(browser, database, cleo, testInfo);
    try {
      const membership = () => membershipIn(database, hoffmann.companyId, email);

      const link = await readInvitationLink(admin.page);
      await joinByLink(page, link);
      expect(await membership()).toMatchObject({ status: "pendingAuthorization", left: false });
      await expect.poll(() => approvalTaskCount(database, hoffmann.companyId, email)).toBe(1);
      await shot(page, "pending");

      await clickHydrated(page.locator("#pending-withdraw"));
      await page
        .getByRole("alertdialog", { name: "Withdraw your request to join Hoffmann Consulting?" })
        .getByRole("button", { name: englishMessages.PendingCard.withdrawShort, exact: true })
        .click();
      await expect(page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(page, "Browser workspace");
      expect(await membership()).toMatchObject({ status: "inactive", left: true });
      expect(await approvalTaskCount(database, hoffmann.companyId, email)).toBe(0);

      expect(await readInvitationLink(admin.page)).toBe(link);
      await expect(memberItem(admin.page, MEMBER)).toContainText(englishMessages.WorkspaceMembership.left);
      await joinByLink(page, link);
      expect(await membership()).toMatchObject({ status: "pendingAuthorization", left: false });

      await admin.page.goto("/en/settings/members");
      await runRowAction(admin.page, memberItem(admin.page, MEMBER), MEMBER, "Open details");
      const member = admin.page.getByRole("dialog", { name: "User", exact: true });
      await expect(member.locator("#member-modal-email")).toHaveValue(email);
      await member.locator("#member-modal-role").click();
      await admin.page.getByRole("option", { name: "Admin", exact: true }).click();
      await member.locator("#member-modal-status").click();
      await admin.page.getByRole("option", { name: "Active", exact: true }).click();
      await member.getByRole("button", { name: "Save", exact: true }).click();
      await expect(member).not.toBeVisible();
      await expect.poll(async () => (await membership())?.status).toBe("active");
      expect(await approvalTaskCount(database, hoffmann.companyId, email)).toBe(0);

      await clickHydrated(page.getByRole("button", { name: englishMessages.Common.actions.refresh, exact: true }));
      await expect(page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(page, "Hoffmann Consulting");
      await page.goto(organizationList(hoffmann.companyId));
      await addOrganization(page, "Keller Logistik");
      await shot(page, "member-record");

      await admin.page.goto(organizationList(hoffmann.companyId));
      await expect(admin.page.getByText("Keller Logistik", { exact: true }).first()).toBeVisible();
      await colleague.page.goto(organizationList(hoffmann.companyId));
      await expect(colleague.page.getByText("Keller Logistik", { exact: true }).first()).toBeVisible();

      await switchTo(page, workspace.companyId, "Browser workspace");
      await page.goto(organizationList(workspace.companyId));
      await expect(page.getByText("Example organization", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Keller Logistik", { exact: true })).toHaveCount(0);
      await switchTo(page, hoffmann.companyId, "Hoffmann Consulting");

      await page.goto("/en/settings/api-keys");
      await expect(page.getByText("These keys only access the Hoffmann Consulting workspace.").first()).toBeVisible();
      await clickHydrated(page.locator("#settings-api-keys-generate"));
      const keyDialog = page.getByRole("dialog");
      await keyDialog.locator("#api-key-option-standard").click();
      await keyDialog.locator("#api-key-name").fill("Keller laptop");
      await keyDialog.locator("#api-key-save").click();
      await expect(keyDialog.getByText(englishMessages.ApiKeyModal.keyCreated, { exact: true })).toBeVisible();
      const key = (await keyDialog.locator("pre code").innerText()).trim();
      await page.keyboard.press("Escape");
      const memberId = (await membership())?.id;
      expect(await apiKeyRequest(playwright, key)).toEqual({ status: 200, id: memberId });

      await page.goto("/en/settings/general");
      await expect(page.locator("#settings-general-name")).toHaveValue("Hoffmann Consulting");
      await clickHydrated(page.locator("#settings-general-leave"));
      await page
        .getByRole("alertdialog", { name: "Leave Hoffmann Consulting?" })
        .getByRole("button", { name: englishMessages.Workspaces.leaveShort, exact: true })
        .click();
      await expect(page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(page, "Browser workspace");
      expect(await membership()).toMatchObject({ status: "inactive", left: true });
      expect((await apiKeyRequest(playwright, key)).status).toBe(401);
      const keys = await database.query('SELECT id FROM "Apikey" WHERE "referenceId"=$1 AND name=$2', [
        workspace.authUserId,
        "Keller laptop",
      ]);
      expect(keys.rows).toEqual([]);

      await joinByLink(page, await readInvitationLink(admin.page));
      expect(await membership()).toMatchObject({ status: "pendingAuthorization", left: false });
      await expect.poll(() => approvalTaskCount(database, hoffmann.companyId, email)).toBe(1);

      await admin.page.goto("/en/settings/members");
      const row = memberItem(admin.page, MEMBER);
      await expect(row).toContainText(englishMessages.Common.userStatuses.pendingAuthorization);
      await runRowAction(admin.page, row, MEMBER, "Remove from workspace");
      const confirm = admin.page.getByRole("alertdialog", { name: "Remove Jonas Keller from Hoffmann Consulting?" });
      await expect(confirm).toContainText("Jonas Keller is waiting for approval. Removing them declines the request.");
      await shot(admin.page, "remove-confirm");
      await confirm.getByRole("button", { name: englishMessages.Common.actions.remove, exact: true }).click();
      await expect(confirm).toHaveCount(0);
      await expect(row).toContainText(englishMessages.WorkspaceMembership.left);
      expect(await membership()).toMatchObject({ status: "inactive", left: true });
      expect(await approvalTaskCount(database, hoffmann.companyId, email)).toBe(0);
      await shot(admin.page, "removed-left");

      await expect(page.getByRole("heading", { level: 1, name: englishMessages.PendingCard.title })).toBeVisible();
      await clickHydrated(page.getByRole("button", { name: englishMessages.Common.actions.refresh, exact: true }));
      await expect(page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(page, "Browser workspace");
      const menu = await openWorkspaceSwitcher(page);
      await expect(switcherWorkspaces(menu)).toHaveText([/Browser workspace/]);
      await page.keyboard.press("Escape");
      await page.goto(organizationList(hoffmann.companyId));
      await expect(page.getByRole("heading", { name: englishMessages.NotFoundPage.title, exact: true })).toBeVisible();
      await expect(page.getByText("Keller Logistik", { exact: true })).toHaveCount(0);
      const me = await page.request.get("/api/v1/users/me");
      expect(((await me.json()) as { id: string }).id).toBe(workspace.userId);
      await shot(page, "after-removal");

      await colleague.page.goto("/en/settings/members");
      await expect(memberItem(colleague.page, MEMBER)).toContainText(englishMessages.WorkspaceMembership.left);
      await colleague.page.goto(organizationList(hoffmann.companyId));
      await expect(colleague.page.getByText("Keller Logistik", { exact: true }).first()).toBeVisible();
      expect(admin.errors).toEqual([]);
      expect(colleague.errors).toEqual([]);
    } finally {
      await admin.close();
      await colleague.close();
    }
  } finally {
    await removeBrowserWorkspace(database, hoffmann);
    await removeBrowserWorkspace(database, cleo);
  }
  expect(errors).toEqual([]);
});
