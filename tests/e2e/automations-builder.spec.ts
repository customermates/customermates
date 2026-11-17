import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import { companyPath } from "./app-paths";
import { test, expect, collectPageErrors } from "./fixtures";
import { secondUser } from "./second-user";
import { clickHydrated, e2eAppMode } from "./workspace-switching";

const NOTIFY_EFFECT = JSON.stringify([
  {
    kind: "notify",
    recipients: { ruleOwner: true, assignees: false, userIds: [] },
    notificationKind: "ruleAlert",
    title: "{{record.name}}",
  },
]);

async function openNewAutomation(page: Page) {
  // On Customermates Cloud the add button opens a menu (automation or routine); self-hosted opens the builder directly.
  await clickHydrated(page.locator("#automations-add"));
  const choice = page.getByRole("menuitem", { name: "Automation", exact: true });
  const menuShown = await choice.waitFor({ state: "visible", timeout: 3000 }).then(
    () => true,
    () => false,
  );
  if (menuShown) await choice.click();
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

  await expect(page.getByRole("button", { name: "Welcome a form submission", exact: true })).toBeVisible();
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
  if (e2eAppMode() === "self-hosted") {
    // Mate is a Customermates Cloud runtime, so a self-hosted install sees why it is unavailable.
    await expect(reason).toBeVisible();
    await expect(reason.getByRole("link")).toHaveAttribute("href", /\/settings\/connections\?tab=agents$/);
  } else {
    await expect(reason).toHaveCount(0);
  }

  // No provider key is stored, so the own-key runtime explains itself on both editions.
  await card.getByRole("radio", { name: /Your own key/ }).click();
  await expect(card.locator("[data-agent-reason]")).toBeVisible();
  await expect(card.locator("[data-agent-reason]").getByRole("link")).toHaveAttribute(
    "href",
    /\/settings\/connections\?tab=agents$/,
  );
  await card.getByRole("textbox").fill("Summarise {{record.name}} for the owner");
  await expect(builder.locator('[data-automation-card="effect-0"]')).toContainText("Summarise");
});

test("pauses and resumes an automation from the list", async ({ page, database, companyId, workspace }) => {
  const errors = collectPageErrors(page);
  const ruleId = await insertRule(database, {
    companyId,
    ownerUserId: workspace.userId,
    name: "Notify on every message",
  });
  await page.goto(companyPath(companyId, "/automations"));
  const toggle = page.locator(`[data-automation-switch="${ruleId}"]`);

  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();
  await clickHydrated(toggle);
  expect(errors).toEqual([]);
  await expect
    .poll(async () => (await database.query('SELECT enabled FROM "AutomationRule" WHERE id=$1', [ruleId])).rows[0])
    .toMatchObject({ enabled: false });
  await expect(toggle).not.toBeChecked();

  await clickHydrated(toggle);
  await expect
    .poll(async () => (await database.query('SELECT enabled FROM "AutomationRule" WHERE id=$1', [ruleId])).rows[0])
    .toMatchObject({ enabled: true });
});

test("opens an automation, with its runs, from its row", async ({ page, database, companyId, workspace }) => {
  const errors = collectPageErrors(page);
  await insertRule(database, { companyId, ownerUserId: workspace.userId, name: "Open me" });
  await page.goto(companyPath(companyId, "/automations"));

  await clickHydrated(page.getByRole("button", { name: "Open me", exact: true }));
  expect(errors).toEqual([]);
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

    await clickHydrated(page.getByRole("button", { name: "Weekly client review", exact: true }));

    const routine = page.getByRole("dialog", { name: "Routine", exact: true });
    await expect(routine).toBeVisible();
    await expect(routine.locator("#name")).toHaveValue("Weekly client review");
  });

  test("opens a linked routine that the loaded list does not show", async ({ page, database, companyId, workspace }) => {
    const routineId = randomUUID();
    await database.query(
      'INSERT INTO "Routine" (id,"companyId","ownerUserId",name,prompt,enabled,"triggerKind","cronExpression",timezone,"triggerEvents","updatedAt") VALUES ($1,$2,$3,$4,$5,true,\'schedule\',\'0 8 * * 1\',\'Europe/Berlin\',\'{}\',NOW())',
      [routineId, companyId, workspace.userId, "Linked from a chat", "List clients without a next step."],
    );
    await insertRule(database, { companyId, ownerUserId: workspace.userId, name: "The only row shown" });

    // The list is narrowed to automations, so the routine the link points at is not among the loaded rows.
    await page.goto(
      companyPath(companyId, `/automations?filters=automationKind:in:rule&focus=${encodeURIComponent(`routine:${routineId}`)}`),
    );

    await expect(page.getByRole("button", { name: "Linked from a chat", exact: true })).toHaveCount(0);
    const routine = page.getByRole("dialog", { name: "Routine", exact: true });
    await expect(routine).toBeVisible();
    await expect(routine.locator("#name")).toHaveValue("Linked from a chat");
  });
});

