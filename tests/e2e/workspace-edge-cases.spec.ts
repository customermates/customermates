import { randomBytes, randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";
import type { Client } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { collectPageErrors, expect, test } from "./fixtures";
import { addBrowserWorkspace } from "./workspace";
import {
  activeWorkspaceOf,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  expectHydrated,
  openWorkspaceSwitcher,
  setMembershipStatus,
  signInLogin,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

async function organizationNames(database: Client, companyId: string) {
  const { rows } = await database.query<{ name: string }>(
    'SELECT v."textValue" AS name FROM "CrmRecord" r JOIN "RecordValue" v ON v."companyId"=r."companyId" AND v."typeId"=r."typeId" AND v."recordId"=r.id WHERE r."companyId"=$1 AND r."typeId"=$2 AND v."fieldId"=$3 ORDER BY 1',
    [companyId, presetId(companyId, "organization"), presetId(companyId, "organization.name")],
  );
  return rows.map((row) => row.name);
}

async function startOrganization(page: Page, companyId: string, name: string) {
  await page.goto(`/en/records/${presetId(companyId, "organization")}`);
  await clickHydrated(page.locator("#records-add"));
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  return dialog;
}

test("two browsers of one login in different workspaces save records at the same time, each into its own workspace", async ({
  browser,
  page,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await page.goto("/en/dashboard");
  await expectCurrentWorkspace(page, "Browser workspace");
  const other = await signInLogin(browser, database, workspace, testInfo);
  try {
    await other.page.goto("/en/dashboard");
    const menu = await openWorkspaceSwitcher(other.page);
    await menu.locator(`[data-workspace-id="${second.companyId}"]`).click();
    await expect(other.page).toHaveURL(/\/en\/dashboard$/);
    await expectCurrentWorkspace(other.page, "Bergmann Steuern");

    const first = await startOrganization(page, workspace.companyId, "Hansen Logistik");
    const parallel = await startOrganization(other.page, second.companyId, "Bergmann Mandant");
    await Promise.all([
      first.getByRole("button", { name: "Save", exact: true }).click(),
      parallel.getByRole("button", { name: "Save", exact: true }).click(),
    ]);
    await expect(first).not.toBeVisible();
    await expect(parallel).not.toBeVisible();

    expect(await organizationNames(database, workspace.companyId)).toContain("Hansen Logistik");
    expect(await organizationNames(database, workspace.companyId)).not.toContain("Bergmann Mandant");
    expect(await organizationNames(database, second.companyId)).toEqual(["Bergmann Mandant", "Example organization"]);
    await page.reload();
    await expect(page.getByRole("link", { name: "Hansen Logistik", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Bergmann Mandant", exact: true })).toHaveCount(0);
    await other.page.reload();
    await expect(other.page.getByRole("link", { name: "Bergmann Mandant", exact: true })).toBeVisible();
    await expect(other.page.getByRole("link", { name: "Hansen Logistik", exact: true })).toHaveCount(0);
    await expectCurrentWorkspace(page, "Browser workspace");
    await expectCurrentWorkspace(other.page, "Bergmann Steuern");
    expect(other.errors).toEqual([]);
  } finally {
    await other.close();
  }
  expect(errors).toEqual([]);
});

test("switching workspaces with an unsaved workspace name asks first and never saves the draft anywhere", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await page.goto("/en/settings/general");
  const name = page.locator("#settings-general-name");
  await expect(name).toHaveValue("Browser workspace");
  await expectHydrated(name);
  await name.fill("Browser workspace GmbH");

  const discard = page.getByRole("alertdialog", { name: englishMessages.Common.navigationGuard.title, exact: true });
  let menu = await openWorkspaceSwitcher(page);
  await menu.locator(`[data-workspace-id="${second.companyId}"]`).click();
  await expect(discard).toBeVisible();
  await expect(menu).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("ws-switch-unsaved.png"), fullPage: true });
  expect((await activeWorkspaceOf(database, workspace)).session).toBe(workspace.companyId);
  await discard.getByRole("button", { name: englishMessages.Common.actions.cancel, exact: true }).click();
  await expect(discard).toHaveCount(0);
  await expect(page).toHaveURL(/\/en\/settings\/general$/);
  await expect(name).toHaveValue("Browser workspace GmbH");
  expect((await activeWorkspaceOf(database, workspace)).session).toBe(workspace.companyId);

  menu = await openWorkspaceSwitcher(page);
  await menu.locator(`[data-workspace-id="${second.companyId}"]`).click();
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: englishMessages.Common.actions.discard, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Bergmann Steuern");
  expect((await activeWorkspaceOf(database, workspace)).session).toBe(second.companyId);
  const names = await database.query<{ id: string; name: string }>(
    'SELECT id,name FROM "Company" WHERE id=ANY($1) ORDER BY name',
    [[workspace.companyId, second.companyId]],
  );
  expect(names.rows).toEqual([
    { id: second.companyId, name: "Bergmann Steuern" },
    { id: workspace.companyId, name: "Browser workspace" },
  ]);
  expect(errors).toEqual([]);
});

test("an invitation to a workspace that deactivated the login explains it and offers only another account", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  const adminEmail = `clara-${randomUUID()}@example.test`;
  const adminId = randomUUID();
  const role = await database.query<{ id: string }>(
    'SELECT id FROM "UserRole" WHERE "companyId"=$1 AND "isSystemRole"=true LIMIT 1',
    [second.companyId],
  );
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","updatedAt") VALUES ($1,$2,$3,$4,\'Clara\',\'Admin\',\'active\',true,NOW(),NOW())',
    [adminId, second.companyId, role.rows[0].id, adminEmail],
  );
  await setMembershipStatus(database, second, "inactive");
  const token = randomBytes(24).toString("base64url");
  await database.query(
    'INSERT INTO "InviteToken" (id,token,"companyId","createdById","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,NOW()+interval \'7 days\',NOW())',
    [randomUUID(), token, second.companyId, adminId],
  );

  await page.goto(`/en/invitation/${token}`);
  await expect(page).toHaveURL(/\/en\/auth\/invitation\?intent=/);
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.WorkspaceInvitation.inactive.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("An administrator deactivated your access to Bergmann Steuern. Ask them to reactivate it.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Join workspace", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: englishMessages.WorkspaceInvitation.otherAccount, exact: true }),
  ).toBeVisible();
  const memberships = await database.query<{ status: string }>(
    'SELECT status::text FROM "User" WHERE "companyId"=$1 AND id=$2',
    [second.companyId, second.userId],
  );
  expect(memberships.rows).toEqual([{ status: "inactive" }]);
  expect((await activeWorkspaceOf(database, workspace)).session).toBe(workspace.companyId);
  expect(errors).toEqual([]);
});

