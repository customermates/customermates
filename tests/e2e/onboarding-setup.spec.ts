import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";
import type { Client } from "pg";
import type { BrowserWorkspace } from "./workspace";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { moveWithKeyboard } from "./keyboard-drag";
import { uniqueWorkspaceName } from "./workspace-names";
import { clickHydrated, e2eAppMode, expectHydrated } from "./workspace-switching";
import { completeSetupStepInDatabase, openQuestionsOfNewWorkspace } from "./workspace-setup";
import { openOnboardingAsNewLogin } from "./onboarding-login";
import { secondUser } from "./second-user";
import { appPath, appUrlPattern, workspaceSlugOf } from "./app-paths";

test.skip(e2eAppMode() !== "cloud", "The guided workspace setup runs in the cloud only");

const wizard = englishMessages.OnboardingWizard;
const steps = wizard.steps;
const goal = wizard.goal;
const setup = englishMessages.WorkspaceSetup;
const ONBOARDING_CONNECT_KEY = "customermates:onboarding-connect";

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name, exact: true });
}

async function openWorkspaceWithTeam(
  page: Page,
  database: Client,
  workspace: BrowserWorkspace,
  name: string,
  teamSize: string,
) {
  const companyId = await openQuestionsOfNewWorkspace(page, database, workspace, name);
  await database.query('UPDATE "Company" SET "teamSize"=$1 WHERE id=$2', [teamSize, companyId]);
  await page.reload();
  await expect(heading(page, setup.questions.workWith.label)).toBeVisible();
  return companyId;
}

async function funnelEvents(database: Client, companyId: string) {
  const { rows } = await database.query<{ type: string; job: string | null }>(
    'SELECT type::text, job::text FROM "CompanyFunnelEvent" WHERE "companyId"=$1 ORDER BY "occurredAt"',
    [companyId],
  );
  return rows;
}

async function onboardingState(database: Client, companyId: string) {
  const { rows } = await database.query<{ wizard: Date | null; setup: Date | null }>(
    'SELECT "onboardingWizardCompletedAt" AS wizard,"onboardingWikiStepCompletedAt" AS setup FROM "User" WHERE "companyId"=$1',
    [companyId],
  );
  return rows;
}

