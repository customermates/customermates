import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";
import type { Client } from "pg";
import type { BrowserWorkspace } from "./workspace";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { moveWithKeyboard } from "./keyboard-drag";
import { uniqueWorkspaceName } from "./workspace-names";
import { clickHydrated, e2eAppMode } from "./workspace-switching";
import { openGoalOfNewWorkspace } from "./workspace-setup";
import { appPath, appUrlPattern, workspaceSlugOf } from "./app-paths";

test.skip(e2eAppMode() !== "cloud", "The guided workspace setup runs in the cloud only");

async function openSetupOfNewWorkspace(page: Page, database: Client, workspace: BrowserWorkspace, name: string) {
  const companyId = await openGoalOfNewWorkspace(page, database, workspace, name);
  await expect(page.getByRole("radio", { name: new RegExp(`^${goal.agent.title}`) })).toBeChecked();
  await clickHydrated(page.getByRole("radio", { name: new RegExp(`^${goal.workspace.title}`) }));
  await clickHydrated(page.locator("#onboarding-goal-continue"));
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.template.title, exact: true }),
  ).toBeVisible();
  await clickHydrated(page.locator("#onboarding-template-none"));
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.setup.startTitle, exact: true }),
  ).toBeVisible();
  return companyId;
}

async function funnelEvents(database: Client, companyId: string) {
  const { rows } = await database.query<{ type: string; job: string | null }>(
    'SELECT type::text, job::text FROM "CompanyFunnelEvent" WHERE "companyId"=$1 ORDER BY "occurredAt"',
    [companyId],
  );
  return rows;
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
const goal = englishMessages.OnboardingWizard.goal;
const ONBOARDING_CONNECT_KEY = "customermates:onboarding-connect";

test("the setup offers the website and the questions as two cards, with starting empty as the quiet footnote", async ({
  page,
  database,
  workspace,
  isMobile,
}, testInfo) => {
  const errors = collectPageErrors(page);
  await openSetupOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Choice Studio"));

  const choices = page.getByRole("group", { name: setup.start.optionsLabel, exact: true });
  const website = choices.getByRole("button", { name: new RegExp(`^${setup.start.website.title}`) });
  const questions = choices.getByRole("button", { name: new RegExp(`^${setup.start.questions.title}`) });
  const empty = page.getByRole("button", { name: setup.empty.action, exact: true });
  await expect(website).toContainText(setup.start.website.recommended);
  await expect(website).toContainText(setup.start.website.note);
  await expect(questions).toContainText(setup.start.questions.note);
  await expect(page.getByText(setup.start.emptyPrompt, { exact: false })).toBeVisible();
  await expect(page.locator("#setup-website")).toHaveCount(0);
  const [websiteBox, questionsBox, emptyBox] = await Promise.all(
    [website, questions, empty].map((target) => target.boundingBox()),
  );
  if (!websiteBox || !questionsBox || !emptyBox) throw new Error("The setup choices must be visible");
  if (isMobile) {
    expect(questionsBox.y).toBeGreaterThan(websiteBox.y + websiteBox.height);
    expect(Math.abs(websiteBox.x - questionsBox.x)).toBeLessThan(1);
  } else expect(Math.abs(websiteBox.y - questionsBox.y)).toBeLessThan(1);
  expect(emptyBox.y).toBeGreaterThan(Math.max(websiteBox.y + websiteBox.height, questionsBox.y + questionsBox.height));
  await page.screenshot({ path: testInfo.outputPath("setup-start.png"), fullPage: true });

  await clickHydrated(website);
  await expect(page.locator("#setup-website")).toBeFocused();
  const read = page.getByRole("button", { name: setup.start.website.action, exact: true });
  await expect(read).toBeDisabled();
  await page.locator("#setup-website").fill("example.com");
  await expect(read).toBeEnabled();
  await page
    .locator("button:not(#onboarding-back)", { hasText: new RegExp(`^${englishMessages.Common.actions.back}$`) })
    .click();
  await expect(page.locator("#setup-website")).toHaveCount(0);
  await expect(website).toBeFocused();
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
  await expect.poll(() => entries(page)).toEqual(setup.suggestedSteps.dealsClients);

  const steps = question(page, "mainSteps");
  await steps.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const handles = steps.getByRole("button", { name: /^Drag to reorder/ });
  const from = await handles.nth(1).boundingBox();
  const to = await handles.nth(0).boundingBox();
  if (!from || !to) throw new Error("The drag handles have no position.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1)
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y - from.y - 6) * step) / 10);
  await page.mouse.up();
  const [first, second, ...rest] = setup.suggestedSteps.dealsClients;
  await expect.poll(() => entries(page)).toEqual([second, first, ...rest]);

  await moveWithKeyboard(page, handles.nth(0), "ArrowDown");
  await expect.poll(() => entries(page)).toEqual([first, second, ...rest]);
  await page.screenshot({ path: testInfo.outputPath("setup-questions.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("the questions take a contact list as Excel 97-2003 (.xls), Excel or CSV", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  await openSetupOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Upload Studio"));
  await clickHydrated(page.getByRole("button", { name: new RegExp(`^${setup.start.questions.title}`) }));
  const existingData = question(page, "existingData");
  await existingData.scrollIntoViewIfNeeded();
  await existingData.getByRole("radio", { name: setup.options.existingData.spreadsheet, exact: true }).click();
  const input = page.locator("#setup-spreadsheet");
  expect((await input.getAttribute("accept"))?.split(",")).toEqual(expect.arrayContaining([".csv", ".xlsx", ".xls"]));
  for (const file of [
    "legacy-biff8.xls",
    "libreoffice.xlsx",
    "semicolon-macroman.csv",
    "namespace-contacts-default.xlsx",
    "namespace-contacts-prefixed.xlsx",
  ]) {
    await input.setInputFiles({
      name: file,
      mimeType: "application/vnd.ms-excel",
      buffer: readFileSync(`tests/fixtures/spreadsheet-import/${file}`),
    });
    await expect(page.getByText(file, { exact: true })).toBeVisible();
    await expect(page.getByText(setup.interview.uploadReady, { exact: true })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: file })).toHaveCount(0);
  }
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

