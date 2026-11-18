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
  await expect(deck.getByText("New conversation · from draft-sender@example.test")).toBeVisible();

  // The queue list sits beside the card from the md breakpoint on; on a phone the card fills the drawer alone.
  const queue = deck.getByRole("list", { name: "Drafts waiting for review" });
  if ((page.viewportSize()?.width ?? 1280) >= 768) {
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