test("redirects the old Routines page to the Automations list filtered to routines", async ({ page, companyId }) => {
  await page.goto(companyPath(companyId, "/routines?focus=routine:00000000-0000-4000-8000-000000000001"));

  await expect(page).toHaveURL(/\/automations\?/);
  await expect(page.getByRole("heading", { name: "Automations", level: 1 })).toBeAttached();
  // The shortcut becomes the list's own filter, so removing the filter also removes it from the address.
  await expect.poll(() => new URL(page.url()).searchParams.get("kind")).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("filters")).toEqual(["automationKind:in:routine"]);
  // The rest of an old link survives the redirect.
  expect(new URL(page.url()).searchParams.get("focus")).toBe("routine:00000000-0000-4000-8000-000000000001");
});

async function roleWithoutApiAccess(page: Page) {
  const model = await page.request.post("/api/v1/model/read", { data: {} });
  const { revision } = (await model.json()) as { revision: number };
  const saved = await page.request.post("/api/v1/roles/save", {
    data: {
      name: `Automations only ${randomUUID().slice(0, 6)}`,
      description: "Routines and automations, no API access, no workspace settings",
      permissions: [
        { resource: "routines", actions: ["readAll", "create", "update", "delete"] },
        { resource: "api", actions: [] },
        { resource: "company", actions: [] },
      ],
      recordGrants: [],
      expectedRevision: revision,
      idempotencyKey: randomUUID(),
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  return ((await saved.json()) as { role: { id: string } }).role.id;
}

test("a member with automation access but no API access opens Automations without the webhook list", async ({
  page,
  browser,
  database,
  companyId,
  workspace,
}, testInfo) => {
  const ruleId = await insertRule(database, { companyId, ownerUserId: workspace.userId, name: "Owned by the admin" });
  const roleId = await roleWithoutApiAccess(page);
  const member = await secondUser(browser, database, companyId, testInfo, roleId);
  try {
    await member.page.goto(companyPath(companyId, "/automations"));
    await expect(member.page.getByRole("heading", { name: "Automations", level: 1 })).toBeAttached();
    // The page used to answer with the error page here, because the webhook list needs API access.
    await expect(member.page.locator(`[data-automation-switch="${ruleId}"]`)).toBeVisible();
    await expect(member.page.locator(`[data-automation-switch="${ruleId}"]`)).toBeDisabled();

    await test.step("someone else's automation opens read-only", async () => {
      await clickHydrated(member.page.getByRole("button", { name: "Owned by the admin", exact: true }));
      const existing = member.page.getByRole("dialog", { name: "Edit automation" });
      await expect(existing.locator("[data-automation-read-only]")).toBeVisible();
      await expect(existing.getByLabel("Name")).toHaveAttribute("readonly", "");
      await expect(existing.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
      await expect(existing.getByRole("button", { name: "Add a step" })).toHaveCount(0);
      await member.page.keyboard.press("Escape");
      await expect(existing).not.toBeVisible();
    });

    await test.step("a webhook step says that the role cannot see webhooks instead of an empty picker", async () => {
      const builder = await openNewAutomation(member.page);
      await builder.locator("[data-automation-scratch]").click();
      await builder.getByRole("button", { name: "Add a step" }).last().click();
      await builder.locator('[data-automation-palette-item="callWebhook"]').click();
      const card = builder.locator('[data-automation-card="effect-0"]');
      await expect(card.locator("[data-automation-webhook-restricted]")).toBeVisible();
      await expect(card.getByRole("combobox")).toHaveCount(0);
    });

    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});
