import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";
import type { Client } from "pg";
import type { BrowserWorkspace } from "./workspace";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { uniqueWorkspaceName } from "./workspace-names";
import {
  activeWorkspaceOf,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  openWorkspaceSwitcher,
  switchFromBlockedPage,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

async function createdWorkspace(database: Client, name: string) {
  const { rows } = await database.query<{
    id: string;
    createdByAuthUserId: string | null;
    subscription: string;
    trialEndDate: Date | null;
    memberStatus: string;
    onboardingWizardCompletedAt: Date | null;
    isSystemRole: boolean;
  }>(
    'SELECT c.id,c."createdByAuthUserId",s.status::text AS subscription,s."trialEndDate",u.status::text AS "memberStatus",u."onboardingWizardCompletedAt",r."isSystemRole" FROM "Company" c JOIN "Subscription" s ON s."companyId"=c.id JOIN "User" u ON u."companyId"=c.id JOIN "UserRole" r ON r.id=u."roleId" WHERE c.name=$1',
    [name],
  );
  return rows;
}

async function addEarlierAdministrator(database: Client, workspace: BrowserWorkspace) {
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","createdAt","updatedAt") SELECT $1,"companyId","roleId",$2,\'Clara\',\'Founder\',\'active\',true,NOW(),"createdAt" - interval \'1 day\',NOW() FROM "User" WHERE id=$3',
    [randomUUID(), `clara-${randomUUID()}@example.test`, workspace.userId],
  );
}

async function fillCreateWorkspace(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name: "Create workspace" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(englishMessages.Workspaces.createDescription);
  await dialog.locator("#create-workspace-name").fill(name);
  return dialog;
}

test("an extra cloud workspace asks for a plan before its onboarding and the plan page leads back", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(e2eAppMode() !== "cloud", "Plans and the trial exist in the cloud only");
  const name = uniqueWorkspaceName("Steuern 2026");
  const errors = collectPageErrors(page);
  await page.goto("/en/dashboard");
  const menu = await openWorkspaceSwitcher(page);
  await menu.getByRole("menuitem", { name: "Create workspace", exact: true }).click();
  const dialog = await fillCreateWorkspace(page, name);
  await expect(dialog).toContainText(englishMessages.Workspaces.billingNote);
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: englishMessages.Common.errors.termsNotAgreed }),
  ).toBeVisible();
  await expect(dialog.locator("#create-workspace-terms")).toHaveAttribute("aria-invalid", "true");
  expect(await createdWorkspace(database, name)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("ws-create-modal-terms.png") });
  await dialog.locator("#create-workspace-terms").click();
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();

  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(page.getByRole("heading", { level: 1, name: `Choose a plan for ${name}`, exact: true })).toBeVisible();
  await expect(page.getByText(englishMessages.Workspaces.firstPlan.subtitle, { exact: true })).toBeVisible();
  const [created] = await createdWorkspace(database, name);
  expect(created).toEqual({
    id: expect.any(String),
    createdByAuthUserId: workspace.authUserId,
    subscription: "expired",
    trialEndDate: null,
    memberStatus: "active",
    onboardingWizardCompletedAt: null,
    isSystemRole: true,
  });
  expect(await activeWorkspaceOf(database, workspace)).toEqual({ session: created.id, lastUsed: created.id });
  await expect(page.getByRole("heading", { name: "Switch workspace", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("ws-first-plan.png"), fullPage: true });
  await switchFromBlockedPage(page, workspace.companyId);

  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(errors).toEqual([]);
});

