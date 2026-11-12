import type { Page } from "@playwright/test";
import type { Client } from "pg";
import type { BrowserWorkspace } from "./workspace";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { uniqueWorkspaceName } from "./workspace-names";
import { insertStarterModel } from "./workspace";
import { createWorkspaceFromSettings, openGoalOfNewWorkspace } from "./workspace-setup";
import { clickHydrated, e2eAppMode } from "./workspace-switching";
import { appUrlPattern, workspaceSlugOf } from "./app-paths";

const wizard = englishMessages.OnboardingWizard;
const goal = wizard.goal;
const steps = wizard.steps;
const SIGNUP_TEMPLATE = "client-tracker";
const DEFAULT_TEMPLATE = "sales-pipeline";

type SavedProgress = { step: string; template: string | null; schemaBaseline: number | null };

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name, exact: true });
}

function templateCard(page: Page, slug: string) {
  return page.locator(`#onboarding-template-${slug}`);
}

function templateLabel(page: Page, slug: string) {
  return page.locator(`label[for="onboarding-template-${slug}"]`);
}

async function savedProgress(database: Client, companyId: string) {
  const { rows } = await database.query<{ progress: SavedProgress | null }>(
    'SELECT "onboardingWizardProgress" AS progress FROM "User" WHERE "companyId"=$1',
    [companyId],
  );
  return rows[0]?.progress ?? null;
}

async function funnelEvents(database: Client, companyId: string) {
  const { rows } = await database.query<{ type: string; job: string | null }>(
    'SELECT type::text, job::text FROM "CompanyFunnelEvent" WHERE "companyId"=$1 ORDER BY "occurredAt"',
    [companyId],
  );
  return rows;
}

async function agentBuildsStarterModel(database: Client, companyId: string) {
  const { rows } = await database.query<{ id: string }>('SELECT id FROM "User" WHERE "companyId"=$1 LIMIT 1', [
    companyId,
  ]);
  await insertStarterModel(database, companyId, rows[0].id);
}

async function stubClipboard(page: Page, blocked: boolean) {
  await page.addInitScript((refuse) => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          if (refuse) return Promise.reject(new Error("clipboard blocked"));
          Object.assign(window, { copiedPrompt: text });
          return Promise.resolve();
        },
      },
    });
    if (refuse) {
      Object.assign(window, { ClipboardItem: undefined });
      document.execCommand = () => false;
    }
  }, blocked);
}

async function expectNoHorizontalOverflow(page: Page) {
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
}

async function openAgentConnect(page: Page, database: Client, workspace: BrowserWorkspace) {
  const companyId = await openGoalOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Agent Template"));
  await expect(page.getByRole("radio", { name: new RegExp(`^${goal.agent.title}`) })).toBeChecked();
  await clickHydrated(page.locator("#onboarding-goal-continue"));
  await expect(heading(page, steps.connect.title)).toBeVisible();
  return companyId;
}