test("a new workspace offers the own agent first, Mate second and starting empty as the quiet footer", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  await openGoalOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Choice Order"));

  const options = page.getByRole("radiogroup", { name: goal.optionsLabel, exact: true });
  const radios = options.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(radios.nth(0)).toHaveAccessibleName(new RegExp(`^${goal.agent.title}`));
  await expect(radios.nth(0)).toBeChecked();
  await expect(page.locator('label[for="onboarding-goal-agent"]')).toContainText(goal.recommended);
  await expect(radios.nth(1)).toHaveAccessibleName(new RegExp(`^${goal.workspace.title}`));
  await expect(radios.nth(1)).not.toBeChecked();
  await expect(page.locator("#onboarding-goal-empty")).toHaveText(setup.empty.action);
  const [agentBox, mateBox, emptyBox] = await Promise.all(
    [page.locator('label[for="onboarding-goal-agent"]'), page.locator('label[for="onboarding-goal-workspace"]'), page.locator("#onboarding-goal-empty")].map(
      (target) => target.boundingBox(),
    ),
  );
  if (!agentBox || !mateBox || !emptyBox) throw new Error("The setup choices must be visible");
  expect(mateBox.y).toBeGreaterThan(agentBox.y + agentBox.height - 1);
  expect(emptyBox.y).toBeGreaterThan(mateBox.y + mateBox.height - 1);
  await page.screenshot({ path: testInfo.outputPath("goal-choice-order.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("choosing Mate records the choice and a reload resumes on the template step", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const companyId = await openSetupOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Goal Studio"));

  expect(await funnelEvents(database, companyId)).toEqual([{ type: "jobSelected", job: "workspace" }]);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.template.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("goal-resumes-template.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("the signup job preselects following up, which writes the job playbook and leads to connecting LinkedIn first", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const companyId = await openGoalOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Follow Studio"));
  await database.query(
    'INSERT INTO "CompanySignupSource" (id,"companyId",job,"landingPath","capturedAt") VALUES ($1,$2,\'followup\',\'/en/for/consultants\',NOW())',
    [randomUUID(), companyId],
  );
  await page.reload();

  const followup = page.getByRole("radio", { name: new RegExp(`^${goal.followup.title}`) });
  await expect(followup).toBeChecked();
  await expect(page.locator('label[for="onboarding-goal-followup"]')).toContainText(goal.suggested);
  await page.screenshot({ path: testInfo.outputPath("goal-step.png"), fullPage: true });
  await clickHydrated(page.locator("#onboarding-goal-continue"));

  const steps = englishMessages.OnboardingWizard.steps;
  const playbooks = englishMessages.OnboardingPlaybooks;
  await expect(page.getByRole("heading", { level: 1, name: steps.playbook.title, exact: true })).toBeVisible();
  const consultants = page.getByRole("radio", { name: new RegExp(`^${playbooks.consultants.label}`) });
  await expect(consultants).toBeChecked();
  await expect(page.locator('label[for="onboarding-playbook-consultants"]')).toContainText(goal.suggested);
  expect(await funnelEvents(database, companyId)).toEqual([{ type: "jobSelected", job: "followup" }]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: steps.playbook.title, exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("playbook-step.png"), fullPage: true });
  await clickHydrated(page.getByRole("radio", { name: new RegExp(`^${playbooks.agencies.label}`) }));
  await clickHydrated(page.locator("#onboarding-playbook-continue"));

  await expect(page).toHaveURL(
    appUrlPattern(await workspaceSlugOf(database, companyId), "/settings/channels\\?from=onboarding$"),
  );
  const hint = goal.channelsHint;
  await expect(page.getByRole("heading", { level: 2, name: hint.title, exact: true })).toBeVisible();
  await expect(page.locator("#onboarding-connect-linkedin")).toHaveText(hint.linkedinAction);
  await expect(page.locator("#onboarding-connect-google")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("channels-linkedin-first.png"), fullPage: true });

  const { rows: pages } = await database.query<{ title: string; kind: string; markdown: string }>(
    'SELECT title, kind::text, markdown FROM "WikiPage" WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt"',
    [companyId],
  );
  expect(pages.map(({ title, kind }) => [title, kind])).toEqual([
    [playbooks.pages.salesPlaybook, "knowledge"],
    [playbooks.pages.toneOfVoice, "knowledge"],
    [playbooks.pages.followUps, "procedure"],
    [playbooks.pages.guide, "guide"],
  ]);
  expect(pages[0].markdown).toContain("## How we win work");
  expect(pages[3].markdown).toContain(playbooks.agencies.label);
  const { rows } = await database.query<{ wizard: Date | null; setup: Date | null }>(
    'SELECT "onboardingWizardCompletedAt" AS wizard,"onboardingWikiStepCompletedAt" AS setup FROM "User" WHERE "companyId"=$1',
    [companyId],
  );
  expect(rows).toEqual([{ wizard: expect.any(Date), setup: expect.any(Date) }]);

  const slug = await workspaceSlugOf(database, companyId);
  await page.evaluate(
    ({ key, value }) => window.sessionStorage.setItem(key, value),
    { key: ONBOARDING_CONNECT_KEY, value: JSON.stringify({ channel: "linkedin", at: Date.now() }) },
  );
  await page.goto(appPath(slug, "/settings/channels?account_id=e2e-linkedin&status=CREATION_SUCCESS"));
  await expect(page).toHaveURL(appUrlPattern(slug, "/settings/channels\\?from=onboarding&connected=linkedin$"));
  const connected = page.locator("#onboarding-channel-connected");
  await expect(connected).toContainText(hint.connectedLinkedinTitle);
  await expect(connected).toContainText(hint.connectedDescription);
  await expect(page.locator("#onboarding-connect-linkedin")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("channels-linkedin-connected.png"), fullPage: true });
  expect(await page.evaluate((key) => window.sessionStorage.getItem(key), ONBOARDING_CONNECT_KEY)).toBeNull();
  await page.reload();
  await expect(connected).toContainText(hint.connectedLinkedinTitle);
  await expect(page.locator("#onboarding-open-inbox")).toHaveText(hint.inboxAction);
  await clickHydrated(page.locator("#onboarding-open-dashboard"));
  await expect(page).toHaveURL(appUrlPattern(slug, "/dashboard"));
  expect(errors).toEqual([]);
});

