import { randomBytes, randomUUID } from "node:crypto";

import type { Client } from "pg";

import { hashPassword } from "better-auth/crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { addBrowserWorkspace, createBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import {
  activeWorkspaceOf,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  expectHydrated,
  openBlockedPageSwitcher,
  openWorkspaceSwitcher,
  signInLogin,
  switcherWorkspaces,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

async function inviteToken(database: Client, invitation: { companyId: string; createdById: string }) {
  const token = randomBytes(24).toString("base64url");
  await database.query(
    'INSERT INTO "InviteToken" (id,token,"companyId","createdById","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,NOW()+interval \'7 days\',NOW())',
    [randomUUID(), token, invitation.companyId, invitation.createdById],
  );
  return token;
}

test("an existing login joins another workspace by invitation, waits for approval and then switches into it", async ({
  browser,
  page,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  await database.query('UPDATE "User" SET "firstName"=\'Jonas\',"lastName"=\'Keller\' WHERE id=$1', [workspace.userId]);
  const inviter = await createBrowserWorkspace(database, "Hoffmann Consulting");
  try {
    const token = await inviteToken(database, { companyId: inviter.companyId, createdById: inviter.userId });
    const joined = async () =>
      (
        await database.query<{ firstName: string; status: string; roleId: string | null }>(
          'SELECT "firstName",status::text,"roleId" FROM "User" WHERE "companyId"=$1 AND email=(SELECT email FROM "AuthUser" WHERE id=$2)',
          [inviter.companyId, workspace.authUserId],
        )
      ).rows;

    await page.goto(`/en/invitation/${token}`);
    await expect(page).toHaveURL(/\/en\/auth\/invitation\?intent=/);
    await expect(page.getByRole("heading", { level: 1, name: "Join Hoffmann Consulting", exact: true })).toBeVisible();
    await expect(page.getByText("Invitation from Browser Administrator", { exact: true })).toBeVisible();
    await expect(page.getByText(englishMessages.WorkspaceInvitation.join.body, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("ws-join-card.png"), fullPage: true });
    await clickHydrated(page.getByRole("button", { name: "Join workspace", exact: true }));

    await expect(page).toHaveURL(/\/en\/auth\/pending$/);
    await expect(page.getByRole("heading", { level: 1, name: englishMessages.PendingCard.title })).toBeVisible();
    expect(await joined()).toEqual([{ firstName: "Jonas", status: "pendingAuthorization", roleId: null }]);
    expect(await activeWorkspaceOf(database, workspace)).toEqual({
      session: inviter.companyId,
      lastUsed: inviter.companyId,
    });
    await page.screenshot({ path: testInfo.outputPath("ws-join-pending.png"), fullPage: true });
    const switcher = await openBlockedPageSwitcher(page);
    await expect(switcher.locator(`[data-workspace-id="${workspace.companyId}"]`)).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto(`/en/invitation/${token}`);
    await expect(
      page.getByRole("heading", { level: 1, name: englishMessages.WorkspaceInvitation.pending.title, exact: true }),
    ).toBeVisible();
    await clickHydrated(page.getByRole("button", { name: "Show status", exact: true }));
    await expect(page).toHaveURL(/\/en\/auth\/pending$/);

    const admin = await signInLogin(browser, database, inviter, testInfo);
    try {
      await admin.page.goto("/en/settings/members");
      await clickHydrated(admin.page.locator('[data-slot="data-row-open"]').filter({ hasText: "Jonas Keller" }));
      const member = admin.page.getByRole("dialog", { name: "User", exact: true });
      await member.locator("#member-modal-role").click();
      await admin.page.getByRole("option", { name: "Admin", exact: true }).click();
      await member.locator("#member-modal-status").click();
      await admin.page.getByRole("option", { name: "Active", exact: true }).click();
      await member.getByRole("button", { name: "Save", exact: true }).click();
      await expect(member).not.toBeVisible();
      await expect.poll(async () => (await joined())[0]?.status).toBe("active");
      expect(admin.errors).toEqual([]);
    } finally {
      await admin.close();
    }

    await clickHydrated(page.getByRole("button", { name: englishMessages.Common.actions.refresh, exact: true }));
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expectCurrentWorkspace(page, "Hoffmann Consulting");
    const menu = await openWorkspaceSwitcher(page);
    await expect(switcherWorkspaces(menu)).toHaveText([/Browser workspace/, /Hoffmann Consulting/]);
    await menu.locator(`[data-workspace-id="${workspace.companyId}"]`).click();
    await expect.poll(async () => (await activeWorkspaceOf(database, workspace)).session).toBe(workspace.companyId);
    await expectCurrentWorkspace(page, "Browser workspace");
  } finally {
    await removeBrowserWorkspace(database, inviter);
  }
  expect(errors).toEqual([]);
});

test("a signed-out person opens an invitation, signs in with the existing login and can join from there", async ({
  context,
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const password = randomBytes(18).toString("base64url");
  const login = await database.query<{ email: string }>('SELECT email FROM "AuthUser" WHERE id=$1', [
    workspace.authUserId,
  ]);
  await database.query(
    'INSERT INTO "AuthAccount" (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,\'credential\',$2,$3,NOW())',
    [randomUUID(), workspace.authUserId, await hashPassword(password)],
  );
  const inviter = await createBrowserWorkspace(database, "Hoffmann Consulting");
  try {
    const token = await inviteToken(database, { companyId: inviter.companyId, createdById: inviter.userId });
    await context.clearCookies();
    await page.goto(`/en/invitation/${token}`);
    await expect(page).toHaveURL(/\/en\/auth\/signup\?intent=/);
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/auth\/signin\?intent=/);
    await expectHydrated(page.locator("#email"));
    await page.locator("#email").fill(login.rows[0].email);
    await page.locator("#password").fill(password);
    await clickHydrated(page.getByRole("button", { name: englishMessages.SignInForm.signInCta, exact: true }));

    await expect(page).toHaveURL(/\/en\/auth\/invitation\?intent=/);
    await expect(page.getByRole("heading", { level: 1, name: "Join Hoffmann Consulting", exact: true })).toBeVisible();
    await clickHydrated(page.getByRole("button", { name: "Join workspace", exact: true }));
    await expect(page).toHaveURL(/\/en\/auth\/pending$/);
    const joined = await database.query<{ status: string }>(
      'SELECT status::text FROM "User" WHERE "companyId"=$1 AND email=$2',
      [inviter.companyId, login.rows[0].email],
    );
    expect(joined.rows).toEqual([{ status: "pendingAuthorization" }]);
  } finally {
    await removeBrowserWorkspace(database, inviter);
  }
  expect(errors).toEqual([]);
});

test("an invitation to a workspace the login already belongs to opens that workspace", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  const token = await inviteToken(database, { companyId: second.companyId, createdById: second.userId });
  await page.goto(`/en/invitation/${token}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "You already belong to Bergmann Steuern", exact: true }),
  ).toBeVisible();
  await clickHydrated(page.getByRole("button", { name: "Open workspace", exact: true }));

  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Bergmann Steuern");
  expect(await activeWorkspaceOf(database, workspace)).toEqual({
    session: second.companyId,
    lastUsed: second.companyId,
  });
  const memberships = await database.query<{ count: number }>(
    'SELECT COUNT(*)::integer AS count FROM "User" WHERE "companyId"=$1',
    [second.companyId],
  );
  expect(memberships.rows[0].count).toBe(1);
  expect(errors).toEqual([]);
});