test.describe("cloud onboarding with templates", () => {
  test.skip(e2eAppMode() !== "cloud", "The cloud variant of the onboarding choice runs in cloud mode");

  test("the own agent path shows Connected only after a real first call, then the template and the prompt", async ({
    page,
    database,
    workspace,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await stubClipboard(page, false);
    const companyId = await openGoalOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Verified Agent"));
    await database.query('UPDATE "Company" SET "signupTemplate"=$1 WHERE id=$2', [SIGNUP_TEMPLATE, companyId]);
    await page.reload();

    await expect(page.getByRole("radio", { name: new RegExp(`^${goal.agent.title}`) })).toBeChecked();
    await clickHydrated(page.locator("#onboarding-goal-continue"));
    await expect(heading(page, steps.connect.title)).toBeVisible();

    const status = page.locator("#onboarding-agent-status");
    const connectContinue = page.locator("#onboarding-connect-continue");
    await expect(status).toContainText(wizard.connect.waitingGeneric);
    await expect(connectContinue).toBeDisabled();
    await expect(page.locator("#onboarding-connect-later")).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath("connect-waiting.png"), fullPage: true });

    await database.query('UPDATE "Company" SET "agentFirstCallAt"=NOW() WHERE id=$1', [companyId]);
    await expect(status).toContainText(wizard.connect.connected, { timeout: 20_000 });
    await expect(connectContinue).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath("connect-connected.png"), fullPage: true });
    await clickHydrated(connectContinue);

    await expect(heading(page, steps.template.title)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: wizard.template.connectedGeneric })).toBeVisible();
    await expect(templateCard(page, SIGNUP_TEMPLATE)).toBeChecked();
    await expect(templateLabel(page, SIGNUP_TEMPLATE)).toContainText(wizard.template.suggested);
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("template-signup-suggested.png"), fullPage: true });

    const browse = page.getByRole("button", { name: /^Browse all \d+ templates$/ });
    if ((await browse.count()) > 0) await clickHydrated(browse);
    await clickHydrated(templateLabel(page, DEFAULT_TEMPLATE));
    await expect(templateCard(page, DEFAULT_TEMPLATE)).toBeChecked();
    await expect.poll(async () => (await savedProgress(database, companyId))?.template).toBe(DEFAULT_TEMPLATE);
    await page.reload();
    await expect(heading(page, steps.template.title)).toBeVisible();
    await expect(templateCard(page, DEFAULT_TEMPLATE)).toBeChecked();
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    const use = page.locator("#onboarding-template-continue");
    await expect(use).toContainText("Use ");
    await clickHydrated(use);

    await expect(heading(page, steps.prompt.titleGeneric)).toBeVisible();
    const prompt = page.locator("#onboarding-template-prompt");
    await expect(prompt).toContainText("## 1. Your workspace");
    await expect(prompt).toContainText("through MCP at");
    await expect(prompt).toHaveAttribute("aria-busy", "false");
    await expect(prompt).toHaveAttribute("tabindex", "0");
    const changed = page.locator("#onboarding-agent-change");
    await expect(changed).toContainText(wizard.prompt.watching);
    await expect.poll(async () => (await savedProgress(database, companyId))?.step).toBe("prompt");
    await page.screenshot({ path: testInfo.outputPath("prompt-watching.png"), fullPage: true });

    const copy = page.locator("#onboarding-template-copy");
    await clickHydrated(copy);
    await expect(copy).toContainText(wizard.prompt.copied);
    const copied = await page.evaluate(() => (window as unknown as { copiedPrompt?: string }).copiedPrompt ?? null);
    expect(copied).toBe(await prompt.textContent());

    await page.reload();
    await expect(heading(page, steps.prompt.titleGeneric)).toBeVisible();
    await expect(prompt).toContainText("## 1. Your workspace");
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await expect.poll(async () => (await savedProgress(database, companyId))?.schemaBaseline).not.toBeNull();
    await agentBuildsStarterModel(database, companyId);
    await expect(changed).toContainText(wizard.prompt.changed, { timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath("prompt-changed.png"), fullPage: true });

    await clickHydrated(page.locator("#onboarding-prompt-finish"));
    await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, companyId), "/dashboard$"));
    const { rows } = await database.query<{ done: Date | null }>(
      'SELECT "onboardingWizardCompletedAt" AS done FROM "User" WHERE "companyId"=$1',
      [companyId],
    );
    expect(rows).toEqual([{ done: expect.any(Date) }]);
    expect(errors).toEqual([]);
  });

  test("connecting later still offers the templates by keyboard, and no template finishes onboarding", async ({
    page,
    database,
    workspace,
  }) => {
    const errors = collectPageErrors(page);
    const companyId = await openAgentConnect(page, database, workspace);

    await clickHydrated(page.locator("#onboarding-connect-later"));
    await expect(heading(page, steps.template.title)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: wizard.template.connectedGeneric })).toHaveCount(0);
    await expect(templateCard(page, DEFAULT_TEMPLATE)).toBeChecked();
    await expect(templateLabel(page, DEFAULT_TEMPLATE)).toContainText(wizard.template.recommended);

    await expect(templateCard(page, DEFAULT_TEMPLATE)).toBeEnabled();
    await templateCard(page, DEFAULT_TEMPLATE).focus();
    await page.keyboard.press("ArrowRight");
    await expect(templateCard(page, DEFAULT_TEMPLATE)).not.toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(templateCard(page, DEFAULT_TEMPLATE)).not.toBeChecked();

    await clickHydrated(page.locator("#onboarding-template-none"));
    await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, companyId), "/dashboard$"));
    const { rows } = await database.query<{ done: Date | null }>(
      'SELECT "onboardingWizardCompletedAt" AS done FROM "User" WHERE "companyId"=$1',
      [companyId],
    );
    expect(rows).toEqual([{ done: expect.any(Date) }]);
    expect(errors).toEqual([]);
  });

  test("the prompt falls back to a selected text when the clipboard refuses", async ({ page, database, workspace }) => {
    const errors = collectPageErrors(page);
    await stubClipboard(page, true);
    await openAgentConnect(page, database, workspace);
    await clickHydrated(page.locator("#onboarding-connect-later"));
    await expect(heading(page, steps.template.title)).toBeVisible();
    await clickHydrated(page.locator("#onboarding-template-continue"));

    await expect(heading(page, steps.prompt.titleGeneric)).toBeVisible();
    const prompt = page.locator("#onboarding-template-prompt");
    await expect(prompt).toHaveAttribute("aria-busy", "false");
    await clickHydrated(page.locator("#onboarding-template-copy"));
    await expect(page.getByText(wizard.prompt.copyFailed, { exact: true })).toBeVisible();
    await expect(page.locator("#onboarding-template-copy")).not.toContainText(wizard.prompt.copied);
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("## 1. Your workspace");
    expect(errors).toEqual([]);
  });

  test("choosing Mate offers the signup template and continues to the guided setup", async ({
    page,
    database,
    workspace,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    const companyId = await openGoalOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Mate Template"));
    await database.query('UPDATE "Company" SET "signupTemplate"=$1 WHERE id=$2', [SIGNUP_TEMPLATE, companyId]);
    await page.reload();

    await clickHydrated(page.getByRole("radio", { name: new RegExp(`^${goal.workspace.title}`) }));
    await clickHydrated(page.locator("#onboarding-goal-continue"));
    await expect(heading(page, steps.template.title)).toBeVisible();
    await expect(page.getByText(steps.template.subtitleMate, { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: wizard.template.connectedGeneric })).toHaveCount(0);
    await expect(templateCard(page, SIGNUP_TEMPLATE)).toBeChecked();
    await expect(templateLabel(page, SIGNUP_TEMPLATE)).toContainText(wizard.template.suggested);
    await page.screenshot({ path: testInfo.outputPath("mate-template.png"), fullPage: true });

    await clickHydrated(page.locator("#onboarding-template-continue"));
    await expect(heading(page, steps.setup.startTitle)).toBeVisible();
    expect(await funnelEvents(database, companyId)).toEqual([{ type: "jobSelected", job: "workspace" }]);
    expect(errors).toEqual([]);
  });
});

