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

type SavedProgress = { step: string; job: string | null; schemaBaseline: number | null };

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name, exact: true });
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

async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          Object.assign(window, { copiedPrompt: text });
          return Promise.resolve();
        },
      },
    });
  });
}

async function refocusTab(page: Page) {
  const refreshed = page.waitForResponse((response) => response.url().includes("_rsc="));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await refreshed;
}

async function expectNoHorizontalOverflow(page: Page) {
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
}

async function openAgentConnect(page: Page, database: Client, workspace: BrowserWorkspace, name: string) {
  const companyId = await openGoalOfNewWorkspace(page, database, workspace, uniqueWorkspaceName(name));
  await expect(page.locator("#onboarding-goal-agent")).toBeChecked();
  await clickHydrated(page.locator("#onboarding-goal-continue"));
  await expect(heading(page, steps.connect.title)).toBeVisible();
  return companyId;
}

test.describe("cloud onboarding with the own agent", () => {
  test.skip(e2eAppMode() !== "cloud", "The cloud variant of the onboarding choice runs in cloud mode");

  test("the own agent connects, gets one line to build the workspace in Claude, and is watched until its first change", async ({
    page,
    database,
    workspace,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await stubClipboard(page);
    const name = uniqueWorkspaceName("Verified Agent");
    const companyId = await openGoalOfNewWorkspace(page, database, workspace, name);
    await expect(page.locator("#onboarding-goal-agent")).toBeChecked();
    await clickHydrated(page.locator("#onboarding-goal-continue"));
    await expect(heading(page, steps.connect.title)).toBeVisible();
    expect(await funnelEvents(database, companyId)).toEqual([{ type: "jobSelected", job: "agent" }]);

    const status = page.locator("#onboarding-agent-status");
    const connectContinue = page.locator("#onboarding-connect-continue");
    await expect(status).toContainText(wizard.connect.waitingGeneric);
    await expect(connectContinue).toBeDisabled();
    await expect(page.locator("#onboarding-connect-later")).toBeEnabled();
    await clickHydrated(page.locator('[data-provider="claude"]'));
    await page.screenshot({ path: testInfo.outputPath("connect-claude.png"), fullPage: true });

    await database.query('UPDATE "Company" SET "agentFirstCallAt"=NOW() WHERE id=$1', [companyId]);
    await expect(status).toContainText(wizard.connect.connected, { timeout: 20_000 });
    await expect(connectContinue).toBeEnabled();
    await clickHydrated(connectContinue);

    await expect(heading(page, steps.handoff.title.replace("{agent}", "Claude"))).toBeVisible();
    const prompt = wizard.handoff.prompt.replace("{workspace}", name);
    await expect(page.locator("#onboarding-handoff-prompt")).toHaveText(prompt);
    const open = page.locator("#onboarding-handoff-open");
    await expect(open).toHaveText(wizard.handoff.openIn.replace("{agent}", "Claude"));
    await expect(open).toHaveAttribute("href", `https://claude.ai/new?q=${encodeURIComponent(prompt)}`);
    await expect(open).toHaveAttribute("target", "_blank");
    await clickHydrated(page.locator("#onboarding-handoff-copy"));
    await expect(page.locator("#onboarding-handoff-copy")).toContainText(wizard.handoff.copied);
    expect(await page.evaluate(() => (window as unknown as { copiedPrompt?: string }).copiedPrompt ?? null)).toBe(
      prompt,
    );

    const changes = page.locator("#onboarding-agent-change");
    await expect(changes).toContainText(wizard.handoff.connected.replace("{agent}", "Claude"));
    await expect(changes).toContainText(wizard.handoff.watching.replace("{agent}", "Claude"));
    await expect.poll(async () => (await savedProgress(database, companyId))?.step).toBe("handoff");
    await expect.poll(async () => (await savedProgress(database, companyId))?.schemaBaseline).not.toBeNull();
    await page.screenshot({ path: testInfo.outputPath("handoff-watching.png"), fullPage: true });
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await agentBuildsStarterModel(database, companyId);
    await expect(changes).toContainText(wizard.handoff.changed, { timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath("handoff-changed.png"), fullPage: true });

    await clickHydrated(page.locator("#onboarding-handoff-continue"));
    await expect(heading(page, steps.channel.title)).toBeVisible();
    await clickHydrated(page.locator("#onboarding-channel-skip"));
    await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, companyId), "/dashboard$"));
    const { rows } = await database.query<{ done: Date | null }>(
      'SELECT "onboardingWizardCompletedAt" AS done FROM "User" WHERE "companyId"=$1',
      [companyId],
    );
    expect(rows).toEqual([{ done: expect.any(Date) }]);
    expect(errors).toEqual([]);
  });

  test("connecting later still hands over, and an agent other than Claude or ChatGPT gets the line to copy", async ({
    page,
    database,
    workspace,
  }) => {
    const errors = collectPageErrors(page);
    const companyId = await openAgentConnect(page, database, workspace, "Later Agent");
    await clickHydrated(page.locator("#onboarding-connect-later"));

    await expect(heading(page, steps.handoff.titleGeneric)).toBeVisible();
    await expect(page.locator("#onboarding-handoff-open")).toHaveCount(0);
    await expect(page.locator("#onboarding-handoff-copy")).toBeVisible();
    await expect(page.locator("#onboarding-agent-change")).toContainText(wizard.connect.waitingGeneric);
    await page.reload();
    await expect(heading(page, steps.handoff.titleGeneric)).toBeVisible();

    await clickHydrated(page.locator("#onboarding-back"));
    await expect(heading(page, steps.connect.title)).toBeVisible();
    await expect(page.locator("[data-other-client]")).toBeVisible();
    await clickHydrated(page.locator("[data-other-client]"));
    await expect(page.locator("[data-ai-other-setup]")).toContainText("/api/v1/mcp");
    expect(await funnelEvents(database, companyId)).toEqual([{ type: "jobSelected", job: "agent" }]);
    expect(errors).toEqual([]);
  });

  test("a team on the own agent path is asked to invite after the hand-over and then to connect a channel", async ({
    page,
    database,
    workspace,
  }) => {
    const errors = collectPageErrors(page);
    const companyId = await openGoalOfNewWorkspace(page, database, workspace, uniqueWorkspaceName("Agent Team"));
    await database.query('UPDATE "Company" SET "teamSize"=$1 WHERE id=$2', ["small", companyId]);
    await page.reload();

    await clickHydrated(page.locator("#onboarding-goal-continue"));
    await expect(heading(page, steps.connect.title)).toBeVisible();
    await clickHydrated(page.locator("#onboarding-connect-later"));
    await expect(heading(page, steps.handoff.titleGeneric)).toBeVisible();
    await expect(page.locator("#onboarding-handoff-continue")).toHaveText(wizard.continue);
    await clickHydrated(page.locator("#onboarding-handoff-continue"));
    await expect(heading(page, steps.invite.title)).toBeVisible();
    await clickHydrated(page.locator("#onboarding-next"));

    await expect(heading(page, steps.channel.title)).toBeVisible();
    await expect(page.locator("#onboarding-channel-linkedin")).toBeVisible();
    await expect(page.locator("#onboarding-channel-google")).toBeVisible();
    await expect.poll(async () => (await savedProgress(database, companyId))?.step).toBe("channel");
    await page.reload();
    await expect(heading(page, steps.channel.title)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await clickHydrated(page.locator("#onboarding-channel-skip"));
    await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, companyId), "/dashboard$"));
    expect(errors).toEqual([]);
  });

  test("Back to the goal step stays there on a refocus and a reload and keeps the path picked there", async ({
    page,
    database,
    workspace,
  }) => {
    const errors = collectPageErrors(page);
    const companyId = await openAgentConnect(page, database, workspace, "Back Agent");
    const mate = page.locator("#onboarding-goal-workspace");

    await clickHydrated(page.locator("#onboarding-back"));
    await expect(heading(page, steps.goal.title)).toBeVisible();
    await expect.poll(async () => (await savedProgress(database, companyId))?.step).toBe("goal");

    await refocusTab(page);
    await expect(heading(page, steps.goal.title)).toBeVisible();
    await expect(heading(page, steps.connect.title)).toHaveCount(0);

    await clickHydrated(mate);
    await expect.poll(async () => (await savedProgress(database, companyId))?.job).toBe("workspace");
    await refocusTab(page);
    await expect(mate).toBeChecked();

    await page.reload();
    await expect(heading(page, steps.goal.title)).toBeVisible();
    await expect(mate).toBeChecked();
    expect(errors).toEqual([]);
  });
});

