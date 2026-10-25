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
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.setup.startTitle, exact: true }),
  ).toBeVisible();
  const { rows } = await database.query<{ id: string }>('SELECT id FROM "Company" WHERE name=$1', [name]);
  return rows[0].id;
}

function question(page: Page, id: string) {
  return page.locator(`[aria-labelledby="setup-question-${id}"]`);
}

async function entries(page: Page) {
  return question(page, "mainSteps")
    .locator("ol input:not([type=number])")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

const setup = englishMessages.WorkspaceSetup;

test("the setup recommends the website, then offers the questions, with starting empty as the quietest choice", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  await openSetupOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Choice Studio"));

  const website = page.getByText(setup.start.website.title, { exact: true });
  const questions = page.getByRole("button", { name: new RegExp(`^${setup.start.questions.title}`) });
  const empty = page.getByRole("button", { name: setup.empty.action, exact: true });
  await expect(page.getByText(setup.start.website.recommended, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: setup.start.website.action, exact: true })).toBeDisabled();
  const tops = await Promise.all([website, questions, empty].map(async (target) => (await target.boundingBox())?.y));
  expect(tops.every((top, index) => top !== undefined && (index === 0 || top > (tops[index - 1] ?? 0)))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("setup-start.png"), fullPage: true });

  await page.locator("#setup-website").fill("example.com");
  await expect(page.getByRole("button", { name: setup.start.website.action, exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("the questions mark missing answers, suggest steps that reorder by dragging, and ask about pricing with clients", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  await openSetupOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Drag Studio"));
  await clickHydrated(page.getByRole("button", { name: new RegExp(`^${setup.start.questions.title}`) }));
  const showPlan = page.getByRole("button", { name: setup.interview.showPlan, exact: true });
  await expect(showPlan).toBeEnabled();
  await expect(question(page, "pricing")).toHaveCount(0);
  await expect(question(page, "mainSteps")).toHaveCount(0);

  await showPlan.click();
  const workWith = question(page, "workWith");
  await expect(workWith).toHaveAttribute("data-invalid", "true");
  await expect(page.getByText(englishMessages.Common.errors.mustNotBeBlank, { exact: true })).toHaveCount(1);
  await expect(page.locator('[data-invalid="true"] button, [data-invalid="true"] input').first()).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("setup-questions-validation.png"), fullPage: true });

  await workWith.getByRole("radio", { name: setup.options.workWith.clients, exact: true }).click();
  await expect(workWith).not.toHaveAttribute("data-invalid", "true");
  await question(page, "purpose").getByRole("checkbox", { name: setup.options.purpose.deals, exact: true }).click();
  await expect(question(page, "pricing")).toBeVisible();
  await expect.poll(() => entries(page)).toEqual(setup.suggestedSteps.dealsClients.split("|"));

  const steps = question(page, "mainSteps");
  const handles = steps.getByRole("button", { name: /^Drag to reorder/ });
  const from = await handles.nth(1).boundingBox();
  const to = await handles.nth(0).boundingBox();
  if (!from || !to) throw new Error("The drag handles have no position.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1)
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y - from.y - 6) * step) / 10);
  await page.mouse.up();
  const [first, second, ...rest] = setup.suggestedSteps.dealsClients.split("|");
  await expect.poll(() => entries(page)).toEqual([second, first, ...rest]);

  await moveWithKeyboard(page, handles.nth(0), "ArrowDown");
  await expect.poll(() => entries(page)).toEqual([first, second, ...rest]);
  await page.screenshot({ path: testInfo.outputPath("setup-questions.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("starting with an empty workspace skips only the guided setup and continues to the team and AI steps", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const companyId = await openSetupOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Empty Studio"));

  await page.getByRole("button", { name: setup.empty.action, exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: setup.empty.title });
  await expect(confirm).toContainText(setup.empty.description);
  await page.screenshot({ path: testInfo.outputPath("setup-empty-confirm.png") });
  await confirm.getByRole("button", { name: setup.empty.confirm, exact: true }).click();

  const steps = englishMessages.OnboardingWizard.steps;
  await expect(page.getByRole("heading", { level: 1, name: steps.invite.title, exact: true })).toBeVisible();
  const { rows: afterSetup } = await database.query<{ wizard: Date | null; setup: Date | null }>(
    'SELECT "onboardingWizardCompletedAt" AS wizard,"onboardingWikiStepCompletedAt" AS setup FROM "User" WHERE "companyId"=$1',
    [companyId],
  );
  expect(afterSetup).toEqual([{ wizard: null, setup: expect.any(Date) }]);
  await page.getByRole("button", { name: englishMessages.OnboardingWizard.next, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: steps.ai.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: englishMessages.OnboardingWizard.finish, exact: true }).click();

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