test.describe("self-hosted onboarding", () => {
  test.skip(e2eAppMode() !== "self-hosted", "The self-hosted variant runs against a self-hosted server");

  test("the second option opens a separate cloud trial and sends nothing from this instance", async ({
    page,
    database,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await page.addInitScript(() => {
      Object.assign(window, { openedWindows: [] as unknown[][] });
      window.open = (...args: unknown[]) => {
        (window as unknown as { openedWindows: unknown[][] }).openedWindows.push(args);
        return null;
      };
    });
    const name = uniqueWorkspaceName("Hosted Choice");
    await createWorkspaceFromSettings(page, name);
    await expect(heading(page, steps.goal.titleSelfHosted)).toBeVisible();

    const options = page.getByRole("radiogroup", { name: goal.optionsLabel, exact: true });
    await expect(options.getByRole("radio")).toHaveCount(2);
    await expect(page.locator("#onboarding-goal-followup")).toHaveCount(0);
    const agent = page.locator('label[for="onboarding-goal-agent"]');
    await expect(agent).toContainText(goal.agent.title);
    await expect(agent).toContainText(goal.agent.descriptionSelfHosted);
    await expect(agent).toContainText(goal.recommended);
    const cloud = page.locator('label[for="onboarding-goal-workspace"]');
    await expect(cloud).toContainText(goal.cloud.title);
    await expect(cloud).toContainText(goal.cloud.badge);
    await expect(cloud).toContainText("Mate runs in Customermates Cloud.");
    await page.screenshot({ path: testInfo.outputPath("self-hosted-goal.png"), fullPage: true });

    await clickHydrated(page.getByRole("radio", { name: new RegExp(`^${goal.cloud.title}`) }));
    await clickHydrated(page.locator("#onboarding-goal-continue"));
    await expect(page.getByRole("status").filter({ hasText: goal.cloud.opened })).toBeVisible();
    await expect(heading(page, steps.goal.titleSelfHosted)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { openedWindows: unknown[][] }).openedWindows)).toEqual([
      ["https://customermates.com/en/auth/signup?job=workspace", "_blank", "noopener,noreferrer"],
    ]);
    const { rows: company } = await database.query<{ id: string }>('SELECT id FROM "Company" WHERE name=$1', [name]);
    expect(await funnelEvents(database, company[0].id)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the own agent path connects to this instance and finishes without a template", async ({
    page,
    database,
  }) => {
    const errors = collectPageErrors(page);
    const name = uniqueWorkspaceName("Hosted Agent");
    await createWorkspaceFromSettings(page, name);
    await expect(heading(page, steps.goal.titleSelfHosted)).toBeVisible();
    await expect(page.getByRole("radio", { name: new RegExp(`^${goal.agent.title}`) })).toBeChecked();
    await clickHydrated(page.locator("#onboarding-goal-continue"));

    await expect(heading(page, steps.connect.title)).toBeVisible();
    await expect(page.locator("#onboarding-agent-status")).toContainText(wizard.connect.waitingGeneric);
    await clickHydrated(page.locator("#onboarding-connect-later"));
    await expect(heading(page, steps.template.title)).toBeVisible();
    await clickHydrated(page.locator("#onboarding-template-none"));

    const { rows } = await database.query<{ id: string }>('SELECT id FROM "Company" WHERE name=$1', [name]);
    await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, rows[0].id), "/dashboard$"));
    expect(errors).toEqual([]);
  });
});
