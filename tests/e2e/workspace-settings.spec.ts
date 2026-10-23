import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { mintApiKey } from "./api-key";
import { addBrowserWorkspace } from "./workspace";
import {
  activeWorkspaceOf,
  addAdministrator,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  giveMemberRole,
  openWorkspaceSwitcher,
  setActiveWorkspace,
  switcherWorkspaces,
} from "./workspace-switching";
import { appPath, appUrlPattern } from "./app-paths";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

test("renaming the current workspace updates the switcher and the workspaces list", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await page.goto(appPath(workspace.slug, "/settings/general"));
  const name = page.locator("#settings-general-name");
  await expect(name).toHaveValue("Browser workspace");
  await expect(page.getByText(englishMessages.Workspaces.nameDescription, { exact: true })).toBeVisible();
  const unsavedChanges = page.locator("[data-slot='unsaved-changes-bar']");
  await expect(async () => {
    await name.fill("Northwind Labs");
    await expect(unsavedChanges).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await page.locator("#settings-general-save").click();
  await expect(unsavedChanges).toHaveCount(0);

  await expect
    .poll(
      async () =>
        (await database.query<{ name: string }>('SELECT name FROM "Company" WHERE id=$1', [workspace.companyId]))
          .rows[0]?.name,
    )
    .toBe("Northwind Labs");
  await expectCurrentWorkspace(page, "Northwind Labs");
  await page.goto(appPath(workspace.slug, "/settings/workspaces"));
  await expect(page.locator(`li[data-workspace-id="${workspace.companyId}"]`)).toContainText("Northwind Labs");
  await expect(page.locator(`li[data-workspace-id="${workspace.companyId}"]`)).toContainText("Current");
  expect(errors).toEqual([]);
});

test("a member who cannot manage the workspace sees its name read-only and can still leave", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await giveMemberRole(database, second, "Assistant");
  await setActiveWorkspace(database, workspace, second.companyId);
  await page.goto(appPath(second.slug, "/settings/general"));
  const name = page.locator("#settings-general-name");
  await expect(name).toHaveValue("Bergmann Steuern");
  await expect(name).toHaveAttribute("readonly", "");
  await expect(page.getByText(englishMessages.Workspaces.renameReadOnly, { exact: true })).toBeVisible();
  await expect(page.locator("#settings-general-leave")).toBeVisible();

  await clickHydrated(page.locator("#settings-general-leave"));
  const confirm = page.getByRole("alertdialog", { name: "Leave Bergmann Steuern?" });
  await confirm.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Browser workspace");
  expect(errors).toEqual([]);
});

