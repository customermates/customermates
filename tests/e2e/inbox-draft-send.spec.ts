import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { assertPublishedResponse } from "../helpers/openapi-validator";
import { pdfFixture } from "../helpers/record-file-fixtures";
import { presetId } from "../../features/records/crm-preset";
import { pagePath } from "./app-paths";
import { postOk } from "./api";
import { expectBlockedEmailScripts } from "./browser-diagnostics";
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { localWebhookSecret, responseLostAfterAcceptance, sentCopyUnavailable } from "./local-email-provider.mjs";
import { e2eAppMode } from "./workspace-switching";

test.skip(e2eAppMode() === "self-hosted", "Messaging (Inbox drafts and sending) is available on Customermates Cloud only");

const RECIPIENT = "draft-recipient@example.test";

type SavedDraft = { id: string; messagingThreadId: string; draftRevision: string };

type AcceptedEmail = { accountId: string; id: string; subject: string; email: Record<string, unknown> };

function acceptedEmails(subject: string): AcceptedEmail[] {
  const ledger = localE2eEnvironment().emailLedgerFile;
  if (!existsSync(ledger)) return [];
  return readFileSync(ledger, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AcceptedEmail)
    .filter((entry) => entry.subject === subject);
}

function acceptedSends(subject: string) {
  return acceptedEmails(subject).length;
}