async function stepEntries(page: Page) {
  return page
    .locator("#setup-question-mainSteps ol input")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

async function startEmpty(page: Page) {
  await clickHydrated(page.locator("#setup-start-empty"));
  const confirm = page.getByRole("alertdialog", { name: setup.empty.title });
  await expect(confirm).toContainText(setup.empty.description);
  await confirm.getByRole("button", { name: setup.empty.confirm, exact: true }).click();
}

test("a new workspace opens Mate's first question with starting empty as the quiet footer and no Back", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  await openQuestionsOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("First Question"));

  await expect(page.locator("#onboarding-goal-continue")).toHaveCount(0);
  await expect(page.locator("#setup-question-back")).toHaveCount(0);
  const empty = page.locator("#setup-start-empty");
  await expect(empty).toHaveText(setup.empty.action);
  const [question, emptyBox] = await Promise.all(
    [page.locator("#setup-question-workWith"), empty].map((target) => target.boundingBox()),
  );
  if (!question || !emptyBox) throw new Error("The first question and the footer must be visible");
  expect(emptyBox.y).toBeGreaterThan(question.y + question.height - 1);
  await page.screenshot({ path: testInfo.outputPath("setup-first-question.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("the Mate path asks four questions one per screen and shows a short plan before anything is built", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const companyId = await openQuestionsOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Mate Studio"));
  await expect.poll(() => funnelEvents(database, companyId)).toEqual([{ type: "jobSelected", job: "workspace" }]);
  const progress = page.locator("#onboarding-progress-text");

  await expect(progress).toHaveText(wizard.questionProgress.replace("{current}", "1").replace("{total}", "3"));
  await expect(page.locator("#setup-question-pick-hint")).toHaveText(setup.interview.pickOne);
  await page.screenshot({ path: testInfo.outputPath("setup-question-work-with.png"), fullPage: true });
  await page.keyboard.press("1");

  await expect(heading(page, setup.questions.purpose.label)).toBeVisible();
  await expect(page.getByText(setup.questions.purpose.hint, { exact: true })).toBeVisible();
  const purpose = page.locator("#setup-question-purpose");
  await expect(purpose.getByRole("checkbox")).toHaveCount(5);
  await expect(page.locator("#setup-purpose-more")).toHaveText(setup.interview.showMore.replace("{count}", "6"));
  await clickHydrated(page.locator("#setup-question-continue"));
  await expect(page.getByText(englishMessages.Common.errors.mustNotBeBlank, { exact: true })).toBeVisible();
  await expect(heading(page, setup.questions.purpose.label)).toBeVisible();
  await clickHydrated(page.locator("#setup-purpose-deals"));
  await expect(progress).toHaveText(wizard.questionProgress.replace("{current}", "2").replace("{total}", "4"));
  await clickHydrated(page.locator("#setup-question-continue"));

  await expect(heading(page, setup.questions.mainSteps.label)).toBeVisible();
  await expect.poll(() => stepEntries(page)).toEqual(setup.suggestedSteps.dealsClients);
  await page.screenshot({ path: testInfo.outputPath("setup-question-steps.png"), fullPage: true });
  await clickHydrated(page.locator("#setup-question-continue"));

  await expect(heading(page, setup.questions.pricing.label)).toBeVisible();
  await clickHydrated(page.locator("#setup-pricing-timeBased"));
  const examples = page.locator("#setup-existingData");
  await expect(examples).toBeChecked();
  await expect(page.locator("#setup-question-continue")).toHaveText(setup.interview.showPlan);
  await clickHydrated(page.locator("#setup-question-continue"));

  await expect(heading(page, setup.plan.title)).toBeVisible({ timeout: 30_000 });
  const review = page.locator("#setup-plan-review");
  await expect(review).toContainText(setup.plan.rows.workWith);
  await expect(review).toContainText(setup.options.workWith.clients);
  await expect(review).toContainText("5 steps");
  await expect(review).toContainText(setup.options.pricing.timeBased);
  await expect(review).toContainText(setup.plan.rows.yes);
  await expect(page.locator("#setup-plan-change-pipeline")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("setup-plan-summary.png"), fullPage: true });

  const { rows } = await database.query<{ workWith: string; mainSteps: number; language: string; existingData: string }>(
    `SELECT answers->'workWith'->'value'->>'value' AS "workWith",
            jsonb_array_length(answers->'mainSteps'->'value'->'items') AS "mainSteps",
            answers->'language'->'value'->>'value' AS language,
            answers->'existingData'->'value'->>'value' AS "existingData"
       FROM "WorkspaceSetup" WHERE "companyId"=$1`,
    [companyId],
  );
  expect(rows).toEqual([{ workWith: "clients", mainSteps: 5, language: "en", existingData: "sampleData" }]);
  expect(await onboardingState(database, companyId)).toEqual([{ wizard: null, setup: null }]);
  const lists = await database.query('SELECT 1 FROM "RecordTypeDefinition" WHERE "companyId"=$1', [companyId]);
  expect(lists.rowCount).toBe(0);
  expect(errors).toEqual([]);
});

