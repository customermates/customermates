import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { pagePath } from "./app-paths";
import { postOk } from "./api";
import { expectBlockedEmailScripts } from "./browser-diagnostics";
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { e2eAppMode } from "./workspace-switching";

test.skip(
  e2eAppMode() === "self-hosted",
  "Messaging (Inbox drafts and sending) is available on Customermates Cloud only",
);

const RECIPIENT = "draft-recipient@example.test";

type SavedDraft = { id: string; messagingThreadId: string; draftRevision: string };

type AcceptedEmail = { subject: string; email: { body?: string } };

function acceptedEmails(subject: string): AcceptedEmail[] {
  const ledger = localE2eEnvironment().emailLedgerFile;
  if (!existsSync(ledger)) return [];
  return readFileSync(ledger, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AcceptedEmail)
    .filter((entry) => entry.subject === subject);
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

function saveDraft(page: Page, connectedAccountId: string, subject: string, body: string): Promise<SavedDraft> {
  return postOk(page, "/api/v1/messaging/drafts", {
    connectedAccountId,
    recipients: [RECIPIENT],
    subject,
    body,
  });
}

async function draftRows(database: Client, ids: string[]) {
  const result = await database.query('SELECT id FROM "MessagingMessage" WHERE id = ANY($1) AND "isDraft"', [ids]);
  return result.rows.map((row: { id: string }) => row.id).sort();
}

test("reviews saved drafts one by one: send, keep for later, edit and send", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  expectBlockedEmailScripts(page);
  const accountId = await connectSender(database, workspace);
  const run = randomUUID();
  const subjects = { first: `Review one ${run}`, second: `Review two ${run}`, third: `Review three ${run}` };
  const first = await saveDraft(page, accountId, subjects.first, "First draft prepared by an agent");
  const second = await saveDraft(page, accountId, subjects.second, "Second draft prepared by an agent");
  const third = await saveDraft(page, accountId, subjects.third, "Third draft prepared by an agent");

  await page.goto(pagePath(page, "/inbox"));
  const open = page.getByRole("button", { name: "Review drafts", exact: true });
  await expect(open).toContainText("3");
  await open.click();

  const deck = page.locator("[data-draft-review]");
  await expect(deck.getByText("3 drafts left")).toBeVisible();
  await expect(deck.locator(`[data-draft-review-card="${third.id}"]`)).toBeVisible();
  await expect(deck.locator("[data-draft-review-body]")).toContainText(subjects.third);
  await expect(deck.locator("[data-draft-review-body]")).toContainText("Third draft prepared by an agent");

  // The queue list sits beside the card from the md breakpoint on and names the recipient there, so the card
  // only says where the draft is sent from. On a phone the card fills the drawer alone and names the recipient.
  const queue = deck.getByRole("list", { name: "Drafts waiting for review" });
  const sendingLine = "New conversation · from draft-sender@example.test";
  if ((page.viewportSize()?.width ?? 1280) >= 768) {
    await expect(deck.locator("[data-draft-review-sending-line]")).toHaveText(sendingLine);
    await expect(deck.locator("[data-draft-review-recipient]")).toBeHidden();
    await expect(queue.getByRole("button")).toHaveCount(3);
    await queue.getByRole("button").nth(2).click();
    await expect(deck.locator(`[data-draft-review-card="${first.id}"]`)).toBeVisible();
    await expect(queue.getByRole("button").first()).toHaveAttribute("aria-current", "true");
    for (const [index, expected] of [
      [1, third],
      [2, second],
      [1, third],
    ] as const) {
      await queue.getByRole("button").nth(index).click();
      await expect(deck.locator(`[data-draft-review-card="${expected.id}"]`)).toBeVisible();
    }
  } else {
    await expect(queue).toBeHidden();
    await expect(deck.locator("[data-draft-review-recipient]")).toContainText(sendingLine);
    await expect(deck.locator("[data-draft-review-sending-line]")).toBeHidden();
  }

  await deck.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = deck.getByRole("textbox", { name: "Draft text" });
  await editor.fill("Third draft, rewritten before sending");
  await deck.getByRole("button", { name: "Save", exact: true }).click();
  await expect(deck.locator("[data-draft-review-body]")).toContainText("Third draft, rewritten before sending");

  await deck.getByRole("button", { name: "Send", exact: true }).click();
  await expect(deck.locator(`[data-draft-review-card="${second.id}"]`)).toBeVisible();
  await expect(deck.getByText("2 drafts left")).toBeVisible();
  await expect.poll(() => acceptedEmails(subjects.third).length).toBe(1);
  expect(acceptedEmails(subjects.third)[0]?.email.body).toContain("Third draft, rewritten before sending");

  await page.keyboard.press("ArrowLeft");
  await expect(deck.locator(`[data-draft-review-card="${first.id}"]`)).toBeVisible();
  await expect(deck.getByText("1 draft left")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(deck.locator("[data-draft-review-done]")).toBeVisible();
  await expect(deck.getByText("All drafts reviewed")).toBeVisible();
  await expect(deck.getByText("Sent: 2. Kept for later: 1.")).toBeVisible();
  await expect.poll(() => acceptedEmails(subjects.first).length).toBe(1);

  expect(acceptedEmails(subjects.second)).toHaveLength(0);
  await expect.poll(() => draftRows(database, [first.id, second.id, third.id])).toEqual([second.id]);

  await deck.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(deck).toBeHidden();
  await expect(page.getByRole("button", { name: "Review drafts", exact: true })).toContainText("1");
  expect(errors).toEqual([]);
});

test("keeps the decisions in view with many long drafts in a short window", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  expectBlockedEmailScripts(page);
  const accountId = await connectSender(database, workspace);
  const run = randomUUID();
  const longBody = Array.from({ length: 60 }, (_, line) => `Paragraph ${line + 1} of a long draft.`).join("\n\n");
  for (let index = 0; index < 24; index += 1) await saveDraft(page, accountId, `Many ${index} ${run}`, longBody);

  const html = await (await page.request.get(pagePath(page, "/inbox"))).text();
  expect(html).toContain("Review drafts");

  const wide = (page.viewportSize()?.width ?? 1280) >= 768;
  if (wide) await page.setViewportSize({ width: 1024, height: 560 });
  await page.goto(pagePath(page, "/inbox"));
  const open = page.getByRole("button", { name: "Review drafts", exact: true });
  await expect(open).toContainText("24");
  await open.click();

  const deck = page.locator("[data-draft-review]");
  await expect(deck.getByText("24 drafts left")).toBeVisible();
  const actions = deck.locator("[data-draft-review-actions]");
  for (const name of ["Send", "Edit", "Keep", "Discard draft"])
    await expect(actions.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });

  const scrolls = (selector: string) =>
    deck.locator(selector).evaluate((element) => element.scrollHeight > element.clientHeight + 1);
  expect(await scrolls("[data-draft-review-scroll]")).toBe(true);
  if (wide) {
    expect(await scrolls("[data-draft-review-queue]")).toBe(true);
    const last = deck.getByRole("list", { name: "Drafts waiting for review" }).getByRole("button").last();
    await last.scrollIntoViewIfNeeded();
    await last.click();
    const front = deck.locator("[data-draft-review-queue] button").first();
    await expect(front).toHaveAttribute("aria-current", "true");
    await expect(front).toBeInViewport({ ratio: 1 });
  }

  await deck.locator("[data-draft-review-scroll]").evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(actions.getByRole("button", { name: "Send", exact: true })).toBeInViewport({ ratio: 1 });
  expect(errors).toEqual([]);
});