function syncSentCopy(page: Page, accepted: AcceptedEmail) {
  const body = JSON.stringify({
    type: "email.new",
    account_id: accepted.accountId,
    payload: { email: accepted.email },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", localWebhookSecret).update(`${timestamp}.${body}`).digest("hex");
  return page.request.post("/api/webhooks/unipile/v2", {
    headers: { "content-type": "application/json", "unipile-signature": `t=${timestamp},v0=${signature}` },
    data: body,
  });
}

async function connectSender(database: Client, workspace: { companyId: string; userId: string }) {
  const accountId = randomUUID();
  await database.query(
    'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","emailAddress","displayName","sentFolderIds","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,$5,$6,ARRAY[\'e2e_sent\'],NOW())',
    [
      accountId,
      workspace.companyId,
      workspace.userId,
      `e2e_local_${randomUUID()}`,
      "draft-sender@example.test",
      "Draft Sender",
    ],
  );
  return accountId;
}

function saveNewEmailDraft(page: Page, connectedAccountId: string, subject: string): Promise<SavedDraft> {
  return postOk(page, "/api/v1/messaging/drafts", {
    connectedAccountId,
    recipients: [RECIPIENT],
    subject,
    body: "Draft prepared by an agent",
  });
}

async function reviseDraft(page: Page, draft: SavedDraft, subject: string, body: string): Promise<SavedDraft> {
  const response = await page.request.post(`/api/v1/messaging/threads/${draft.messagingThreadId}/drafts`, {
    data: { recipients: [RECIPIENT], subject, body },
  });
  expect(response.status(), await response.text()).toBe(200);
  const revised = await response.json();
  assertPublishedResponse("/v1/messaging/threads/{id}/drafts", "post", 200, revised);
  return revised;
}

type SendTarget = { connectedAccountId: string } | { threadId: string };

function sendAgain(page: Page, draft: SavedDraft, subject: string, target: SendTarget) {
  return page.request.post("/api/v1/messaging/send-email", {
    data: {
      ...target,
      to: [{ identifier: RECIPIENT }],
      subject,
      body: "Draft prepared by an agent",
      bodyFormat: "markdown",
      draftMessageId: draft.id,
      draftRevision: draft.draftRevision,
    },
  });
}

async function openDraftConversation(page: Page, draft: SavedDraft) {
  await page.goto(pagePath(page, `/inbox?threadId=${draft.messagingThreadId}`));
  const draftActions = page.locator("[data-message-actions]");
  await expect(draftActions.getByRole("button", { name: "Send draft", exact: true })).toBeVisible();
  return draftActions;
}

test("sends a new-email draft from the inbox once and reports it although the sent copy cannot be read back", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  expectBlockedEmailScripts(page);
  const accountId = await connectSender(database, workspace);
  const subject = `Agent draft ${randomUUID()} ${sentCopyUnavailable}`;
  const draft = await saveNewEmailDraft(page, accountId, subject);

  const draftActions = await openDraftConversation(page, draft);
  await draftActions.getByRole("button", { name: "Send draft", exact: true }).click();

  await expect(page.getByText("Message sent. It appears in the inbox once your mailbox syncs it.")).toBeVisible();
  await expect
    .poll(async () => (await database.query('SELECT 1 FROM "MessagingMessage" WHERE id=$1', [draft.id])).rowCount)
    .toBe(0);
  const claim = await database.query(
    'SELECT state FROM "MessagingDraftSend" WHERE "companyId"=$1 AND "draftMessageId"=$2',
    [workspace.companyId, draft.id],
  );
  expect(claim.rows).toEqual([{ state: "sent" }]);

  const targets: SendTarget[] = [{ connectedAccountId: accountId }, { threadId: draft.messagingThreadId }];
  for (const target of targets) {
    const repeated = await sendAgain(page, draft, subject, target);
    expect(repeated.status(), await repeated.text()).toBe(202);
    const body = await repeated.json();
    assertPublishedResponse("/v1/messaging/send-email", "post", 202, body);
    expect(body).toMatchObject({ sent: true, repeated: true });
  }
  expect(acceptedSends(subject)).toBe(1);
  expect(errors).toEqual([]);
});

test("never sends a draft twice after the provider accepted it but its answer was lost", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  expectBlockedEmailScripts(page);
  const accountId = await connectSender(database, workspace);
  const subject = `Agent draft ${randomUUID()} ${responseLostAfterAcceptance}`;
  const draft = await saveNewEmailDraft(page, accountId, subject);

  let draftActions = await openDraftConversation(page, draft);
  await draftActions.getByRole("button", { name: "Send draft", exact: true }).click();
  await expect(
    page.getByText(
      "The provider reported an error, but the message may still have gone out. Check the conversation before sending it again.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);

  draftActions = await openDraftConversation(page, draft);
  await draftActions.getByRole("button", { name: "Send draft", exact: true }).click();
  await expect(
    page.getByText(/^This draft may already have been sent, but that couldn't be confirmed\./),
  ).toBeVisible();
  await expect(draftActions.getByRole("button", { name: "Send draft", exact: true })).toBeVisible();

  const targets: SendTarget[] = [{ connectedAccountId: accountId }, { threadId: draft.messagingThreadId }];
  for (const target of targets) {
    const refused = await sendAgain(page, draft, subject, target);
    expect(refused.status(), await refused.text()).toBe(409);
    const body = await refused.json();
    assertPublishedResponse("/v1/messaging/send-email", "post", 409, body);
    expect(body.error.issues[0].customCode).toBe("draftSendOutcomeUnknown");
  }
  const stored = await database.query(
    'SELECT m."isDraft", c.state FROM "MessagingMessage" m JOIN "MessagingDraftSend" c ON c."draftMessageId"=m.id AND c."companyId"=m."companyId" WHERE m.id=$1',
    [draft.id],
  );
  expect(stored.rows).toEqual([{ isDraft: true, state: "unknown" }]);
  expect(acceptedSends(subject)).toBe(1);
  expect(errors).toEqual([]);
});

test("shows a draft as sent once its copy syncs after the provider accepted it and answered 504", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  expectBlockedEmailScripts(page);
  const accountId = await connectSender(database, workspace);
  const subject = `Agent draft ${randomUUID()} ${responseLostAfterAcceptance}`;
  const draft = await saveNewEmailDraft(page, accountId, subject);

  const draftActions = await openDraftConversation(page, draft);
  await draftActions.getByRole("button", { name: "Send draft", exact: true }).click();
  await expect(
    page.getByText(
      "The provider reported an error, but the message may still have gone out. Check the conversation before sending it again.",
    ),
  ).toBeVisible();
  const [accepted] = acceptedEmails(subject);
  expect(accepted).toBeDefined();

  const synced = await syncSentCopy(page, accepted);
  expect(synced.status(), await synced.text()).toBe(200);

  const claim = await database.query(
    'SELECT c.state, c."sentMessageId", c."sentThreadId" FROM "MessagingDraftSend" c WHERE c."companyId"=$1 AND c."draftMessageId"=$2',
    [workspace.companyId, draft.id],
  );
  const copy = await database.query(
    'SELECT id, "messagingThreadId" FROM "MessagingMessage" WHERE "companyId"=$1 AND "unipileMessageId"=$2 AND NOT "isDraft"',
    [workspace.companyId, accepted.id],
  );
  expect(copy.rows).toHaveLength(1);
  expect(claim.rows).toEqual([
    { state: "sent", sentMessageId: copy.rows[0].id, sentThreadId: copy.rows[0].messagingThreadId },
  ]);
  expect((await database.query('SELECT 1 FROM "MessagingMessage" WHERE id=$1', [draft.id])).rowCount).toBe(0);

  await page.goto(pagePath(page, `/inbox?threadId=${copy.rows[0].messagingThreadId}`));
  await expect(
    page.frameLocator('iframe[title="Email content"]').getByText("Draft prepared by an agent", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send draft", exact: true })).toHaveCount(0);

  const targets: SendTarget[] = [{ connectedAccountId: accountId }, { threadId: draft.messagingThreadId }];
  for (const target of targets) {
    const repeated = await sendAgain(page, draft, subject, target);
    expect(repeated.status(), await repeated.text()).toBe(200);
    const body = await repeated.json();
    assertPublishedResponse("/v1/messaging/send-email", "post", 200, body);
    expect(body).toMatchObject({
      id: copy.rows[0].id,
      messagingThreadId: copy.rows[0].messagingThreadId,
      repeated: true,
    });
  }
  expect(acceptedSends(subject)).toBe(1);
  expect(errors).toEqual([]);
});

test("lets the user load the agent's latest version or send their own after the draft changed meanwhile", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  expectBlockedEmailScripts(page);
  const accountId = await connectSender(database, workspace);
  const subject = `Agent draft ${randomUUID()}`;
  const draft = await saveNewEmailDraft(page, accountId, subject);
  const conversation = page.getByRole("region", { name: "Conversation", exact: true });
  const reply = page.getByRole("textbox", { name: "Write a reply...", exact: true });
  const send = page.locator("#inbox-reply-send");
  const conflict = page.getByRole("status").filter({ hasText: "This draft changed after you opened it." });

  await openDraftConversation(page, draft);
  await conversation.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(reply).toHaveText("Draft prepared by an agent");
  await reply.fill("My first version");
  await reviseDraft(page, draft, subject, "Agent revision one");
  await send.click();

  await expect(conflict).toBeVisible();
  await expect(reply).toHaveText("My first version");
  await expect(send).toBeDisabled();
  await conflict.getByRole("button", { name: "Load latest version", exact: true }).click();
  await expect(conflict).toBeHidden();
  await expect(reply).toHaveText("Agent revision one");
  expect(acceptedSends(subject)).toBe(0);

  await reply.fill("My final version");
  await reviseDraft(page, draft, subject, "Agent revision two");
  await send.click();
  await expect(conflict).toBeVisible();
  await conflict.getByRole("button", { name: "Send mine", exact: true }).click();

  await expect(page.getByText(/^Message sent\./)).toBeVisible();
  await expect.poll(() => acceptedSends(subject)).toBe(1);
  const [accepted] = acceptedEmails(subject);
  expect(JSON.stringify(accepted.email)).toContain("My final version");
  expect(JSON.stringify(accepted.email)).not.toContain("Agent revision");
  await expect
    .poll(async () => (await database.query('SELECT 1 FROM "MessagingMessage" WHERE id=$1', [draft.id])).rowCount)
    .toBe(0);
  expect(errors).toEqual([]);
});

test("keeps a draft's PDF while editing and removes it as a new revision before sending", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  expectBlockedEmailScripts(page);
  const accountId = await connectSender(database, workspace);
  const typeId = presetId(workspace.companyId, "organization");
  const fieldId = randomUUID();
  const model = await postOk(page, "/api/v1/model/read", {});
  await postOk(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [{ operation: "putField", field: {
      id: fieldId, typeId, label: "Invoices", valueType: "file", required: false, multiple: true,
      behavior: { kind: "input" }, options: [], position: 99,
    } }],
  });
  const pdf = Buffer.from(pdfFixture([["Invoice to review before sending"]]));
  const upload = await postOk(page, "/api/v1/files/uploads", {
    typeId, fieldId, name: "invoice.pdf", mimeType: "application/pdf", size: pdf.byteLength,
  });
  const uploaded = await page.request.put(upload.upload.url, { headers: upload.upload.headers, data: pdf });
  expect(uploaded.status(), await uploaded.text()).toBe(200);
  const subject = `Draft attachment removal ${randomUUID()}`;
  const draft: SavedDraft = await postOk(page, "/api/v1/messaging/drafts", {
    connectedAccountId: accountId, recipients: [RECIPIENT], subject,
    body: "Draft prepared by an agent", fileIds: [upload.fileId],
  });
  const stored = async () => (await database.query(
    'SELECT "attachmentsMeta", "bodyText", "updatedAt" FROM "MessagingMessage" WHERE id=$1', [draft.id],
  )).rows[0];
  const edit = async () => {
    await openDraftConversation(page, draft);
    await page.getByRole("region", { name: "Conversation", exact: true }).getByRole("button", { name: "Edit", exact: true }).click();
  };
  const update = async () => {
    await page.getByRole("button", { name: "More send options", exact: true }).click();
    await page.getByRole("menuitem", { name: "Update draft", exact: true }).click();
  };

  await edit();
  await expect(page.getByRole("button", { name: /invoice\.pdf/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Write a reply...", exact: true }).fill("Owner reviewed this invoice");
  await update();
  await expect.poll(async () => (await stored()).bodyText).toBe("Owner reviewed this invoice");
  expect((await stored()).attachmentsMeta).toEqual([expect.objectContaining({ fileId: upload.fileId })]);
  const beforeRemoval = new Date((await stored()).updatedAt).toISOString();

  await edit();
  await page.getByRole("button", { name: "Remove attachment", exact: true }).click();
  await expect(page.getByRole("button", { name: /invoice\.pdf/ })).toHaveCount(0);
  await update();
  await expect.poll(async () => (await stored()).attachmentsMeta).toEqual([]);
  expect(new Date((await stored()).updatedAt).toISOString()).not.toBe(beforeRemoval);
  expect((await database.query('SELECT "draftMessageId" FROM "RecordFile" WHERE id=$1', [upload.fileId])).rows)
    .toEqual([{ draftMessageId: null }]);
  const stale = await sendAgain(page, { ...draft, draftRevision: beforeRemoval }, subject, { connectedAccountId: accountId });
  expect(stale.status(), await stale.text()).toBe(409);
  expect(acceptedSends(subject)).toBe(0);

  const actions = await openDraftConversation(page, draft);
  await actions.getByRole("button", { name: "Send draft", exact: true }).click();
  await expect(page.getByText(/^Message sent\./)).toBeVisible();
  expect(acceptedSends(subject)).toBe(1);
  expect(errors).toEqual([]);
});
