import { SYNTHETIC_SEED_USER } from "../../core/config/synthetic-seed-user";
import { SOLUTION_CATALOG, SOLUTION_DATA_LOCALES } from "../../core/solutions/solution-catalog";
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

const TEAM_WORKSPACE_ID = SOLUTION_CATALOG.find(({ id }) => id === "smb")?.companyIds.en;
const ENGLISH_WORKSPACE_IDS = new Set(SOLUTION_CATALOG.map(({ companyIds }) => companyIds.en));

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  // Max belongs to every demo workspace: one per solution and data locale.
  expect(memberships.rows.map(({ companyId }) => companyId).sort()).toEqual(
    SOLUTION_CATALOG.flatMap(({ companyIds }) => SOLUTION_DATA_LOCALES.map((locale) => companyIds[locale])).sort(),
  );
  const team = memberships.rows.find(({ companyId }) => companyId === TEAM_WORKSPACE_ID);
  // In /en the switcher lists the workspaces with English data (the current one always stays listed).
  const english = memberships.rows.filter(({ companyId }) => ENGLISH_WORKSPACE_IDS.has(companyId));
  const other = english.find(({ companyId }) => companyId !== TEAM_WORKSPACE_ID);
  if (!team || !other) throw new Error("The demo memberships lack the team workspace or another English workspace");
  await database.query('UPDATE "AuthUser" SET "companyId"=$2 WHERE id=$1', [authUserId, team.companyId]);
  try {
    await page.goto("/en/settings/workspaces");
    await expect(page.locator(`li[data-workspace-id="${team.companyId}"]`)).toContainText("Current");
    // The settings list reads every membership; only the switcher filters by the data locale.
    await expect(page.locator("li[data-workspace-id]")).toHaveCount(memberships.rows.length);
    await expect(page.getByRole("button", { name: "Create workspace", exact: true })).toHaveCount(0);
    await expect(page.locator("#settings-workspaces-leave")).toHaveCount(0);
    const menu = await openWorkspaceSwitcher(page);
    await expect(switcherWorkspaces(menu)).toHaveText(english.map(({ name }) => new RegExp(escapeRegExp(name))));
    await expect(menu.getByRole("menuitem", { name: "Create workspace", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("ws-demo-switcher.png") });
    await menu.locator(`[data-workspace-id="${other.companyId}"]`).click();

    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expectCurrentWorkspace(page, other.name);
    await page.goto("/en/settings/general");
    const name = page.locator("#settings-general-name");
    await expect(name).toHaveValue(other.name);
    await expect(name).toHaveAttribute("readonly", "");
    await expect(page.getByRole("heading", { name: englishMessages.Workspaces.dangerZone })).toHaveCount(0);
    await expect(page.locator("#settings-general-leave")).toHaveCount(0);

    await page.goto("/en/settings/workspaces");
    await clickHydrated(page.getByRole("button", { name: `Switch to ${team.name}`, exact: true }));
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expectCurrentWorkspace(page, team.name);
  } finally {
    await database.query('UPDATE "AuthUser" SET "companyId"=$2 WHERE id=$1', [authUserId, lastUsed]);
  }
  expect(errors).toEqual([]);
});