test("leaving the current workspace lands in another one and revokes the API keys bound to it", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await addAdministrator(database, second.companyId, `clara-${second.userId}@example.test`);
  const { id: keptKey } = await mintApiKey(database, workspace, "Browser bookkeeping");
  await setActiveWorkspace(database, workspace, second.companyId);
  const { id: revokedKey } = await mintApiKey(
    database,
    { authUserId: workspace.authUserId, companyId: second.companyId },
    "Bergmann bookkeeping",
  );
  const keyWorkspaces = async () =>
    (
      await database.query<{ id: string; companyId: string }>(
        'SELECT id,"companyId" FROM "Apikey" WHERE id=ANY($1::text[]) ORDER BY name',
        [[keptKey, revokedKey]],
      )
    ).rows;
  expect(await keyWorkspaces()).toEqual([
    { id: revokedKey, companyId: second.companyId },
    { id: keptKey, companyId: workspace.companyId },
  ]);

  await page.goto(appPath(second.slug, "/settings/workspaces"));
  const rows = page.locator("li[data-workspace-id]");
  await expect(rows).toHaveCount(2);
  await expect(page.locator("#settings-workspaces-leave")).toHaveCount(1);
  await expect(page.locator(`li[data-workspace-id="${second.companyId}"] #settings-workspaces-leave`)).toBeVisible();
  await expect(
    page
      .locator(`li[data-workspace-id="${workspace.companyId}"]`)
      .getByRole("button", { name: "Switch to Browser workspace", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ws-settings-workspaces.png"), fullPage: true });
  await clickHydrated(page.locator("#settings-workspaces-leave"));
  const confirm = page.getByRole("alertdialog", { name: "Leave Bergmann Steuern?" });
  await expect(confirm).toContainText(englishMessages.Workspaces.leaveConfirmDescription);
  await confirm.getByRole("button", { name: "Leave", exact: true }).click();

  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"));
  await expectCurrentWorkspace(page, "Browser workspace");
  const membership = await database.query<{ status: string; left: boolean }>(
    'SELECT status::text,"leftAt" IS NOT NULL AS left FROM "User" WHERE id=$1',
    [second.userId],
  );
  expect(membership.rows).toEqual([{ status: "inactive", left: true }]);
  expect(await keyWorkspaces()).toEqual([{ id: keptKey, companyId: workspace.companyId }]);
  expect(await activeWorkspaceOf(database, workspace)).toEqual({ lastUsed: workspace.companyId });
  const menu = await openWorkspaceSwitcher(page);
  await expect(switcherWorkspaces(menu)).toHaveText([/Browser workspace/]);
  expect(errors).toEqual([]);
});

test("the API keys page lists only the keys of the current workspace and names it", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await mintApiKey(database, workspace, "Browser bookkeeping");
  await setActiveWorkspace(database, workspace, second.companyId);
  await mintApiKey(database, { authUserId: workspace.authUserId, companyId: second.companyId }, "Bergmann bookkeeping");

  await page.goto(appPath(second.slug, "/settings/api-keys"));
  await expect(
    page.getByText("These keys only access the Bergmann Steuern workspace.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Bergmann bookkeeping", { exact: true })).toBeVisible();
  await expect(page.getByText("Browser bookkeeping", { exact: true })).toHaveCount(0);

  const menu = await openWorkspaceSwitcher(page);
  await menu.locator(`[data-workspace-id="${workspace.companyId}"]`).click();
  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"));
  await page.goto(appPath(workspace.slug, "/settings/api-keys"));
  await expect(
    page.getByText("These keys only access the Browser workspace workspace.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Browser bookkeeping", { exact: true })).toBeVisible();
  await expect(page.getByText("Bergmann bookkeeping", { exact: true })).toHaveCount(0);

  await clickHydrated(page.locator("#settings-api-keys-generate"));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(englishMessages.ApiKeyModal.addTitle);
  await dialog.locator("#api-key-option-standard").click();
  await dialog.locator("#api-key-name").fill("Browser laptop");
  await dialog.locator("#api-key-save").click();
  await expect(dialog.getByText(englishMessages.ApiKeyModal.keyCreated, { exact: true })).toBeVisible();
  const created = await database.query<{ companyId: string | null }>(
    'SELECT "companyId" FROM "Apikey" WHERE "referenceId"=$1 AND name=$2',
    [workspace.authUserId, "Browser laptop"],
  );
  expect(created.rows).toEqual([{ companyId: workspace.companyId }]);
  expect(errors).toEqual([]);
});

test("the only admin of a workspace cannot leave it, which both pages say before the dialog opens", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await page.goto(appPath(workspace.slug, "/settings/general"));
  await expect(page.locator("#settings-general-name")).toHaveValue("Browser workspace");
  for (const [path, id, label] of [
    [appPath(workspace.slug, "/settings/general"), "#settings-general-leave", englishMessages.Workspaces.leave],
    [
      appPath(workspace.slug, "/settings/workspaces"),
      "#settings-workspaces-leave",
      englishMessages.Workspaces.leaveShort,
    ],
  ]) {
    await page.goto(path);
    const leave = page.locator(id);
    await expect(leave).toBeDisabled();
    const blocked = page.getByRole("button", { name: label, exact: true }).and(page.locator("[aria-disabled='true']"));
    await expect(blocked).toBeVisible();
    await blocked.focus();
    await expect(page.getByRole("tooltip")).toContainText(englishMessages.Common.errors.workspaceLastAdmin);
    const reason = page.locator(`${id}-reason`);
    await expect(reason).toHaveText(englishMessages.Common.errors.workspaceLastAdmin);
    if (testInfo.project.use.isMobile) await expect(reason).toBeVisible();
    else await expect(reason).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`ws-settings-leave-blocked${id.replace("#", "-")}.png`) });
    await leave.click({ force: true });
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  }
  const membership = await database.query<{ status: string; left: boolean }>(
    'SELECT status::text,"leftAt" IS NOT NULL AS left FROM "User" WHERE id=$1',
    [workspace.userId],
  );
  expect(membership.rows).toEqual([{ status: "active", left: false }]);
  expect(errors).toEqual([]);
});