test("opens a reply at the draft and scrolls up through the earlier messages in full", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  expectBlockedEmailScripts(page);
  const accountId = await connectSender(database, workspace);
  const run = randomUUID();
  const person = `earlier-${run}@example.test`;
  const threadId = randomUUID();
  await database.query(
    'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,state,subject,"lastMessageAt","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'open\',$5,NOW(),NOW())',
    [threadId, workspace.companyId, accountId, randomUUID(), `Rollout ${run}`],
  );
  await database.query(
    'INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,\'mail\',$4,$4,$4,\'Earlier Person\',NOW())',
    [randomUUID(), workspace.companyId, threadId, person],
  );
  const paragraphs = (index: number) =>
    Array.from({ length: 6 }, (_, line) => `Earlier message ${index}, paragraph ${line + 1}.`).join("\n\n");
  for (let index = 1; index <= 6; index += 1) {
    const quoted = index === 6 ? "\n\nOn Monday Draft Sender wrote:\n> Quoted text that the review leaves out" : "";
    await database.query(
      'INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",provider,direction,origin,sender,recipients,"bodyText","bodyHtml","sentAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'mail\',\'inbound\',\'unipile\',$6,$7,$8,$9,NOW() - ($10 || \' minutes\')::interval,NOW())',
      [
        randomUUID(),
        workspace.companyId,
        threadId,
        accountId,
        randomUUID(),
        JSON.stringify({ attendeeId: person, identifier: person, displayName: "Earlier Person" }),
        JSON.stringify({ to: [], cc: [], bcc: [] }),
        `${paragraphs(index)}${quoted}`,
        `<p>${paragraphs(index)}</p>`,
        String(70 - index * 10),
      ],
    );
  }
  const saved = await page.request.post(`/api/v1/messaging/threads/${threadId}/drafts`, {
    data: { recipients: [person], subject: `Re: Rollout ${run}`, body: "The reply that waits for review" },
  });
  expect(saved.status(), await saved.text()).toBe(200);

  await page.goto(pagePath(page, "/inbox?review=drafts"));
  const deck = page.locator("[data-draft-review]");
  const messages = deck.locator("[data-draft-review-scroll]");
  const draft = deck.locator("[data-draft-review-body]");
  await expect(draft).toContainText("The reply that waits for review");
  await expect(draft).toBeInViewport({ ratio: 1 });
  await expect.poll(() => messages.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const earlier = deck.getByRole("list", { name: "Earlier in this conversation" });
  await expect(earlier.getByRole("listitem")).toHaveCount(6);
  await expect(earlier).toContainText("Earlier message 1, paragraph 6.");
  await expect(earlier).toContainText("Earlier message 6, paragraph 6.");
  await expect(earlier).not.toContainText("Quoted text that the review leaves out");

  const first = earlier.getByText("Earlier message 1, paragraph 1.");
  await expect(first).not.toBeInViewport();
  await messages.evaluate((element) => element.scrollTo(0, 0));
  await expect(first).toBeInViewport();
  await expect(
    deck.locator("[data-draft-review-actions]").getByRole("button", { name: "Send", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  expect(errors).toEqual([]);
});

test("opens the review from a link and discards a draft without sending it", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  expectBlockedEmailScripts(page);
  const accountId = await connectSender(database, workspace);
  const subject = `Review discard ${randomUUID()}`;
  const draft = await saveDraft(page, accountId, subject, "A draft nobody wants to send");

  await page.goto(pagePath(page, "/inbox?review=drafts"));
  const deck = page.locator("[data-draft-review]");
  await expect(deck.locator(`[data-draft-review-card="${draft.id}"]`)).toBeVisible();
  await expect(page).not.toHaveURL(/review=drafts/);

  await deck.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(deck.getByText("No drafts waiting")).toBeVisible();
  await expect.poll(() => draftRows(database, [draft.id])).toEqual([]);
  expect(acceptedEmails(subject)).toHaveLength(0);
  expect(errors).toEqual([]);
});
