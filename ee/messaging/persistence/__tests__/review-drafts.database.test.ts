import type { MessagingAttendee } from "../../messaging.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { createTestMessagingRepo } from "@/tests/helpers/messaging-repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function attendee(identifier: string, isSelf = false): MessagingAttendee {
  return {
    records: [],
    attendeeId: identifier,
    identifier,
    displayName: null,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    isSelf,
  };
}

describeDatabase("draft review queue on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ownerId = randomUUID();
  const colleagueId = randomUUID();
  const strangerId = randomUUID();
  const ownAccountId = randomUUID();
  const sharedAccountId = randomUUID();
  const privateAccountId = randomUUID();
  const foreignAccountId = randomUUID();
  const owner = createMockUser({
    id: ownerId,
    companyId,
    email: `review-owner-${ownerId}@example.invalid`,
  }) satisfies TenantUser;

  async function insertUser(id: string, company: string) {
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [id, `review-${id}@example.invalid`, "Review", "User", company],
    );
  }

  async function insertAccount(id: string, company: string, userId: string, shared: boolean) {
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "emailAddress", "shared", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)',
      [id, company, userId, MessagingProvider.google, `unipile-${id}`, "ok", `account-${id}@example.invalid`, shared],
    );
  }

  async function insertThread(args: { company?: string; accountId: string; sharedToCrm?: boolean }) {
    const id = randomUUID();
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "state", "sharedToCrm", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)',
      [
        id,
        args.company ?? companyId,
        args.accountId,
        MessagingProvider.google,
        "single",
        `thread_${id}`,
        "open",
        args.sharedToCrm ?? false,
      ],
    );
    return id;
  }

  async function insertMessage(args: {
    company?: string;
    threadId: string;
    accountId: string;
    isDraft: boolean;
    bodyText: string;
    direction?: "inbound" | "outbound";
    isEvent?: boolean;
    sentAt?: Date;
    updatedAt?: Date;
  }) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO "MessagingMessage"
         ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId", "provider", "direction",
          "origin", "sender", "recipients", "bodyText", "isDraft", "isEvent", "sentAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15)`,
      [
        id,
        args.company ?? companyId,
        args.threadId,
        args.accountId,
        `message_${id}`,
        MessagingProvider.google,
        args.direction ?? "outbound",
        "unipile",
        JSON.stringify(attendee("sender@example.invalid", args.direction !== "inbound")),
        JSON.stringify({ to: [attendee("client@example.invalid")], cc: [], bcc: [] }),
        args.bodyText,
        args.isDraft,
        args.isEvent ?? false,
        args.sentAt ?? new Date(),
        args.updatedAt ?? new Date(),
      ],
    );
    return id;
  }

  function review(limit = 50) {
    return runWithTenant(owner, () => createTestMessagingRepo().listReviewDrafts({ limit, historySize: 2 }));
  }

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, otherCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);
    await insertUser(ownerId, companyId);
    await insertUser(colleagueId, companyId);
    await insertUser(strangerId, otherCompanyId);
    await insertAccount(ownAccountId, companyId, ownerId, false);
    await insertAccount(sharedAccountId, companyId, colleagueId, true);
    await insertAccount(privateAccountId, companyId, colleagueId, false);
    await insertAccount(foreignAccountId, otherCompanyId, strangerId, true);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, otherCompanyId]]);
    await client.end();
  });

  it("lists the drafts the user may send, newest first, each with its conversation and latest messages", async () => {
    const ownThread = await insertThread({ accountId: ownAccountId });
    const sharedThread = await insertThread({ accountId: sharedAccountId });
    const sharedOnlyThread = await insertThread({ accountId: privateAccountId, sharedToCrm: true });
    const hiddenThread = await insertThread({ accountId: privateAccountId });
    const foreignThread = await insertThread({ company: otherCompanyId, accountId: foreignAccountId });

    const base = Date.now() - 60_000;
    for (const [index, bodyText] of ["First", "Second", "Third"].entries()) {
      await insertMessage({
        threadId: ownThread,
        accountId: ownAccountId,
        isDraft: false,
        bodyText,
        direction: index % 2 === 0 ? "inbound" : "outbound",
        sentAt: new Date(base + index * 1000),
      });
    }
    await insertMessage({
      threadId: ownThread,
      accountId: ownAccountId,
      isDraft: false,
      isEvent: true,
      bodyText: "Joined the conversation",
      sentAt: new Date(base + 4000),
    });
    const ownDraft = await insertMessage({
      threadId: ownThread,
      accountId: ownAccountId,
      isDraft: true,
      bodyText: "Own draft",
      updatedAt: new Date(base + 10_000),
    });
    const sharedDraft = await insertMessage({
      threadId: sharedThread,
      accountId: sharedAccountId,
      isDraft: true,
      bodyText: "Draft on a shared account",
      updatedAt: new Date(base + 20_000),
    });
    await insertMessage({
      threadId: sharedOnlyThread,
      accountId: privateAccountId,
      isDraft: true,
      bodyText: "Draft on a colleague's account, conversation shared only",
    });
    await insertMessage({
      threadId: hiddenThread,
      accountId: privateAccountId,
      isDraft: true,
      bodyText: "Draft on a colleague's private conversation",
    });
    await insertMessage({
      company: otherCompanyId,
      threadId: foreignThread,
      accountId: foreignAccountId,
      isDraft: true,
      bodyText: "Draft of another workspace",
    });

    const result = await review();

    expect(result.total).toBe(2);
    expect(result.entries.map((entry) => entry.draft.id)).toEqual([sharedDraft, ownDraft]);
    const own = result.entries[1];
    expect(own.thread).toMatchObject({ id: ownThread, isOwner: true });
    expect(own.history.map((message) => message.bodyText)).toEqual(["Second", "Third"]);
    expect(result.entries[0].thread).toMatchObject({ id: sharedThread, isOwner: false, accountShared: true });
    expect(result.entries[0].history).toEqual([]);

    expect((await review(1)).entries.map((entry) => entry.draft.id)).toEqual([sharedDraft]);
    expect(
      await runWithTenant(owner, () => createTestMessagingRepo().listReviewDrafts({ limit: 0, historySize: 2 })),
    ).toEqual({ entries: [], total: 2 });
  });

  it("leaves out a draft whose current version was already handed to the provider until it is edited", async () => {
    const before = (await review()).entries.map((entry) => entry.draft.id);
    const thread = await insertThread({ accountId: ownAccountId });
    const revision = new Date(Date.now() + 30_000);
    const draft = await insertMessage({
      threadId: thread,
      accountId: ownAccountId,
      isDraft: true,
      bodyText: "Draft with an unconfirmed send",
      updatedAt: revision,
    });
    expect((await review()).entries.map((entry) => entry.draft.id)).toEqual([draft, ...before]);

    await client.query(
      'INSERT INTO "MessagingDraftSend" ("id", "companyId", "connectedAccountId", "draftMessageId", "draftRevision", "state", "contentHash", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
      [randomUUID(), companyId, ownAccountId, draft, revision, "unknown", "hash"],
    );
    const claimed = await review();
    expect(claimed.entries.map((entry) => entry.draft.id)).toEqual(before);
    expect(claimed.total).toBe(before.length);

    await client.query('UPDATE "MessagingMessage" SET "updatedAt" = $2 WHERE "id" = $1', [
      draft,
      new Date(revision.getTime() + 1000),
    ]);
    expect((await review()).entries.map((entry) => entry.draft.id)).toEqual([draft, ...before]);

    for (const state of ["sent", "sending"]) {
      await client.query(
        'UPDATE "MessagingDraftSend" SET "state" = $2::"MessagingDraftSendState", "claimedAt" = CURRENT_TIMESTAMP WHERE "draftMessageId" = $1',
        [draft, state],
      );
      expect((await review()).entries.map((entry) => entry.draft.id)).toEqual(before);
    }
  });
});
