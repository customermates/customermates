import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";
import type { Client } from "pg";
import type { BrowserWorkspace } from "./workspace";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { moveWithKeyboard } from "./keyboard-drag";
import { uniqueWorkspaceName } from "./workspace-names";
import { clickHydrated, e2eAppMode } from "./workspace-switching";
import { appPath, appUrlPattern, workspaceSlugOf } from "./app-paths";

test.skip(e2eAppMode() !== "cloud", "The guided workspace setup runs in the cloud only");

// A legacy workspace another administrator set up leaves the login its trial, so the new workspace opens its wizard.
async function openSetupOfNewWorkspace(page: Page, database: Client, workspace: BrowserWorkspace, name: string) {
  await database.query('UPDATE "Company" SET "createdByAuthUserId"=NULL WHERE id=$1', [workspace.companyId]);
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","createdAt","updatedAt") SELECT $1,"companyId","roleId",$2,\'Clara\',\'Founder\',\'active\',true,NOW(),"createdAt" - interval \'1 day\',NOW() FROM "User" WHERE id=$3',
    [randomUUID(), `clara-${randomUUID()}@example.test`, workspace.userId],
  );
  await page.goto(appPath(workspace.slug, "/settings/workspaces"));
  await clickHydrated(page.getByRole("button", { name: "Create workspace", exact: true }));
  const dialog = page.getByRole("dialog", { name: "Create workspace" });
  await dialog.locator("#create-workspace-name").fill(name);
  await dialog.locator("#create-workspace-terms").click();
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/en(?:\/w\/[a-z0-9-]+)?\/onboarding\/wizard$/);
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.setup.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: englishMessages.OnboardingWizard.next, exact: true })).toBeEnabled();
  const { rows } = await database.query<{ id: string }>('SELECT id FROM "Company" WHERE name=$1', [name]);
  return rows[0].id;
}

function question(page: Page, id: string) {
  return page.locator(`[aria-labelledby="setup-question-${id}"]`);
}

async function entries(page: Page) {
  return question(page, "offerings")
    .locator("ol input:not([type=number])")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

test("Next marks the missing setup answers and list answers reorder by dragging", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  await openSetupOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Drag Studio"));
  const next = page.getByRole("button", { name: englishMessages.OnboardingWizard.next, exact: true });

  await next.click();
  const purpose = question(page, "purpose");
  await expect(purpose).toHaveAttribute("data-invalid", "true");
  await expect(page.getByText(englishMessages.Common.errors.mustNotBeBlank, { exact: true })).toHaveCount(1);
  await expect(purpose.getByText(englishMessages.Common.errors.mustNotBeBlank, { exact: true })).toHaveCount(0);
  await expect(purpose.getByRole("checkbox", { name: "Clients and sales", exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator('[data-invalid="true"] button, [data-invalid="true"] input').first()).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("setup-next-validation.png"), fullPage: true });
  await purpose.getByRole("checkbox", { name: "Clients and sales", exact: true }).click();
  await expect(purpose).not.toHaveAttribute("data-invalid", "true");

  const offerings = question(page, "offerings");
  await offerings.getByRole("button", { name: englishMessages.WorkspaceSetup.interview.addEntry }).click();
  await offerings.getByRole("button", { name: englishMessages.WorkspaceSetup.interview.addEntry }).click();
  await offerings.getByRole("textbox", { name: "Entry 1", exact: true }).fill("Audit");
  await offerings.getByRole("textbox", { name: "Entry 2", exact: true }).fill("Retainer");
  await expect(offerings.getByRole("button", { name: /^Move (up|down)/ })).toHaveCount(0);
  await expect(offerings.locator("ol > li").first().locator(":scope > :last-child")).toHaveAccessibleName(
    /^Drag to reorder/,
  );

  const handles = offerings.getByRole("button", { name: /^Drag to reorder/ });
  const from = await handles.nth(1).boundingBox();
  const to = await handles.nth(0).boundingBox();
  if (!from || !to) throw new Error("The drag handles have no position.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1)
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y - from.y - 6) * step) / 10);
  await page.mouse.up();
  await expect.poll(() => entries(page)).toEqual(["Retainer", "Audit"]);

  await moveWithKeyboard(page, handles.nth(0), "ArrowDown");
  await expect.poll(() => entries(page)).toEqual(["Audit", "Retainer"]);
  await page.screenshot({ path: testInfo.outputPath("setup-drag-reorder.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("starting with an empty workspace skips the guided setup after a confirmation", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const companyId = await openSetupOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Empty Studio"));

  await page.getByRole("button", { name: englishMessages.WorkspaceSetup.empty.action, exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: englishMessages.WorkspaceSetup.empty.title });
  await expect(confirm).toContainText(englishMessages.WorkspaceSetup.empty.description);
  await page.screenshot({ path: testInfo.outputPath("setup-empty-confirm.png") });
  await confirm.getByRole("button", { name: englishMessages.WorkspaceSetup.empty.confirm, exact: true }).click();

  await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, companyId), "/dashboard$"));
  await expect(page.getByRole("button", { name: "Create list" }).first()).toBeVisible();
  const lists = await database.query('SELECT 1 FROM "RecordTypeDefinition" WHERE "companyId"=$1', [companyId]);
  expect(lists.rowCount).toBe(0);
  const { rows } = await database.query<{ wizard: Date | null; setup: Date | null }>(
    'SELECT "onboardingWizardCompletedAt" AS wizard,"onboardingWikiStepCompletedAt" AS setup FROM "User" WHERE "companyId"=$1',
    [companyId],
  );
  expect(rows).toEqual([{ wizard: expect.any(Date), setup: expect.any(Date) }]);
  await page.screenshot({ path: testInfo.outputPath("setup-empty-dashboard.png"), fullPage: true });
  expect(errors).toEqual([]);
});