test("the questions go back one screen at a time and stop at the first question", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  await openQuestionsOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Back Studio"));
  await clickHydrated(page.locator("#setup-workWith-customers"));
  await expect(heading(page, setup.questions.purpose.label)).toBeVisible();
  await clickHydrated(page.locator("#setup-question-back"));
  await expect(heading(page, setup.questions.workWith.label)).toBeVisible();
  await expect(page.locator("#setup-workWith-customers")).toBeChecked();
  await expect(page.locator("#setup-question-back")).toHaveCount(0);
  await expect(page.locator("#setup-start-empty")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the suggested steps reorder by dragging and by keyboard", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  await openQuestionsOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Drag Studio"));
  await clickHydrated(page.locator("#setup-workWith-clients"));
  await clickHydrated(page.locator("#setup-purpose-deals"));
  await clickHydrated(page.locator("#setup-question-continue"));
  await expect.poll(() => stepEntries(page)).toEqual(setup.suggestedSteps.dealsClients);

  const stepsList = page.locator("#setup-question-mainSteps");
  const handles = stepsList.getByRole("button", { name: /^Drag to reorder/ });
  const from = await handles.nth(1).boundingBox();
  const to = await handles.nth(0).boundingBox();
  if (!from || !to) throw new Error("The drag handles have no position.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1)
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y - from.y - 6) * step) / 10);
  await page.mouse.up();
  const [first, second, ...rest] = setup.suggestedSteps.dealsClients;
  await expect.poll(() => stepEntries(page)).toEqual([second, first, ...rest]);

  await moveWithKeyboard(page, handles.nth(0), "ArrowDown");
  await expect.poll(() => stepEntries(page)).toEqual([first, second, ...rest]);
  expect(errors).toEqual([]);
});

test("after the build a team is asked to invite, then to connect the inbox, and lands in the workspace", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const companyId = await openQuestionsOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Built Team"));
  await database.query('UPDATE "Company" SET "teamSize"=$1 WHERE id=$2', ["small", companyId]);
  await expect
    .poll(async () => (await funnelEvents(database, companyId)).some((event) => event.type === "jobSelected"))
    .toBe(true);
  await completeSetupStepInDatabase(page);
  await page.reload();

  await expect(heading(page, steps.invite.title)).toBeVisible();
  await expect(page.locator("#onboarding-back")).toHaveCount(0);
  await clickHydrated(page.locator("#onboarding-next"));
  await expect(heading(page, steps.channel.title)).toBeVisible();
  await clickHydrated(page.locator("#onboarding-channel-skip"));
  await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, companyId), "/dashboard$"));
  expect(await onboardingState(database, companyId)).toEqual([{ wizard: expect.any(Date), setup: expect.any(Date) }]);
  expect(errors).toEqual([]);
});

test("starting empty as a solo owner skips the invitations and finishes after the inbox step", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const companyId = await openWorkspaceWithTeam(page, database, workspace, uniqueWorkspaceName("Empty Studio"), "solo");
  await startEmpty(page);
  await page.screenshot({ path: testInfo.outputPath("setup-empty-channel.png"), fullPage: true });

  await expect(heading(page, steps.channel.title)).toBeVisible();
  await expect(heading(page, steps.invite.title)).toHaveCount(0);
  expect(await onboardingState(database, companyId)).toEqual([{ wizard: null, setup: expect.any(Date) }]);
  await page.reload();
  await expect(heading(page, steps.channel.title)).toBeVisible();
  await expect(page.locator("#onboarding-channel-continue")).toHaveText(wizard.finish);
  await clickHydrated(page.locator("#onboarding-channel-skip"));

  await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, companyId), "/dashboard$"));
  await expect(page.getByRole("button", { name: "Create list" }).first()).toBeVisible();
  const lists = await database.query('SELECT 1 FROM "RecordTypeDefinition" WHERE "companyId"=$1', [companyId]);
  expect(lists.rowCount).toBe(0);
  expect(await onboardingState(database, companyId)).toEqual([{ wizard: expect.any(Date), setup: expect.any(Date) }]);
  const events = await funnelEvents(database, companyId);
  expect(events.filter((event) => event.type !== "channelSkipped")).toEqual([{ type: "jobSelected", job: "workspace" }]);
  expect(errors).toEqual([]);
});

