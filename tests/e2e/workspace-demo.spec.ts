import { SYNTHETIC_SEED_USER } from "../../core/config/synthetic-seed-user";
import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import {
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  openWorkspaceSwitcher,
  switcherWorkspaces,
} from "./workspace-switching";

test.skip(e2eAppMode() !== "demo", "Runs against a server started with APP_MODE=demo");

test("the demo switches between the seeded workspaces but cannot create, rename or leave one", async ({
  page,
  database,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const login = await database.query<{ id: string; companyId: string | null }>(
    'SELECT id,"companyId" FROM "AuthUser" WHERE email=$1',
    [SYNTHETIC_SEED_USER.email],
  );
  const { id: authUserId, companyId: lastUsed } = login.rows[0];
  const memberships = await database.query<{ companyId: string; name: string }>(
    'SELECT u."companyId",c.name FROM "User" u JOIN "Company" c ON c.id=u."companyId" WHERE u.email=$1 AND u."leftAt" IS NULL ORDER BY u."createdAt"',
    [SYNTHETIC_SEED_USER.email],
  );
  expect(memberships.rows.map((membership) => membership.name)).toEqual(["Northwind Labs", "Bergmann Steuern"]);
  const [northwind, bergmann] = memberships.rows;
  await database.query('UPDATE "AuthUser" SET "companyId"=$2 WHERE id=$1', [authUserId, northwind.companyId]);
  try {
    await page.goto("/en/settings/workspaces");
    await expect(page.locator(`li[data-workspace-id="${northwind.companyId}"]`)).toContainText("Current");
    await expect(page.getByRole("button", { name: "Create workspace", exact: true })).toHaveCount(0);
    await expect(page.locator("#settings-workspaces-leave")).toHaveCount(0);
    const menu = await openWorkspaceSwitcher(page);
    await expect(switcherWorkspaces(menu)).toHaveText([/Northwind Labs/, /Bergmann Steuern/]);
    await expect(menu.getByRole("menuitem", { name: "Create workspace", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("ws-demo-switcher.png") });
    await menu.locator(`[data-workspace-id="${bergmann.companyId}"]`).click();

    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expectCurrentWorkspace(page, "Bergmann Steuern");
    await page.goto("/en/settings/general");
    const name = page.locator("#settings-general-name");
    await expect(name).toHaveValue("Bergmann Steuern");
    await expect(name).toHaveAttribute("readonly", "");
    await expect(page.getByRole("heading", { name: englishMessages.Workspaces.dangerZone })).toHaveCount(0);
    await expect(page.locator("#settings-general-leave")).toHaveCount(0);

    await page.goto("/en/settings/workspaces");
    await clickHydrated(page.getByRole("button", { name: "Switch to Northwind Labs", exact: true }));
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expectCurrentWorkspace(page, "Northwind Labs");
  } finally {
    await database.query('UPDATE "AuthUser" SET "companyId"=$2 WHERE id=$1', [authUserId, lastUsed]);
  }
  expect(errors).toEqual([]);
});
