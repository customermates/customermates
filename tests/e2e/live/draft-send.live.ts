import type { Page } from "@playwright/test";
import type { Client } from "pg";

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "../fixtures";
import { isTestInbox, TEST_ACCOUNT_IDS } from "./live-allowlist.mjs";

// Real sends through the Unipile development application, from the sender test inbox to the receiver test inbox.
// scripts/verify/live-checks.mjs starts these with the secrets in the environment and the egress guard in the server.
const SENDER_ACCOUNT = "acc_01m42y7hj1ecva9pb0sycgqq51";
const RECEIVER_ACCOUNT = "acc_01m42y800decva9pbdfk85p4kv";
const sender = process.env.UNIPILE_TEST_SENDER_EMAIL ?? "";
const receiver = process.env.UNIPILE_TEST_RECEIVER_EMAIL ?? "";
const ledgerFile = process.env.CRM_LIVE_SEND_LEDGER ?? "";

test.beforeAll(() => {
  if (process.env.CRM_E2E_LIVE_UNIPILE !== "true") throw new Error("Run live checks through scripts/verify/live-checks.mjs");
  if (!isTestInbox(sender) || !isTestInbox(receiver)) throw new Error("The configured fixture addresses are not the designated test inboxes");
  if (!TEST_ACCOUNT_IDS.has(SENDER_ACCOUNT) || !TEST_ACCOUNT_IDS.has(RECEIVER_ACCOUNT)) throw new Error("Unknown fixture account");
});

type LedgerEntry = { forwarded?: boolean; blocked?: string; path?: string; reason?: string; status?: number; at: string };

function ledgerSince(startedAt: string): LedgerEntry[] {
  if (!existsSync(ledgerFile)) return [];
  return readFileSync(ledgerFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEntry)
    .filter((entry) => entry.at >= startedAt);
}

const forwardedSends = (startedAt: string) =>
  ledgerSince(startedAt).filter((entry) => entry.forwarded && /\/emails(\/send)?$/.test(entry.path ?? "")).length;

async function connectSender(database: Client, workspace: { companyId: string; userId: string }) {
  await database.query('DELETE FROM "ConnectedAccount" WHERE "unipileAccountId"=$1', [SENDER_ACCOUNT]);
  const id = randomUUID();
  await database.query(
    'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","emailAddress","displayName","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,$5,$6,NOW())',
    [id, workspace.companyId, workspace.userId, SENDER_ACCOUNT, sender, "Live check sender"],
  );
  return id;
}

/** Distinct copies in the receiver test inbox, counted read-only over IMAP (the provider's listing can lag minutes). */
function receiverCopies(marker: string) {
  const output = execFileSync("python3", ["-I", resolve("tests/e2e/live/imap-count.py"), marker], { encoding: "utf8" });
  const result = JSON.parse(output) as { count?: number; error?: string };
  if (typeof result.count !== "number") throw new Error(`Counting the receiver inbox failed: ${result.error ?? "no count"}`);
  return result.count;
}

/** Waits until the receiver inbox has the marked email, then checks that it arrived exactly once. */
async function expectDeliveredOnce(marker: string) {
  await expect.poll(() => receiverCopies(marker), { timeout: 240000, intervals: [5000, 10000, 15000] }).toBeGreaterThanOrEqual(1);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 20000));
  expect(receiverCopies(marker)).toBe(1);
}

async function saveDraft(page: Page, connectedAccountId: string, subject: string, body: string) {
  const response = await page.request.post("/api/v1/messaging/drafts", {
    data: { connectedAccountId, recipients: [receiver], subject, body },
  });
  expect(response.status(), "saving the draft").toBe(200);
  return (await response.json()) as { id: string; messagingThreadId: string; draftRevision: string };
}

test("refuses a live send to an address outside the test inboxes without contacting the provider", async ({ page, database, workspace }) => {
  const startedAt = new Date().toISOString();
  const accountId = await connectSender(database, workspace);
  const response = await page.request.post("/api/v1/messaging/send-email", {
    data: {
      connectedAccountId: accountId,
      to: [{ identifier: `not-a-test-inbox-${randomUUID()}@example.invalid` }],
      subject: `LIVE-GUARD ${randomUUID()}`,
      body: "Must never leave the machine",
      bodyFormat: "markdown",
    },
  });
  expect(response.ok()).toBe(false);
  expect(forwardedSends(startedAt)).toBe(0);
  expect(ledgerSince(startedAt).some((entry) => entry.blocked === "unipile" && /test inbox/.test(entry.reason ?? ""))).toBe(true);
});

test("sends a saved draft once to the receiver test inbox", async ({ page, database, workspace }) => {
  const startedAt = new Date().toISOString();
  const marker = `LIVE-S1-${Date.now().toString(36)}`;
  const accountId = await connectSender(database, workspace);
  const draft = await saveDraft(page, accountId, `${marker} draft send`, `${marker} body`);
  await page.goto(`/en/inbox?threadId=${draft.messagingThreadId}`);
  const actions = page.locator("[data-message-actions]");
  await actions.getByRole("button", { name: "Send draft", exact: true }).click();
  await expect(page.getByText(/^Message sent\./)).toBeVisible({ timeout: 120000 });
  expect(forwardedSends(startedAt)).toBe(1);
  await expectDeliveredOnce(marker);
});

test("edits a draft in the inbox and sends the edited text once", async ({ page, database, workspace }) => {
  const startedAt = new Date().toISOString();
  const marker = `LIVE-S2-${Date.now().toString(36)}`;
  const accountId = await connectSender(database, workspace);
  const draft = await saveDraft(page, accountId, `${marker} edited draft`, `${marker} first version`);
  await page.goto(`/en/inbox?threadId=${draft.messagingThreadId}`);
  await page.locator("[data-message-actions]").getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.locator("form:has(#inbox-reply-send)").getByRole("textbox", { name: "Write a reply...", exact: true });
  await expect(editor).toContainText("first version");
  await editor.fill(`${marker} edited version`);
  await page.locator("#inbox-reply-send").click();
  await expect(page.getByText(/^Message sent\./)).toBeVisible({ timeout: 120000 });
  expect(forwardedSends(startedAt)).toBe(1);
  await expectDeliveredOnce(marker);
  const stored = await database.query(
    'SELECT "bodyText" FROM "MessagingMessage" WHERE "companyId"=$1 AND NOT "isDraft" AND subject LIKE $2',
    [workspace.companyId, `${marker}%`],
  );
  for (const row of stored.rows) expect(String(row.bodyText)).toContain("edited version");
});