test("starting empty as a team shows the invitations first", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  const companyId = await openWorkspaceWithTeam(page, database, workspace, uniqueWorkspaceName("Empty Team"), "medium");
  await startEmpty(page);

  await expect(heading(page, steps.invite.title)).toBeVisible();
  await page.reload();
  await expect(heading(page, steps.invite.title)).toBeVisible();
  await clickHydrated(page.locator("#onboarding-next"));
  await expect(heading(page, steps.channel.title)).toBeVisible();
  await clickHydrated(page.locator("#onboarding-channel-skip"));
  await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, companyId), "/dashboard$"));
  expect(errors).toEqual([]);
});

test("the follow-up signup job opens the playbook right after the profile, writes it and leads to connecting LinkedIn first", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const companyId = await openQuestionsOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Follow Studio"));
  await expect.poll(() => funnelEvents(database, companyId)).toEqual([{ type: "jobSelected", job: "workspace" }]);
  await database.query('DELETE FROM "CompanyFunnelEvent" WHERE "companyId"=$1', [companyId]);
  await database.query(
    'INSERT INTO "CompanySignupSource" (id,"companyId",job,"landingPath","capturedAt") VALUES ($1,$2,\'followup\',\'/en/for/consultants\',NOW())',
    [randomUUID(), companyId],
  );
  await page.reload();

  const playbooks = englishMessages.OnboardingPlaybooks;
  await expect(heading(page, steps.playbook.title)).toBeVisible();
  await expect(page.locator("#onboarding-goal-continue")).toHaveCount(0);
  const consultants = page.getByRole("radio", { name: new RegExp(`^${playbooks.consultants.label}`) });
  await expect(consultants).toBeChecked();
  await expect(page.locator('label[for="onboarding-playbook-consultants"]')).toContainText(goal.suggested);
  await page.screenshot({ path: testInfo.outputPath("playbook-step.png"), fullPage: true });
  await expect.poll(() => funnelEvents(database, companyId)).toEqual([{ type: "jobSelected", job: "followup" }]);
  await page.reload();
  await expect(heading(page, steps.playbook.title)).toBeVisible();
  await expect(page.locator("#onboarding-playbook-back")).toHaveCount(0);
  await clickHydrated(page.getByRole("radio", { name: new RegExp(`^${playbooks.agencies.label}`) }));
  await clickHydrated(page.locator("#onboarding-playbook-continue"));

  await expect(page).toHaveURL(
    appUrlPattern(await workspaceSlugOf(database, companyId), "/settings/connections\\?from=onboarding$"),
  );
  const hint = goal.channelsHint;
  await expect(page.getByRole("heading", { level: 2, name: hint.title, exact: true })).toBeVisible();
  await expect(page.locator("#onboarding-connect-linkedin")).toHaveText(hint.linkedinAction);
  await expect(page.locator("#onboarding-connect-google")).toBeVisible();

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
  expect(pages[3].markdown).toContain(playbooks.agencies.label);
  expect(await onboardingState(database, companyId)).toEqual([{ wizard: expect.any(Date), setup: expect.any(Date) }]);

  const slug = await workspaceSlugOf(database, companyId);
  await page.evaluate(({ key, value }) => window.sessionStorage.setItem(key, value), {
    key: ONBOARDING_CONNECT_KEY,
    value: JSON.stringify({ channel: "linkedin", at: Date.now() }),
  });
  await page.goto(appPath(slug, "/settings/connections?account_id=e2e-linkedin&status=CREATION_SUCCESS"));
  await expect(page).toHaveURL(appUrlPattern(slug, "/settings/connections\\?from=onboarding&connected=linkedin$"));
  const connected = page.locator("#onboarding-channel-connected");
  await expect(connected).toContainText(hint.connectedLinkedinTitle);
  await clickHydrated(page.locator("#onboarding-open-dashboard"));
  await expect(page).toHaveURL(appUrlPattern(slug, "/dashboard"));
  expect(errors).toEqual([]);
});