test("connecting an own AI agent skips the setup interview and opens the AI connection", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const companyId = await openGoalOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Agent Studio"));

  await expect(page.getByRole("radio", { name: new RegExp(`^${goal.agent.title}`) })).toBeChecked();
  await clickHydrated(page.locator("#onboarding-goal-continue"));

  const steps = englishMessages.OnboardingWizard.steps;
  await expect(page.getByRole("heading", { level: 1, name: steps.connect.title, exact: true })).toBeVisible();
  expect(await funnelEvents(database, companyId)).toEqual([{ type: "jobSelected", job: "agent" }]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: steps.connect.title, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the quiet footer link starts an empty workspace without a template and skips the agent steps", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const companyId = await openGoalOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Quiet Studio"));

  await clickHydrated(page.locator("#onboarding-goal-empty"));
  const confirm = page.getByRole("alertdialog", { name: setup.empty.title });
  await expect(confirm).toContainText(setup.empty.description);
  await confirm.getByRole("button", { name: setup.empty.confirm, exact: true }).click();

  const steps = englishMessages.OnboardingWizard.steps;
  await expect(page.getByRole("heading", { level: 1, name: steps.invite.title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: steps.invite.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: englishMessages.OnboardingWizard.next, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: steps.ai.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: englishMessages.OnboardingWizard.finish, exact: true }).click();

  await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, companyId), "/dashboard$"));
  const lists = await database.query('SELECT 1 FROM "RecordTypeDefinition" WHERE "companyId"=$1', [companyId]);
  expect(lists.rowCount).toBe(0);
  expect(errors).toEqual([]);
});
