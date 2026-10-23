import { companyPath } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { openMenu } from "./sidebar";
import { addBrowserWorkspace } from "./workspace";
import { e2eAppMode } from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

test("an own profile edit and a theme switch apply in every workspace of the login", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  const memberships = async () =>
    (
      await database.query<{ firstName: string; theme: string }>(
        'SELECT "firstName",theme FROM "User" WHERE id=ANY($1::text[]) ORDER BY "createdAt"',
        [[workspace.userId, second.userId]],
      )
    ).rows.map((row) => `${row.firstName}/${row.theme}`);
  expect(await memberships()).toEqual(["Browser/system", "Browser/system"]);

  await page.goto(companyPath(workspace.companyId, "/settings/profile"));
  await page.waitForLoadState("networkidle");
  const unsavedChanges = page.locator("[data-slot='unsaved-changes-bar']");
  await expect(async () => {
    await page.locator("#settings-profile-first-name").fill("Renamed");
    await expect(unsavedChanges).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await page.locator("#settings-profile-save").click();
  await expect(unsavedChanges).toHaveCount(0);

  const menu = await openMenu(page, "#nav-personal-menu");
  await menu.getByRole("menuitem", { name: "Theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  await expect.poll(memberships).toEqual(["Renamed/dark", "Renamed/dark"]);
  expect(errors).toEqual([]);
});
