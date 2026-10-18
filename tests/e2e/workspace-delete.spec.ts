import { randomUUID } from "node:crypto";

import type { Page, TestInfo } from "@playwright/test";
import type { Client } from "pg";
import type { BrowserWorkspace } from "./workspace";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { openSidebar } from "./sidebar";
import { addBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import {
  addMembership,
  createNamedLogin,
  organizationList,
  recordSentryRequests,
  recordToasts,
} from "./workspace-membership";
import { uniqueWorkspaceName } from "./workspace-names";
import { createWorkspaceFromSettings, finishOnboarding } from "./workspace-setup";
import {
  activeWorkspaceOf,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  expectHydrated,
  openBlockedPageSwitcher,
  setActiveWorkspace,
  signInLogin,
  switcherWorkspaces,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const messages = englishMessages.Workspaces;

async function workspaceRow(database: Client, name: string, authUserId: string) {
  const { rows } = await database.query<{ id: string; subscription: string | null; trialEndDate: Date | null }>(
    'SELECT c.id,s.status::text AS subscription,s."trialEndDate" FROM "Company" c LEFT JOIN "Subscription" s ON s."companyId"=c.id WHERE c.name=$1 AND c."createdByAuthUserId"=$2',
    [name, authUserId],
  );
  return rows;
}

async function trialConsumedAt(database: Client, login: BrowserWorkspace) {
  const { rows } = await database.query<{ trialConsumedAt: Date | null }>(
    'SELECT "trialConsumedAt" FROM "AuthUser" WHERE id=$1',
    [login.authUserId],
  );
  return rows[0]?.trialConsumedAt ?? null;
}

async function leaveTrialUnused(database: Client, workspace: BrowserWorkspace) {
  await database.query('UPDATE "Company" SET "createdByAuthUserId"=NULL WHERE id=$1', [workspace.companyId]);
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","createdAt","updatedAt") SELECT $1,"companyId","roleId",$2,\'Clara\',\'Founder\',\'active\',true,NOW(),"createdAt" - interval \'1 day\',NOW() FROM "User" WHERE id=$3',
    [randomUUID(), `clara-${randomUUID()}@example.test`, workspace.userId],
  );
}

function recordRedirects(page: Page) {
  const locations: string[] = [];
  page.on("response", (response) => {
    const location = response.headers()["location"];
    if (response.request().isNavigationRequest() && response.status() >= 300 && response.status() < 400 && location)
      locations.push(new URL(location, response.url()).pathname);
  });
  return locations;
}

async function confirmDeletion(page: Page, anchor: string, name: string) {
  const dialog = page.getByRole("alertdialog", { name: `Delete ${name}?` });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(messages.deleteConfirmDescription);
  const confirm = dialog.locator(`#${anchor}`);
  await expect(confirm).toBeDisabled();
  await dialog.locator('[data-slot="confirm-dialog-confirmation"]').fill(name);
  await clickHydrated(confirm);
}

async function expectBlockedDelete(page: Page, testInfo: TestInfo, id: string, reason: string) {
  const button = page.locator(`#${id}`);
  await expect(button).toBeDisabled();
  const trigger = page.locator('[data-slot="delete-workspace-blocked"]');
  await expect(trigger).toHaveAttribute("aria-describedby", `${id}-reason`);
  if (testInfo.project.use.hasTouch) {
    await expect(page.locator(`#${id}-reason`)).toHaveText(reason);
    return;
  }
  await expect(page.locator(`#${id}-reason`)).toBeHidden();
  await expectHydrated(trigger);
  await expect(async () => {
    await page.mouse.move(0, 0);
    await trigger.hover();
    await expect(page.getByRole("tooltip")).toContainText(reason, { timeout: 2_000 });
  }).toPass();
}

test("the creator deletes an unpaid extra workspace from its plan page, lands in the first one and never gets a second trial", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(e2eAppMode() !== "cloud", "Plans and the trial exist in the cloud only");
  test.setTimeout(240_000);
  const errors = collectPageErrors(page);
  const trialName = uniqueWorkspaceName("Testlauf");
  const paidName = uniqueWorkspaceName("Steuern 2026");
  await leaveTrialUnused(database, workspace);
  const redirects = recordRedirects(page);

  await page.goto("/en/settings/workspaces");
  await clickHydrated(page.getByRole("button", { name: "Create workspace", exact: true }));
  const dialog = page.getByRole("dialog", { name: "Create workspace" });
  await dialog.locator("#create-workspace-name").fill(trialName);
  await dialog.locator("#create-workspace-terms").click();
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();
  await finishOnboarding(page);
  expect(redirects.filter((path) => path === "/dashboard")).toEqual([]);
  const [trial] = await workspaceRow(database, trialName, workspace.authUserId);
  expect(trial).toMatchObject({ subscription: "trial", trialEndDate: expect.any(Date) });
  expect(await trialConsumedAt(database, workspace)).toBeInstanceOf(Date);

  await page.goto("/en/settings/general");
  await expect(page.locator("#settings-general-delete")).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath(`ws-delete-general-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await clickHydrated(page.locator("#settings-general-delete"));
  await confirmDeletion(page, "settings-general-delete-confirm", trialName);
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(await workspaceRow(database, trialName, workspace.authUserId)).toEqual([]);
  expect(await activeWorkspaceOf(database, workspace)).toEqual({
    session: workspace.companyId,
    lastUsed: workspace.companyId,
  });

  await createWorkspaceFromSettings(page, paidName);
  const [unpaid] = await workspaceRow(database, paidName, workspace.authUserId);
  expect(unpaid).toMatchObject({ subscription: "expired", trialEndDate: null });
  const menu = await openBlockedPageSwitcher(page);
  await expect(switcherWorkspaces(menu)).toHaveCount(2);
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="sidebar"][data-mobile="true"]')).toHaveCount(0, { timeout: 2_000 });
    await expect(menu).toBeHidden({ timeout: 2_000 });
  }).toPass();
  await expect(page.locator("#subscription-expired-delete")).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath(`ws-delete-plan-page-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await clickHydrated(page.locator("#subscription-expired-delete"));
  await confirmDeletion(page, "subscription-expired-delete-confirm", paidName);

  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(await workspaceRow(database, paidName, workspace.authUserId)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a member's open page of a deleted workspace shows the workspace-changed dialog and reloads into their own", async ({
  browser,
  page,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  const name = uniqueWorkspaceName("Projekt Nord");
  const second = await addBrowserWorkspace(database, workspace, name);
  await database.query(
    'UPDATE "Subscription" SET status=\'trial\',"trialEndDate"=NOW()+interval \'3 days\' WHERE "companyId"=$1',
    [second.companyId],
  );
  const rita = await createNamedLogin(database, uniqueWorkspaceName("Rita Labs"), "Rita", "Vogel");
  try {
    await addMembership(database, rita, second.companyId, {
      roleName: "Reader",
      permissions: [{ resource: "company", action: "readAll" }],
    });
    await setActiveWorkspace(database, rita, second.companyId);
    await setActiveWorkspace(database, workspace, second.companyId);
    const member = await signInLogin(browser, database, rita, testInfo);
    const toasts = await recordToasts(member.page);
    const sentry = recordSentryRequests(member.page);
    try {
      await member.page.goto("/en/dashboard");
      await openSidebar(member.page);
      await expectCurrentWorkspace(member.page, name);

      await page.goto("/en/settings/general");
      await clickHydrated(page.locator("#settings-general-delete"));
      await confirmDeletion(page, "settings-general-delete-confirm", name);
      await expect(page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(page, "Browser workspace");

      const notice = member.page.getByRole("alertdialog", { name: messages.otherTab.titleChanged });
      await clickHydrated(member.page.locator("#nav-workspace-menu"));
      await expect(notice).toBeVisible({ timeout: 20_000 });
      expect(await toasts()).toEqual([]);
      expect(sentry).toEqual([]);
      await member.page.screenshot({ path: testInfo.outputPath(`ws-delete-member-tab-${testInfo.project.name}.png`) });
      await notice.getByRole("button", { name: messages.otherTab.reload, exact: true }).click();

      await expect(member.page).toHaveURL(/\/en\/dashboard$/);
      await expect.poll(async () => (await activeWorkspaceOf(database, rita)).session).toBe(rita.companyId);
      await member.page.goto(organizationList(second.companyId));
      await expect(
        member.page.getByRole("heading", { name: englishMessages.NotFoundPage.title, exact: true }),
      ).toBeVisible();
      expect(member.errors).toEqual([]);
    } finally {
      await member.close();
    }
  } finally {
    await removeBrowserWorkspace(database, rita);
  }
  expect(errors).toEqual([]);
});

test("a workspace with an active subscription cannot be deleted and says why", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(e2eAppMode() !== "cloud", "Billing exists in the cloud only");
  const errors = collectPageErrors(page);
  await database.query(
    'UPDATE "Subscription" SET status=\'active\',"lemonSqueezyId"=$2,"currentPeriodEnd"=NOW()+interval \'20 days\' WHERE "companyId"=$1',
    [workspace.companyId, `ls-${randomUUID()}`],
  );

  await page.goto("/en/settings/general");
  await expectBlockedDelete(page, testInfo, "settings-general-delete", messages.deleteBlocked.billingActive);
  await page.screenshot({
    path: testInfo.outputPath(`ws-delete-blocked-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await expect(page.locator("#settings-general-leave")).toBeVisible();
  expect(await activeWorkspaceOf(database, workspace)).toMatchObject({ session: workspace.companyId });
  expect(errors).toEqual([]);
});

test("an admin who did not create a cloud workspace cannot delete it and says why", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(e2eAppMode() !== "cloud", "The creator rule applies in the cloud only");
  const errors = collectPageErrors(page);
  await database.query('UPDATE "Company" SET "createdByAuthUserId"=$2 WHERE id=$1', [
    workspace.companyId,
    randomUUID(),
  ]);
  await database.query('UPDATE "Subscription" SET status=\'expired\' WHERE "companyId"=$1', [workspace.companyId]);

  await page.goto("/en/subscription-expired");
  await expectBlockedDelete(page, testInfo, "subscription-expired-delete", messages.deleteBlocked.notCreator);
  expect(errors).toEqual([]);
});

test("any self-hosted admin deletes a workspace and lands in another one", async ({ page, database, workspace }) => {
  test.skip(e2eAppMode() !== "self-hosted", "Runs against a server started with APP_MODE=self-hosted");
  const errors = collectPageErrors(page);
  const name = uniqueWorkspaceName("Werkstatt");
  const second = await addBrowserWorkspace(database, workspace, name);
  await database.query('UPDATE "Company" SET "createdByAuthUserId"=$2 WHERE id=$1', [second.companyId, randomUUID()]);
  await setActiveWorkspace(database, workspace, second.companyId);

  await page.goto("/en/settings/general");
  await expect(page.locator("#settings-general-delete")).toBeEnabled();
  await clickHydrated(page.locator("#settings-general-delete"));
  await confirmDeletion(page, "settings-general-delete-confirm", name);

  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");
  const remaining = await database.query('SELECT 1 FROM "Company" WHERE id=$1', [second.companyId]);
  expect(remaining.rowCount).toBe(0);
  expect(errors).toEqual([]);
});

test("a signed-in visit to the locale root opens the dashboard in that locale without an unlocalized hop", async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  const redirects = recordRedirects(page);

  await page.goto("/en");

  await expect(page).toHaveURL(/\/en\/dashboard$/);
  expect(redirects).toContain("/en/dashboard");
  expect(redirects).not.toContain("/dashboard");
  expect(errors).toEqual([]);
});