test.describe("self-hosted onboarding", () => {
  test.skip(e2eAppMode() !== "self-hosted", "The self-hosted variant runs against a self-hosted server");

  test("the Mate option opens a separate cloud trial and sends nothing from this instance", async ({
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
    await expect(page.locator('label[for="onboarding-goal-agent"]')).toContainText(goal.agent.title);
    const cloud = page.locator('label[for="onboarding-goal-workspace"]');
    await expect(cloud).toContainText(goal.cloud.title);
    await expect(cloud).toContainText(goal.cloud.badge);
    await expect(cloud).toContainText("Mate runs in Customermates Cloud.");
    await page.screenshot({ path: testInfo.outputPath("self-hosted-goal.png"), fullPage: true });

    await clickHydrated(page.locator("#onboarding-goal-workspace"));
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

  test("the own agent path connects to this instance, hands over and finishes without an inbox step", async ({
    page,
    database,
  }) => {
    const errors = collectPageErrors(page);
    const name = uniqueWorkspaceName("Hosted Agent");
    await createWorkspaceFromSettings(page, name);
    await expect(heading(page, steps.goal.titleSelfHosted)).toBeVisible();
    await expect(page.locator("#onboarding-goal-agent")).toBeChecked();
    await clickHydrated(page.locator("#onboarding-goal-continue"));

    await expect(heading(page, steps.connect.title)).toBeVisible();
    await expect(page.locator("#onboarding-agent-status")).toContainText(wizard.connect.waitingGeneric);
    await clickHydrated(page.locator("#onboarding-connect-later"));
    await expect(heading(page, steps.handoff.titleGeneric)).toBeVisible();
    await expect(page.locator("#onboarding-handoff-continue")).toHaveText(wizard.finish);
    await clickHydrated(page.locator("#onboarding-handoff-continue"));

    const { rows } = await database.query<{ id: string }>('SELECT id FROM "Company" WHERE name=$1', [name]);
    await expect(page).toHaveURL(appUrlPattern(await workspaceSlugOf(database, rows[0].id), "/dashboard$"));
    expect(errors).toEqual([]);
  });
});
