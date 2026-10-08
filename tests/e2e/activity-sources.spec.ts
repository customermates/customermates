import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema, type RecordModel, type RecordRef } from "../../features/records/record-model.schema";
import {
  MutateRecordSchema,
  RecordOperationResultSchema,
  type RecordMutation,
} from "../../features/records/record-query.schema";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";

async function model(database: Client, companyId: string): Promise<RecordModel> {
  const result = await database.query(
    'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0]?.snapshot);
}

async function mutation(page: Page, database: Client, companyId: string, change: RecordMutation) {
  const response = await page.request.post("/api/v1/records/mutate", {
    data: MutateRecordSchema.parse({
      expectedRevision: (await model(database, companyId)).revision,
      idempotencyKey: randomUUID(),
      mutation: change,
    }),
  });
  expect(response.status(), await response.text()).toBe(200);
  const result = RecordOperationResultSchema.parse(await response.json());
  if (result.status !== "completed") throw new Error("Expected synchronous fixture mutation");
  return result;
}

async function createRecord(page: Page, database: Client, companyId: string, key: string, name: string) {
  const typeId = presetId(companyId, key);
  const result = await mutation(page, database, companyId, {
    action: "create",
    typeId,
    fields: [{ fieldId: presetId(companyId, `${key}.name`), value: { kind: "text", value: name } }],
  });
  const ref = result.refs.find((candidate) => candidate.typeId === typeId);
  if (!ref) throw new Error(`Expected ${key} fixture reference`);
  return ref;
}

async function timeline(page: Page, ref: RecordRef) {
  await page.goto(`/en/records/${ref.typeId}/${ref.recordId}`);
  const history = page.locator('main [data-detail-panel="activities"]');
  if (!(await history.isVisible())) await page.getByRole("tab", { name: "Activities", exact: true }).click();
  await expect(history).toBeVisible();
  return history;
}

test("shows contacts' messages on organizations and deals but not tasks, following the relationship switch", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const email = "activity-sources@example.test";
  const contactTypeId = presetId(companyId, "contact");
  const personResult = await mutation(page, database, companyId, {
    action: "create",
    typeId: contactTypeId,
    fields: [
      { fieldId: presetId(companyId, "contact.firstName"), value: { kind: "text", value: "Source" } },
      { fieldId: presetId(companyId, "contact.lastName"), value: { kind: "text", value: "Person" } },
    ],
    identities: [{ provider: "mail", value: email }],
  });
  const person = personResult.refs.find((ref) => ref.typeId === contactTypeId);
  if (!person) throw new Error("Expected contact fixture reference");
  const organization = await createRecord(page, database, companyId, "organization", "Source organization");
  const deal = await createRecord(page, database, companyId, "deal", "Source deal");
  const task = await createRecord(page, database, companyId, "task", "Source task");
  for (const [relation, source, target] of [
    ["contact.organizations", person, organization],
    ["deal.contacts", deal, person],
    ["task.contacts", task, person],
  ] as const)
    await mutation(page, database, companyId, {
      action: "link",
      relationId: presetId(companyId, relation),
      source,
      target,
    });
  const account = randomUUID();
  const thread = randomUUID();
  const body = "Message from the linked contact";
  await database.query(
    'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","displayName","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,\'Sources mailbox\',NOW())',
    [account, companyId, workspace.userId, randomUUID()],
  );
  await database.query(
    'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,state,subject,"lastMessageAt","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'open\',\'Sources conversation\',NOW(),NOW())',
    [thread, companyId, account, randomUUID()],
  );
  await database.query(
    'INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,\'mail\',$4,$4,$4,\'Source Person\',NOW())',
    [randomUUID(), companyId, thread, email],
  );
  await database.query(
    'INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",provider,direction,origin,sender,recipients,"bodyText","sentAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'mail\',\'inbound\',\'unipile\',$6,$7,$8,NOW(),NOW())',
    [
      randomUUID(),
      companyId,
      thread,
      account,
      randomUUID(),
      JSON.stringify({ attendeeId: email, identifier: email, displayName: "Source Person" }),
      JSON.stringify({ to: [], cc: [], bcc: [] }),
      body,
    ],
  );

  for (const ref of [person, organization, deal]) {
    const history = await timeline(page, ref);
    await expect(history.getByText(body, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`timeline-${ref.typeId}.png`), fullPage: true });
  }
  const taskHistory = await timeline(page, task);
  await expect(taskHistory.locator("ol > li").first()).toBeVisible();
  await expect(taskHistory.getByText(body, { exact: true })).toHaveCount(0);

  const current = await model(database, companyId);
  const dealContacts = current.relationships.find(
    (relationship) => relationship.id === presetId(companyId, "deal.contacts"),
  );
  if (!dealContacts) throw new Error("Expected preset deal contacts relationship");
  expect(dealContacts).toMatchObject({ messagesOnSource: true, messagesOnTarget: false });
  const response = await page.request.post("/api/v1/model/apply", {
    data: {
      expectedRevision: current.revision,
      idempotencyKey: randomUUID(),
      operations: [{ operation: "putRelationship", relationship: { ...dealContacts, messagesOnSource: false } }],
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  const dealHistory = await timeline(page, deal);
  await expect(dealHistory.locator("ol > li").first()).toBeVisible();
  await expect(dealHistory.getByText(body, { exact: true })).toHaveCount(0);
  const organizationHistory = await timeline(page, organization);
  await expect(organizationHistory.getByText(body, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