test("an invited teammate whose profile is done skips every owner step and lands in the workspace", async ({
  browser,
  database,
  workspace,
}, testInfo) => {
  const roleId = randomUUID();
  await database.query('INSERT INTO "UserRole" (id,"companyId",name,"updatedAt") VALUES ($1,$2,$3,NOW())', [
    roleId,
    workspace.companyId,
    "Invited member",
  ]);
  const member = await secondUser(browser, database, workspace.companyId, testInfo, roleId);
  try {
    await database.query('UPDATE "User" SET "onboardingWizardCompletedAt"=NULL WHERE id=$1', [member.userId]);
    await member.page.goto(appPath(workspace.slug, "/dashboard"));
    await expect(member.page).toHaveURL(appUrlPattern(workspace.slug, "/dashboard$"), { timeout: 30_000 });
    await expect(member.page.locator("#setup-start-empty")).toHaveCount(0);
    await expect(member.page.locator("#onboarding-progress-text")).toHaveCount(0);
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});

test("a password sign-up confirms the e-mail first, and the page moves on by itself once it is confirmed", async ({
  browser,
  database,
}, testInfo) => {
  test.setTimeout(120_000);
  const login = await openOnboardingAsNewLogin(browser, database, { emailVerified: false, name: "Confirm Me" });
  const { page } = login;
  const card = page.locator("#onboarding-confirm-email");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { level: 1, name: wizard.confirmEmail.title, exact: true })).toBeVisible();
  await expect(card).toContainText(login.email);
  await expect(page.locator("#onboarding-confirm-email-resend")).toBeDisabled();
  await expect(page.locator("#firstName")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("confirm-email.png"), fullPage: true });

  await database.query('UPDATE "AuthUser" SET "emailVerified"=true WHERE id=$1', [login.authUserId]);
  await expect(page.locator("#firstName")).toBeVisible({ timeout: 30_000 });
  await expect(heading(page, steps.profile.title)).toBeVisible();
  await expect(card).toHaveCount(0);
  await login.context.close();
});

test("the profile asks the team size and, optionally, how the owner found us, with the language taken from the browser", async ({
  browser,
  database,
}, testInfo) => {
  test.setTimeout(120_000);
  const login = await openOnboardingAsNewLogin(browser, database, { emailVerified: true, name: "Profile Owner" });
  const { page } = login;
  await expectHydrated(page.locator("#firstName"));
  await expect(heading(page, steps.profile.title)).toBeVisible();
  await expect(page.locator("#displayLanguage")).toHaveCount(0);
  await expect(page.getByText(wizard.profile.languageFromBrowser.replace("{language}", "English"))).toBeVisible();
  await clickHydrated(page.locator("#onboarding-language-change"));
  await expect(page.locator("#displayLanguage")).toBeVisible();

  await page.locator("#firstName").fill("Ada");
  await page.locator("#lastName").fill("Owner");
  await page.locator("#workspaceName").fill(uniqueWorkspaceName("Profile Studio"));
  await page.locator("#onboarding-team-size-small").click();
  await clickHydrated(page.locator("#onboarding-source"));
  await page.getByRole("option", { name: wizard.source.choices.recommendation, exact: true }).click();
  await page.locator("#agreeToTerms").click();
  await page.screenshot({ path: testInfo.outputPath("profile-step.png"), fullPage: true });
  await clickHydrated(page.locator("#onboarding-profile-continue"));

  await expect(heading(page, setup.questions.workWith.label)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#setup-start-empty")).toBeVisible();
  const { rows } = await database.query<{ teamSize: string | null; choice: string | null }>(
    'SELECT "teamSize", "discoveryChoice" AS choice FROM "Company" WHERE "createdByAuthUserId"=$1',
    [login.authUserId],
  );
  expect(rows).toEqual([{ teamSize: "small", choice: "recommendation" }]);
  await login.context.close();
});
