import type { Page } from "@playwright/test";
import type { Client } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import {
  activeWorkspaceOf,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  openWorkspaceSwitcher,
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
  const errors = collectPageErrors(page);
  await page.goto("/en/dashboard");
  const menu = await openWorkspaceSwitcher(page);
  await menu.getByRole("menuitem", { name: "Create workspace", exact: true }).click();
  const dialog = await fillCreateWorkspace(page, "Steuern 2026");
  await expect(dialog).toContainText(englishMessages.Workspaces.billingNote);
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(dialog).toContainText(englishMessages.Common.errors.termsNotAgreed);
  expect(await createdWorkspace(database, "Steuern 2026")).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("ws-create-modal-terms.png") });
  await dialog.locator("#create-workspace-terms").click();
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();

  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose a plan for Steuern 2026", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(englishMessages.Workspaces.firstPlan.subtitle, { exact: true })).toBeVisible();
  const [created] = await createdWorkspace(database, "Steuern 2026");
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
  const others = page.locator("[data-slot='restricted-workspace-switch']");
  await expect(others.getByRole("heading", { name: "Switch workspace", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ws-first-plan.png"), fullPage: true });
  await clickHydrated(others.getByRole("button", { name: "Browser workspace", exact: true }));

  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(errors).toEqual([]);
});

test("the first workspace a cloud login creates starts its trial in the onboarding wizard", async ({
  page,
  database,
  workspace,
}) => {
  test.skip(e2eAppMode() !== "cloud", "Plans and the trial exist in the cloud only");
  const errors = collectPageErrors(page);
  await database.query('UPDATE "Company" SET "createdByAuthUserId"=NULL WHERE id=$1', [workspace.companyId]);
  await page.goto("/en/settings/workspaces");
  await clickHydrated(page.getByRole("button", { name: "Create workspace", exact: true }));
  const dialog = await fillCreateWorkspace(page, "Hoffmann Beratung");
  await dialog.locator("#create-workspace-terms").click();
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();

  await expect(page).toHaveURL(/\/en\/onboarding\/wizard$/);
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.wiki.title, exact: true }),
  ).toBeVisible();
  const [created] = await createdWorkspace(database, "Hoffmann Beratung");
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

test("a self-hosted workspace is ready to use at once and continues in its onboarding wizard", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(e2eAppMode() !== "self-hosted", "Runs against a server started with APP_MODE=self-hosted");
  const errors = collectPageErrors(page);
  await page.goto("/en/settings/workspaces");
  await expect(page.locator(`li[data-workspace-id="${workspace.companyId}"]`)).toContainText("Current");
  await expect(page.getByText(englishMessages.Workspaces.noPlan)).toHaveCount(0);
  await clickHydrated(page.getByRole("button", { name: "Create workspace", exact: true }));
  const dialog = await fillCreateWorkspace(page, "Selbst gehostet");
  await expect(dialog.locator("#create-workspace-terms")).toHaveCount(0);
  await expect(dialog).not.toContainText(englishMessages.Workspaces.billingNote);
  await page.screenshot({ path: testInfo.outputPath("ws-create-modal-self-hosted.png") });
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();

  await expect(page).toHaveURL(/\/en\/onboarding\/wizard$/);
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.wiki.title, exact: true }),
  ).toBeVisible();
  const [created] = await createdWorkspace(database, "Selbst gehostet");
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
