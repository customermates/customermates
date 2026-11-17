import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import { companyPath } from "./app-paths";
import { test, expect, collectPageErrors } from "./fixtures";
import { e2eAppMode } from "./workspace-switching";

const NOTIFY_EFFECT = JSON.stringify([
  {
    kind: "notify",
    recipients: { ruleOwner: true, assignees: false, userIds: [] },
    notificationKind: "ruleAlert",
    title: "{{record.name}}",
  },
]);

async function openNewAutomation(page: Page) {
  await page.locator("#automations-add").click();
  const choice = page.getByRole("menuitem", { name: "Automation", exact: true });
  if (await choice.isVisible().catch(() => false)) await choice.click();
  return page.getByRole("dialog", { name: "New automation" });
}

async function insertRule(
  database: { query: (sql: string, values: unknown[]) => Promise<unknown> },
  args: { companyId: string; ownerUserId: string; name: string; enabled?: boolean },
) {
  const id = randomUUID();
  await database.query(
    `INSERT INTO "AutomationRule" (id,"companyId","ownerUserId",name,enabled,"triggerKind",trigger,conditions,effects,"updatedAt") VALUES ($1,$2,$3,$4,$5,'messageReceived',$6,'[]',$7,NOW())`,
    [
      id,
      args.companyId,
      args.ownerUserId,
      args.name,
      args.enabled ?? true,
      JSON.stringify({ kind: "messageReceived", channel: "any" }),
      NOTIFY_EFFECT,
    ],
  );
  return id;
}

test("builds an automation from a recipe and switches it on", async ({ page, database, companyId }) => {
  const errors = collectPageErrors(page);
  await page.goto(companyPath(companyId, "/automations"));
  const builder = await openNewAutomation(page);

  await expect(builder.locator("[data-automation-start]")).toBeVisible();
  await builder.locator('[data-automation-recipe="welcomeSubmission"]').click();

  await expect(builder.locator("[data-automation-chain]")).toBeVisible();
  await expect(builder.locator('[data-automation-card="trigger"]')).toContainText("form");
  await expect(builder.getByLabel("Name")).toHaveValue("Welcome a form submission");
  await builder.getByRole("button", { name: "Switch on" }).click();
  await expect(builder).not.toBeVisible();

  await expect(page.getByText("Welcome a form submission", { exact: true })).toBeVisible();
  const saved = await database.query(
    `SELECT enabled, "triggerKind", effects FROM "AutomationRule" WHERE "companyId"=$1 AND name=$2`,
    [companyId, "Welcome a form submission"],
  );
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0]).toMatchObject({ enabled: true, triggerKind: "formSubmitted" });
  expect((saved.rows[0].effects as Array<{ kind: string }>).map((effect) => effect.kind)).toEqual([
    "createRecord",
    "notify",
  ]);
  expect(errors).toEqual([]);
});

test("asks for the fields a recipe cannot know before it can be switched on", async ({ page, companyId }) => {
  await page.goto(companyPath(companyId, "/automations"));
  const builder = await openNewAutomation(page);

  await builder.locator('[data-automation-recipe="remindBeforeRenewal"]').click();
  await builder.getByRole("button", { name: "Switch on" }).click();

  await expect(page.getByText("This automation is not complete yet.")).toBeVisible();
  await expect(builder.locator('[data-automation-card="trigger"]')).toBeVisible();
  await expect(builder).toBeVisible();
});

test("builds from scratch with an agent card whose runtime is unavailable and shows why", async ({
  page,
  companyId,
}) => {
  await page.goto(companyPath(companyId, "/automations"));
  const builder = await openNewAutomation(page);

  await builder.locator("[data-automation-scratch]").click();
  await expect(builder.locator("[data-automation-chain]")).toBeVisible();

  await builder.getByRole("button", { name: "Add a step" }).last().click();
  await builder.locator('[data-automation-palette-item="agent"]').click();

  const card = builder.locator('[data-automation-card="effect-0"]');
  await expect(card).toContainText("ask your agent to");
  const reason = card.locator("[data-agent-reason]");
  await expect(reason).toBeVisible();
  await expect(reason.getByRole("link")).toHaveAttribute("href", /\/settings\/connections\?tab=agents$/);

  await card.getByRole("radio", { name: /Your own key/ }).click();
  await expect(card.locator("[data-agent-reason]")).toBeVisible();
  await card.getByRole("textbox").fill("Summarise {{record.name}} for the owner");
  await expect(builder.locator('[data-automation-card="effect-0"]')).toContainText("Summarise");
});

test("pauses and resumes an automation from the list", async ({ page, database, companyId, workspace }) => {
  const ruleId = await insertRule(database, {
    companyId,
    ownerUserId: workspace.userId,
    name: "Notify on every message",
  });
  await page.goto(companyPath(companyId, "/automations"));
  const toggle = page.locator(`[data-automation-switch="${ruleId}"]`);

  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect
    .poll(async () => (await database.query('SELECT enabled FROM "AutomationRule" WHERE id=$1', [ruleId])).rows[0])
    .toMatchObject({ enabled: false });
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await expect
    .poll(async () => (await database.query('SELECT enabled FROM "AutomationRule" WHERE id=$1', [ruleId])).rows[0])
    .toMatchObject({ enabled: true });
});

test("opens an automation, with its runs, from its row", async ({ page, database, companyId, workspace }) => {
  await insertRule(database, { companyId, ownerUserId: workspace.userId, name: "Open me" });
  await page.goto(companyPath(companyId, "/automations"));

  await page.getByText("Open me", { exact: true }).click();
  const builder = page.getByRole("dialog", { name: "Edit automation" });

  await expect(builder.getByLabel("Name")).toHaveValue("Open me");
  await builder.getByRole("tab", { name: "Runs" }).click();
  await expect(builder.locator("[data-automation-runs]")).toBeVisible();
});

test.describe("routines in the same list", () => {
  test.skip(e2eAppMode() === "self-hosted", "Routines are cloud-only");

  test("opens the routine editor from a routine row", async ({ page, database, companyId, workspace }) => {
    await database.query(
      'INSERT INTO "Routine" (id,"companyId","ownerUserId",name,prompt,enabled,"triggerKind","cronExpression",timezone,"triggerEvents","updatedAt") VALUES ($1,$2,$3,$4,$5,true,\'schedule\',\'0 8 * * 1\',\'Europe/Berlin\',\'{}\',NOW())',
      [randomUUID(), companyId, workspace.userId, "Weekly client review", "List clients without a next step."],
    );
    await page.goto(companyPath(companyId, "/automations"));

    await page.getByText("Weekly client review", { exact: true }).click();

    const routine = page.getByRole("dialog", { name: "Routine", exact: true });
    await expect(routine).toBeVisible();
    await expect(routine.locator("#name")).toHaveValue("Weekly client review");
  });
});

test("redirects the old Routines page to the Automations list filtered to routines", async ({ page, companyId }) => {
  await page.goto(companyPath(companyId, "/routines"));

  await expect(page).toHaveURL(/\/automations(\?|$)/);
  await expect(page.getByRole("heading", { name: "Automations", level: 1 })).toBeAttached();
});