test("switching from the command palette over a record dialog with an unsaved draft asks first and keeps the draft", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  const draft = await startOrganization(page, workspace.companyId, "Ungespeicherte Firma");
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.locator("#global-search-input input");
  const palette = page.getByRole("dialog").filter({ has: page.locator("#global-search-input") });
  await expect(search).toBeVisible();
  await expect(palette).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("ws-palette-over-draft.png"), fullPage: true });
  await search.fill("Switch workspace");
  await palette.getByRole("option", { name: "Switch workspace…", exact: true }).click();
  await palette.getByRole("option").filter({ hasText: "Bergmann Steuern" }).click();

  const discard = page.getByRole("alertdialog", { name: englishMessages.Common.navigationGuard.title, exact: true });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: englishMessages.Common.actions.cancel, exact: true }).click();
  await expect(discard).toHaveCount(0);
  await expect(draft.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Ungespeicherte Firma");
  expect((await activeWorkspaceOf(database, workspace)).session).toBe(workspace.companyId);

  await page.keyboard.press("ControlOrMeta+k");
  await search.fill("Switch workspace");
  await palette.getByRole("option", { name: "Switch workspace…", exact: true }).click();
  await palette.getByRole("option").filter({ hasText: "Bergmann Steuern" }).click();
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: englishMessages.Common.actions.discard, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Bergmann Steuern");
  expect((await activeWorkspaceOf(database, workspace)).session).toBe(second.companyId);
  expect(await organizationNames(database, workspace.companyId)).not.toContain("Ungespeicherte Firma");
  expect(await organizationNames(database, second.companyId)).not.toContain("Ungespeicherte Firma");
  expect(errors).toEqual([]);
});
