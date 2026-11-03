import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { isTestInbox, TEST_ACCOUNT_IDS } from "./live-allowlist.mjs";

// Read-only email backfill against the receiver test inbox through the Unipile development application, on a local
// database. Short pages and one page per step exercise a multi-step folder pass even with a small fixture inbox,
// the case whose reconciliation used to be skipped. scripts/verify/live-checks.mjs loads the egress guard.
vi.mock("@/ee/messaging/ingest/backfill/paginate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ee/messaging/ingest/backfill/paginate")>()),
  BACKFILL_EMAIL_PAGE_BUDGET: 1,
  UNIPILE_EMAIL_MAX_LIMIT: 2,
}));

const RECEIVER_ACCOUNT = "acc_01m6b96qwsfesbrjkgd8xxmzjy";
const receiver = process.env.UNIPILE_TEST_RECEIVER_EMAIL ?? "";
const databaseUrl = process.env.CRM_E2E_LIVE_UNIPILE === "true" ? getLocalDatabaseTestUrl() : null;
const describeLive = databaseUrl ? describe : describe.skip;

type Folder = { id: string; name: string | null; role: string | null };

/** Messages in an IMAP folder since a date, counted read-only (EXAMINE) straight from the test mailbox. */
function imapCount(folder: string, since: Date) {
  const output = execFileSync(
    "python3",
    ["-I", resolve("tests/e2e/live/imap-count.py"), "--folder", folder, "--since", since.toISOString().slice(0, 10)],
    { encoding: "utf8" },
  );
  const result = JSON.parse(output) as { count?: number; error?: string };
  if (typeof result.count !== "number") throw new Error(`Counting the receiver inbox failed: ${result.error ?? "no count"}`);
  return result.count;
}

describeLive("email backfill against the receiver test inbox", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const accountId = randomUUID();
  const staleId = `live-stale-${randomUUID()}`;
  let inbox: Folder;
  let steps: Record<string, number> = {};

  async function drain() {
    const di = await import("@/core/di");
    const token = await di.getClaimBackfillInteractor().invoke({ connectedAccountId: accountId });
    expect(token, "claiming the backfill").toBeTruthy();
    const plan = await di.getPrepareBackfillInteractor().invoke({ connectedAccountId: accountId, token: token! });
    if (plan.status !== "ready" || plan.kind !== "email") throw new Error(`Backfill plan: ${JSON.stringify(plan)}`);

    steps = {};
    for (const source of plan.sources) {
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      for (let step = 1; ; step++) {
        const page = await di.getBackfillEmailsInteractor().invoke({ connectedAccountId: accountId, source, cursor });
        steps[source] = step;
        cursor = page.nextCursor;
        if (page.done) {
          expect(page.complete, `folder ${source} completed`).toBe(true);
          break;
        }
        if (!cursor || seenCursors.has(cursor)) throw new Error(`Folder ${source} did not advance its backfill cursor`);
        seenCursors.add(cursor);
      }
    }
    await di.getReleaseBackfillClaimInteractor().invoke({ connectedAccountId: accountId, token: token!, complete: true });
    return plan.sources;
  }

  const inInbox = async () =>
    (
      await client.query<{ unipileMessageId: string; isHidden: boolean }>(
        'SELECT "unipileMessageId", "isHidden" FROM "MessagingMessage" WHERE "connectedAccountId"=$1 AND NOT "isDraft" AND $2 = ANY("folderIds")',
        [accountId, inbox.id],
      )
    ).rows;

  beforeAll(async () => {
    if (!isTestInbox(receiver) || !TEST_ACCOUNT_IDS.has(RECEIVER_ACCOUNT)) throw new Error("Not the designated test inbox");
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [userId, `live-backfill-${userId}@example.invalid`, "Live", "Backfill", companyId],
    );
    await client.query('DELETE FROM "ConnectedAccount" WHERE "unipileAccountId"=$1', [RECEIVER_ACCOUNT]);
    await client.query(
      `INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "hasMessaging", "emailAddress", "updatedAt")
       VALUES ($1, $2, $3, 'mail', $4, 'ok', true, $5, CURRENT_TIMESTAMP)`,
      [accountId, companyId, userId, RECEIVER_ACCOUNT, receiver],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("drains every folder in several budgeted steps and stores what the mailbox holds", async () => {
    const { backfillSince } = await import("@/ee/messaging/ingest/backfill/paginate");
    const since = backfillSince();
    const sources = await drain();

    const { rows } = await client.query<{ folders: Folder[] }>('SELECT "folders" FROM "ConnectedAccount" WHERE "id"=$1', [accountId]);
    inbox = rows[0].folders.find((folder) => folder.role === "inbox") ?? rows[0].folders.find((folder) => folder.name === "INBOX")!;
    expect(inbox, "the INBOX folder").toBeTruthy();
    expect(sources).toContain(inbox.id);
    expect(steps[inbox.id], "INBOX took more than one step").toBeGreaterThan(1);

    const stored = await inInbox();
    expect(new Set(stored.map((row) => row.unipileMessageId)).size).toBe(stored.length);
    expect(stored.length).toBe(imapCount("INBOX", since));

    const pass = await client.query('SELECT 1 FROM "MessagingFolderPassMessage" WHERE "connectedAccountId"=$1', [accountId]);
    expect(pass.rowCount, "no folder pass is left behind").toBe(0);
  });

  it("removes a placement the provider no longer has and keeps every real one after a multi-step pass", async () => {
    const before = await inInbox();
    const thread = await client.query<{ messagingThreadId: string }>(
      'SELECT "messagingThreadId" FROM "MessagingMessage" WHERE "connectedAccountId"=$1 LIMIT 1',
      [accountId],
    );
    await client.query(
      `INSERT INTO "MessagingMessage"
        ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId", "provider", "direction",
         "origin", "sender", "recipients", "bodyText", "folderIds", "sentAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'mail', 'inbound', 'external', $6::jsonb, '{"to":[],"cc":[],"bcc":[]}'::jsonb,
         'moved away', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        randomUUID(),
        companyId,
        thread.rows[0].messagingThreadId,
        accountId,
        staleId,
        JSON.stringify({ attendeeId: "gone@example.invalid", identifier: "gone@example.invalid", displayName: null }),
        [inbox.id],
      ],
    );

    await drain();
    expect(steps[inbox.id]).toBeGreaterThan(1);

    const after = await inInbox();
    expect(after.map((row) => row.unipileMessageId).sort()).toEqual(before.map((row) => row.unipileMessageId).sort());
    expect(after.every((row) => !row.isHidden)).toBe(true);
    const stale = await client.query<{ folderIds: string[]; isHidden: boolean }>(
      'SELECT "folderIds", "isHidden" FROM "MessagingMessage" WHERE "unipileMessageId"=$1',
      [staleId],
    );
    expect(stale.rows[0]).toEqual({ folderIds: [], isHidden: true });
  });
});
