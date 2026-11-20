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
    await expect(reason.getByRole("link")).toHaveAttribute("href", /\/settings\/agents$/);
  } else {
    await expect(reason).toHaveCount(0);
  }

  // No provider key is stored, so the own-key runtime explains itself on both editions.
  await card.getByRole("radio", { name: /Your own key/ }).click();
  await expect(card.locator("[data-agent-reason]")).toBeVisible();
  await expect(card.locator("[data-agent-reason]").getByRole("link")).toHaveAttribute(
    "href",
    /\/settings\/agents$/,
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
  // The rest of an old link survives the redirect: the page looks the routine up by id. This id belongs to no
  // routine, so the page says that it was not found, and the link is used up like any other focus link.
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("focus")).toBeNull();
  await expect(page.getByRole("dialog", { name: "Routine", exact: true })).toHaveCount(0);
});

test("a member who can only read automations is not handed a prefilled builder that cannot save", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  const model = await page.request.post("/api/v1/model/read", { data: {} });
  const { revision, types } = (await model.json()) as {
    revision: number;
    types: { id: string; archived: boolean; embedded: boolean }[];
  };
  const typeId = types.find((type) => !type.archived && !type.embedded)?.id;
  expect(typeId).toBeTruthy();
  const saved = await page.request.post("/api/v1/roles/save", {
    data: {
      name: `Automations read only ${randomUUID().slice(0, 6)}`,
      description: "May read routines and automations, nothing else",
      permissions: [{ resource: "routines", actions: ["readAll"] }],
      recordGrants: [],
      expectedRevision: revision,
      idempotencyKey: randomUUID(),
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const roleId = ((await saved.json()) as { role: { id: string } }).role.id;
  const member = await secondUser(browser, database, companyId, testInfo, roleId);
  try {
    // The address the list toolbar used to offer ("Automate this list") to everyone who can read automations.
    await member.page.goto(companyPath(companyId, `/automations?new=${typeId}`));
    await expect(member.page.getByRole("heading", { name: "Automations", level: 1 })).toBeAttached();
    await member.page.waitForLoadState("networkidle");
    await expect(member.page.getByRole("dialog", { name: "New automation" })).toHaveCount(0);
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
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

    await test.step("Call a webhook is switched off in the palette and says that the role cannot see webhooks", async () => {
      const builder = await openNewAutomation(member.page);
      await builder.locator("[data-automation-scratch]").click();
      await builder.getByRole("button", { name: "Add a step" }).last().click();
      const item = builder.locator('[data-automation-palette-item="callWebhook"]');
      await expect(item).toBeDisabled();
      await expect(item.locator("[data-automation-palette-reason]")).toHaveText(
        "Your role cannot see the webhooks of this workspace.",
      );
    });

    let agentSettingsHref = "";
    await test.step("an agent step that is not set up links to the agent settings", async () => {
      const builder = member.page.getByRole("dialog", { name: "New automation" });
      await builder.locator('[data-automation-palette-item="agent"]').click();
      const card = builder.locator('[data-automation-card="effect-0"]');
      await card.locator('[data-agent-runtime="runner"]').click();
      // The member has no runner, so this way of running is not set up and the card says what to do about it.
      // Reading the workspace settings is part of every role, so the card links to them: the sentence that names an
      // administrator is only for a member who cannot open them, and no role is like that.
      const reason = card.locator("[data-agent-reason]");
      await expect(reason.getByRole("link")).toHaveAttribute("href", /\/settings\/agents$/);
      await expect(reason.locator("[data-agent-settings-ask]")).toHaveCount(0);
      agentSettingsHref = (await reason.getByRole("link").getAttribute("href")) ?? "";
    });

    await test.step("removing the step moves the focus to the add button, not to nowhere", async () => {
      const builder = member.page.getByRole("dialog", { name: "New automation" });
      await builder.getByRole("button", { name: "Remove step" }).click();
      await expect(builder.locator('[data-automation-card="effect-0"]')).toHaveCount(0);
      await expect(builder.getByRole("button", { name: "Add a step" }).last()).toBeFocused();
    });

    await test.step("the linked agent settings open for this role and say that it cannot see runners", async () => {
      // A second tab, so the unsaved automation in the builder does not ask before the page is left.
      const settings = await member.page.context().newPage();
      const settingsErrors = collectPageErrors(settings);
      await settings.goto(agentSettingsHref);
      await expect(settings).toHaveURL(/\/settings\/agents$/);
      await expect(settings.locator("[data-agent-runners-card] [data-agent-runners-withheld]")).toHaveText(
        "Your role cannot see runners, so none are listed here.",
      );
      expect(settingsErrors).toEqual([]);
      await settings.close();
    });

    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});
