import { randomUUID } from "node:crypto";
import type { Page, Locator } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema, type RecordModel } from "../../features/records/record-model.schema";
import {
  MutateRecordSchema,
  RecordOperationResultSchema,
  type RecordMutation,
} from "../../features/records/record-query.schema";
import type { RecordActivityQuery } from "../../ee/messaging/activities/record-activities.schema";
import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import {
  addFromConfigure,
  deleteFromDrawer,
  openConfigure,
  openConfigureRow,
  restoreRecentlyDeleted,
  saveDrawer,
} from "./configure";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";

const labels = englishMessages.RecordModel;

async function model(database: Client, companyId: string): Promise<RecordModel> {
  const result = await database.query(
    'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0]?.snapshot);
}

async function mutation(page: Page, current: RecordModel, change: RecordMutation) {
  const response = await page.request.post("/api/v1/records/mutate", {
    data: MutateRecordSchema.parse({
      expectedRevision: current.revision,
      idempotencyKey: randomUUID(),
      mutation: change,
    }),
  });
  expect(response.status()).toBe(200);
  const result = RecordOperationResultSchema.parse(await response.json());
  if (result.status !== "completed") throw new Error("Expected synchronous fixture mutation");
  return result;
}

async function applyPath(page: Page) {
  await saveDrawer(page);
}

async function chooseMultiple(page: Page, selector: string, value: string) {
  await page
    .locator(':is([data-overlay-surface="dialog"],[data-overlay-surface="drawer"])[role="dialog"]')
    .locator(selector)
    .click();
  const popover = page.locator('[data-slot="popover-content"][data-state="open"]');
  await popover.getByRole("combobox").fill(value);
  await popover.getByRole("option", { name: value, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
}

async function openWidgetFilters(page: Page) {
  const trigger = page.getByRole("dialog").locator("#widget-config-filters");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
}

async function addFilter(page: Page, kind: "provider" | "account" | "thread", index: number, value: string) {
  await openWidgetFilters(page);
  await page
    .locator(':is([data-overlay-surface="dialog"],[data-overlay-surface="drawer"])[role="dialog"]')
    .locator("#activity-add-filter")
    .click();
  await page
    .getByRole("option", { name: englishMessages.RecordActivityWidgets.filterKinds[kind], exact: true })
    .click();
  await chooseMultiple(page, `[id="activityQuery.filters[${index}].values"]`, value);
}

async function previewMessages(page: Page, present: string[], absent: string[] = []) {
  const dialog = page.locator(':is([data-overlay-surface="dialog"],[data-overlay-surface="drawer"])[role="dialog"]');
  await expect(dialog.locator('[data-preview-current="true"]')).toHaveCount(1);
  for (const body of present) await expect(dialog.getByText(body, { exact: true })).toBeVisible();
  for (const body of absent) await expect(dialog.getByText(body, { exact: true })).toHaveCount(0);
}

async function todayBound(page: Page, key: "after" | "before", time: string) {
  await openWidgetFilters(page);
  await page
    .locator(':is([data-overlay-surface="dialog"],[data-overlay-surface="drawer"])[role="dialog"]')
    .locator(`[id="activityQuery.${key}"]`)
    .click();
  const calendar = page.locator('[data-slot="popover-content"][data-state="open"]');
  await calendar.getByRole("button", { name: englishMessages.Common.datePresets.today, exact: true }).click();
  await calendar.locator(`[id="activityQuery.${key}-time"]`).fill(time);
  await calendar.locator(`[id="activityQuery.${key}-time"]`).press("Enter");
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
}

test("configures an activity path and applies provider, channel, conversation and date filters to a persisted widget", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const organizationTypeId = presetId(companyId, "organization");
  const contactTypeId = presetId(companyId, "contact");
  await openConfigure(page, organizationTypeId);
  const dialog = page.locator(
    ':is([data-overlay-surface="dialog"],[data-overlay-surface="drawer"],[data-overlay-surface="sheet"])[role="dialog"]',
  );
  const seedModel = await model(database, companyId);
  const seededPath = seedModel.activityPaths.find(
    (path) => path.typeId === organizationTypeId && path.label === "Contacts",
  );
  if (!seededPath) throw new Error("Expected preset contact activity path");
  await openConfigureRow(page, "Activity connections", seededPath.label);
  await deleteFromDrawer(page, "Delete activity connection");
  const pathName = "Configured client conversations";
  await addFromConfigure(page, "Activity connection");
  await dialog.locator("#label").fill(pathName);
  await dialog.getByRole("combobox", { name: labels.addPathStep, exact: true }).click();
  await page.getByRole("option", { name: "Contacts", exact: true }).click();
  await dialog.locator("#includeAudit").uncheck();
  await expect(dialog.locator("#includeMessages")).toBeChecked();
  await applyPath(page);
  const current = await model(database, companyId);
  const configured = current.activityPaths.find(
    (path) => path.typeId === organizationTypeId && path.label === pathName,
  );
  if (!configured) throw new Error("Expected UI-created activity path");
  expect(configured).toMatchObject({
    typeId: organizationTypeId,
    path: [{ relationId: presetId(companyId, "contact.organizations"), direction: "incoming" }],
    includeMessages: true,
    includeAudit: false,
    archived: false,
  });
  expect(current.activityPaths.find((path) => path.id === seededPath.id)?.archived).toBe(true);
  const organization = (
    await database.query('SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [
      companyId,
      organizationTypeId,
    ])
  ).rows[0];
  if (!organization) throw new Error("Expected fixture organization");
  const email = "activity-filters@example.test";
  const personResult = await mutation(page, current, {
    action: "create",
    typeId: contactTypeId,
    fields: [
      { fieldId: presetId(companyId, "contact.firstName"), value: { kind: "text", value: "Activity" } },
      { fieldId: presetId(companyId, "contact.lastName"), value: { kind: "text", value: "Person" } },
    ],
    identities: [{ provider: "mail", value: email }],
  });
  const person = personResult.refs.find((ref) => ref.typeId === contactTypeId);
  if (!person) throw new Error("Expected contact fixture reference");
  await mutation(page, current, {
    action: "link",
    relationId: presetId(companyId, "contact.organizations"),
    source: person,
    target: { typeId: organizationTypeId, recordId: organization.id },
  });
  const day = await page.evaluate(() => {
    const today = new Date();
    return {
      after: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString(),
      before: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString(),
      noon: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0).toISOString(),
    };
  });
  const accounts = [
    { id: randomUUID(), provider: "mail", name: "Selected activity mailbox" },
    { id: randomUUID(), provider: "mail", name: "Other activity mailbox" },
    { id: randomUUID(), provider: "google", name: "Other activity provider" },
  ];
  for (const account of accounts) {
    await database.query(
      'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","displayName","updatedAt") VALUES ($1,$2,$3,$4,$5,\'ok\',true,$6,NOW())',
      [account.id, companyId, workspace.userId, randomUUID(), account.provider, account.name],
    );
  }
  const selectedThread = randomUUID();
  const otherThread = randomUUID();
  const wrongAccountThread = randomUUID();
  const wrongProviderThread = randomUUID();
  const threads = [
    { id: selectedThread, account: accounts[0], subject: "Selected activity conversation" },
    { id: otherThread, account: accounts[0], subject: "Another activity conversation" },
    { id: wrongAccountThread, account: accounts[1], subject: "Other mailbox conversation" },
    { id: wrongProviderThread, account: accounts[2], subject: "Other provider conversation" },
  ];
  for (const thread of threads) {
    await database.query(
      'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,state,subject,"lastMessageAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'open\',$6,$7,NOW())',
      [thread.id, companyId, thread.account.id, randomUUID(), thread.account.provider, thread.subject, day.noon],
    );
    await database.query(
      'INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,$4,$5,$5,$5,\'Activity Person\',NOW())',
      [randomUUID(), companyId, thread.id, thread.account.provider, email],
    );
  }
  const selectedBody = "Selected current conversation message";
  const wrongThreadBody = "Excluded other conversation message";
  const wrongAccountBody = "Excluded other mailbox message";
  const wrongProviderBody = "Excluded other provider message";
  const oldBody = "Excluded yesterday message";
  const futureBody = "Excluded tomorrow message";
  const messages = [
    { thread: threads[0], body: selectedBody, at: day.noon },
    { thread: threads[1], body: wrongThreadBody, at: day.noon },
    { thread: threads[2], body: wrongAccountBody, at: day.noon },
    { thread: threads[3], body: wrongProviderBody, at: day.noon },
    { thread: threads[0], body: oldBody, at: new Date(new Date(day.noon).getTime() - 86400000).toISOString() },
    { thread: threads[0], body: futureBody, at: new Date(new Date(day.noon).getTime() + 86400000).toISOString() },
  ];
  for (const message of messages) {
    await database.query(
      'INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",provider,direction,origin,sender,recipients,"bodyText","sentAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,\'inbound\',\'unipile\',$7,$8,$9,$10,NOW())',
      [
        randomUUID(),
        companyId,
        message.thread.id,
        message.thread.account.id,
        randomUUID(),
        message.thread.account.provider,
        JSON.stringify({ attendeeId: email, identifier: email, displayName: "Activity Person" }),
        JSON.stringify({ to: [], cc: [], bcc: [] }),
        message.body,
        message.at,
      ],
    );
  }
  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();
  await dialog.locator("#widget-kind-activityTimeline").click();
  const widgetName = "Filtered client conversations";
  await dialog.locator("#name").fill(widgetName);
  await chooseMultiple(page, "#activity-scope-types", "Organizations");
  await previewMessages(
    page,
    messages.map((message) => message.body),
  );
  await addFilter(page, "provider", 0, englishMessages.Common.providers.mail);
  await previewMessages(
    page,
    [selectedBody, wrongThreadBody, wrongAccountBody, oldBody, futureBody],
    [wrongProviderBody],
  );
  await addFilter(page, "account", 1, accounts[0].name);
  await previewMessages(
    page,
    [selectedBody, wrongThreadBody, oldBody, futureBody],
    [wrongProviderBody, wrongAccountBody],
  );
  await addFilter(page, "thread", 2, threads[0].subject);
  await previewMessages(
    page,
    [selectedBody, oldBody, futureBody],
    [wrongProviderBody, wrongAccountBody, wrongThreadBody],
  );
  await todayBound(page, "after", "00:00:00");
  await todayBound(page, "before", "23:59:59");
  await previewMessages(
    page,
    [selectedBody],
    [wrongProviderBody, wrongAccountBody, wrongThreadBody, oldBody, futureBody],
  );
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).not.toBeVisible();
  const card = page
    .locator('[data-uid="app-card"]')
    .filter({ has: page.getByRole("heading", { name: widgetName, exact: true }) });
  await expect(card.getByText(selectedBody, { exact: true })).toBeVisible();
  const stored = (
    await database.query('SELECT id,version,"activityQuery" FROM "Widget" WHERE "companyId"=$1 AND name=$2', [
      companyId,
      widgetName,
    ])
  ).rows[0];
  if (!stored) throw new Error("Expected saved activity widget");
  const query = stored.activityQuery as RecordActivityQuery;
  expect(query.scope).toEqual({ typeIds: [organizationTypeId], records: [] });
  expect(query.filters).toEqual([
    { kind: "provider", operator: "in", values: ["mail"] },
    { kind: "account", operator: "in", values: [accounts[0].id] },
    { kind: "thread", operator: "in", values: [selectedThread] },
  ]);
  expect(query.after).toBe(day.after);
  expect(query.before).toBe(day.before);
  expect(stored.version).toBe(1);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(card.getByText(selectedBody, { exact: true })).toBeVisible();
  for (const body of [wrongProviderBody, wrongAccountBody, wrongThreadBody, oldBody, futureBody])
    await expect(card.getByText(body, { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("activity-widget-persisted-filters.png"), fullPage: true });
  const openInInbox = page.getByRole("link", { name: englishMessages.ContactHistory.ariaOpenInInbox, exact: true });
  const messageDetail = page.getByRole("dialog").filter({ has: openInInbox });
  const selectedHistoryRow = card.getByRole("button").filter({ hasText: selectedBody });
  const returnToDashboard = async () => {
    await expect(page.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
    const dashboard = page.getByRole("link", { name: "Dashboard", exact: true });
    if (!(await dashboard.isVisible())) await page.locator("#sidebar-trigger").click();
    await dashboard.click();
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expect(card.getByText(selectedBody, { exact: true })).toBeVisible();
  };
  await selectedHistoryRow.click();
  await expect(messageDetail.getByText(selectedBody, { exact: true })).toBeVisible();
  const primaryRecordChip = messageDetail.locator(`a[href="/records/${person.typeId}/${person.recordId}"]`);
  await expect(primaryRecordChip).toBeVisible();
  await primaryRecordChip.click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${person.typeId}/${person.recordId}$`));
  await expect(messageDetail).toHaveCount(0);
  for (const [field, label, value] of [
    ["contact.firstName", "First name", "Activity"],
    ["contact.lastName", "Last name", "Person"],
  ]) {
    const storedName = (
      await database.query(
        'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
        [companyId, person.typeId, person.recordId, presetId(companyId, field)],
      )
    ).rows[0]?.textValue;
    expect(storedName).toBe(value);
    await expect(page.getByRole("main").getByRole("textbox", { name: label, exact: false })).toHaveValue(value);
  }
  await returnToDashboard();
  await selectedHistoryRow.click();
  await expect(messageDetail.getByText(selectedBody, { exact: true })).toBeVisible();
  await expect(openInInbox).toHaveAttribute("href", `/en/inbox?threadId=${selectedThread}`);
  await openInInbox.click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/en/inbox" && url.searchParams.get("threadId") === selectedThread,
  );
  await expect(messageDetail).toHaveCount(0);
  await expect(page.getByText(selectedBody, { exact: true })).toBeVisible();
  const selectedInboxRow = page.locator(`[data-thread-id="${selectedThread}"]`);
  if (testInfo.project.name === "mobile") await expect(selectedInboxRow).toHaveCount(1);
  else await expect(selectedInboxRow).toBeVisible();
  await returnToDashboard();
  await page.screenshot({ path: testInfo.outputPath("activity-message-inbox-return.png"), fullPage: true });
  await openConfigure(page, organizationTypeId);
  await openConfigureRow(page, "Activity connections", pathName);
  await dialog.locator("#includeMessages").uncheck();
  await dialog.locator("#includeAudit").check();
  await applyPath(page);
  await openConfigureRow(page, "Activity connections", pathName);
  await deleteFromDrawer(page, "Delete activity connection");
  expect((await model(database, companyId)).activityPaths.find((path) => path.id === configured.id)).toMatchObject({
    includeMessages: false,
    includeAudit: true,
    archived: true,
  });
  await page.goto("/en/dashboard");
  await expect(card.getByText(englishMessages.Dashboard.activityWidget.noMatches, { exact: true })).toBeVisible();
  await expect(card.getByText(selectedBody, { exact: true })).toHaveCount(0);
  await restoreRecentlyDeleted(page, pathName);
  await openConfigure(page, organizationTypeId);
  await openConfigureRow(page, "Activity connections", pathName);
  await expect(dialog.locator("#includeMessages")).not.toBeChecked();
  await expect(dialog.locator("#includeAudit")).toBeChecked();
  await dialog.locator("#includeMessages").check();
  await dialog.locator("#includeAudit").uncheck();
  await applyPath(page);
  expect((await model(database, companyId)).activityPaths.find((path) => path.id === configured.id)).toMatchObject({
    id: configured.id,
    includeMessages: true,
    includeAudit: false,
    archived: false,
  });
  await page.goto("/en/dashboard");
  await expect(card.getByText(selectedBody, { exact: true })).toBeVisible();
  const unchangedWidget = (
    await database.query('SELECT version,"activityQuery" FROM "Widget" WHERE "companyId"=$1 AND id=$2', [
      companyId,
      stored.id,
    ])
  ).rows[0];
  expect(unchangedWidget).toEqual({ version: 1, activityQuery: stored.activityQuery });
  expect(
    (
      await database.query('SELECT COUNT(*)::integer AS count FROM "MessagingMessage" WHERE "companyId"=$1', [
        companyId,
      ])
    ).rows,
  ).toEqual([{ count: 6 }]);
  expect(errors).toEqual([]);
});