test("a legacy workspace another administrator set up leaves the login its trial for the first workspace it creates", async ({
  page,
  database,
  workspace,
}) => {
  test.skip(e2eAppMode() !== "cloud", "Plans and the trial exist in the cloud only");
  const name = uniqueWorkspaceName("Hoffmann Beratung");
  const errors = collectPageErrors(page);
  await database.query('UPDATE "Company" SET "createdByAuthUserId"=NULL WHERE id=$1', [workspace.companyId]);
  await addEarlierAdministrator(database, workspace);
  await page.goto("/en/settings/workspaces");
  await clickHydrated(page.getByRole("button", { name: "Create workspace", exact: true }));
  const dialog = await fillCreateWorkspace(page, name);
  await dialog.locator("#create-workspace-terms").click();
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();

  await expect(page).toHaveURL(/\/en\/onboarding\/wizard$/);
  // A new cloud workspace continues at the AI setup step, or at the invite step when AI setup is not configured.
  const stepHeading = (name: string) => page.getByRole("heading", { level: 1, name, exact: true });
  await expect(
    stepHeading(englishMessages.OnboardingWizard.steps.setup.title).or(
      stepHeading(englishMessages.OnboardingWizard.steps.invite.title),
    ),
  ).toBeVisible();
  const [created] = await createdWorkspace(database, name);
  expect(created).toMatchObject({
    createdByAuthUserId: workspace.authUserId,
    subscription: "trial",
    memberStatus: "active",
    onboardingWizardCompletedAt: null,
    isSystemRole: true,
  });
  expect(created.trialEndDate?.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  expect((await activeWorkspaceOf(database, workspace)).session).toBe(created.id);
  expect(errors).toEqual([]);
});

test("a legacy workspace the login set up as its first administrator counts as its trial", async ({
  page,
  database,
  workspace,
}) => {
  test.skip(e2eAppMode() !== "cloud", "Plans and the trial exist in the cloud only");
  const name = uniqueWorkspaceName("Kraus Planung");
  const errors = collectPageErrors(page);
  await database.query('UPDATE "Company" SET "createdByAuthUserId"=NULL WHERE id=$1', [workspace.companyId]);
  await page.goto("/en/settings/workspaces");
  await clickHydrated(page.getByRole("button", { name: "Create workspace", exact: true }));
  const dialog = await fillCreateWorkspace(page, name);
  await expect(dialog).toContainText(englishMessages.Workspaces.billingNote);
  await dialog.locator("#create-workspace-terms").click();
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();

  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(page.getByRole("heading", { level: 1, name: `Choose a plan for ${name}`, exact: true })).toBeVisible();
  const [created] = await createdWorkspace(database, name);
  expect(created).toMatchObject({
    createdByAuthUserId: workspace.authUserId,
    subscription: "expired",
    trialEndDate: null,
    memberStatus: "active",
    isSystemRole: true,
  });
  expect((await activeWorkspaceOf(database, workspace)).session).toBe(created.id);
  expect(errors).toEqual([]);
});

test("a self-hosted workspace is ready to use at once and continues in its onboarding wizard", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(e2eAppMode() !== "self-hosted", "Runs against a server started with APP_MODE=self-hosted");
  const name = uniqueWorkspaceName("Selbst gehostet");
  const errors = collectPageErrors(page);
  await page.goto("/en/settings/workspaces");
  await expect(page.locator(`li[data-workspace-id="${workspace.companyId}"]`)).toContainText("Current");
  await expect(page.getByText(englishMessages.Workspaces.noPlan)).toHaveCount(0);
  await clickHydrated(page.getByRole("button", { name: "Create workspace", exact: true }));
  const dialog = await fillCreateWorkspace(page, name);
  await expect(dialog.locator("#create-workspace-terms")).toHaveCount(0);
  await expect(dialog).not.toContainText(englishMessages.Workspaces.billingNote);
  await page.screenshot({ path: testInfo.outputPath("ws-create-modal-self-hosted.png") });
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();

  await expect(page).toHaveURL(/\/en\/onboarding\/wizard$/);
  // Self-hosted workspaces have no AI setup step: the wizard continues at the invite step.
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.invite.title, exact: true }),
  ).toBeVisible();
  const [created] = await createdWorkspace(database, name);
  expect(created).toMatchObject({
    createdByAuthUserId: workspace.authUserId,
    subscription: "active",
    trialEndDate: null,
    memberStatus: "active",
    onboardingWizardCompletedAt: null,
    isSystemRole: true,
  });
  expect(await activeWorkspaceOf(database, workspace)).toEqual({ session: created.id, lastUsed: created.id });
  expect(errors).toEqual([]);
});
