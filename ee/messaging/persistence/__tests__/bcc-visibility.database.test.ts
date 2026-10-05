import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { draftThreadProviderId } from "../../draft-thread-id";
import { isDraftThreadId } from "../../provider";

import { PrismaMessagingRepo } from "../prisma-messaging.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("Bcc visibility on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ownerId = randomUUID();
  const colleagueId = randomUUID();
  const outsiderId = randomUUID();
  const accountId = randomUUID();
  const threadId = randomUUID();
  const owner = createMockUser({ id: ownerId, companyId });
  const colleague = createMockUser({ id: colleagueId, companyId });
  const outsider = createMockUser({ id: outsiderId, companyId: otherCompanyId });
  const attendee = (identifier: string) => ({
    attendeeId: identifier,
    identifier,
    displayName: "Synthetic",
    isSelf: false,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    contact: null,
  });

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, otherCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);
    for (const [id, tenantId] of [
      [ownerId, companyId],
      [colleagueId, companyId],
      [outsiderId, otherCompanyId],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `bcc-${id}@example.invalid`, "Bcc", "Test", tenantId],
      );
    }
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [accountId, companyId, ownerId, "google", `synthetic-bcc-${accountId}`, "ok"],
    );
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "sharedToCrm", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, TRUE, CURRENT_TIMESTAMP)',
      [threadId, companyId, accountId, "google", "single", `bcc-thread-${threadId}`],
    );
    for (const direction of ["inbound", "outbound"]) {
      await client.query(
        `INSERT INTO "MessagingMessage"
          ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId",
           "provider", "direction", "origin", "sender", "recipients", "bodyText", "sentAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'external', $8::jsonb, $9::jsonb, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          randomUUID(),
          companyId,
          threadId,
          accountId,
          `bcc-${direction}-${threadId}`,
          "google",
          direction,
          JSON.stringify(attendee("sender@example.invalid")),
          JSON.stringify({
            to: [attendee("public@example.invalid")],
            cc: [],
            bcc: [attendee("hidden@example.invalid")],
          }),
          "Synthetic Bcc visibility",
        ],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1::text[])', [[companyId, otherCompanyId]]);
    await client.end();
  });

  it.each([undefined, { page: 1, pageSize: 25 }])(
    "redacts private recipients according to account access for pagination %j",
    async (opts) => {
      await client.query('UPDATE "ConnectedAccount" SET "shared" = FALSE WHERE "id" = $1', [accountId]);
      const read = (user: typeof owner) =>
        runWithTenant(user, () => new PrismaMessagingRepo().listMessagesForThread(threadId, opts));
      const owned = await read(owner);
      expect(owned.total).toBe(2);
      expect(owned.messages.find((message) => message.direction === "outbound")?.recipients.bcc).toEqual([
        attendee("hidden@example.invalid"),
      ]);
      expect(owned.messages.find((message) => message.direction === "inbound")?.recipients.bcc).toEqual([]);

      const individuallyShared = await read(colleague);
      expect(individuallyShared.total).toBe(2);
      expect(individuallyShared.messages.every((message) => message.recipients.bcc.length === 0)).toBe(true);
      expect(JSON.stringify(individuallyShared)).not.toContain("hidden@example.invalid");
      expect(
        individuallyShared.messages.every(
          (message) => message.recipients.to[0].identifier === "public@example.invalid",
        ),
      ).toBe(true);
      expect(await read(outsider)).toEqual({ messages: [], total: 0 });

      await client.query('UPDATE "ConnectedAccount" SET "shared" = TRUE WHERE "id" = $1', [accountId]);
      const wholeAccount = await read(colleague);
      expect(wholeAccount.messages.find((message) => message.direction === "outbound")?.recipients.bcc).toEqual([
        attendee("hidden@example.invalid"),
      ]);
      expect(wholeAccount.messages.find((message) => message.direction === "inbound")?.recipients.bcc).toEqual([]);
      expect(await read(outsider)).toEqual({ messages: [], total: 0 });
    },
  );

  it("keeps recipient fingerprints private on owner and shared draft-thread detail and list reads", async () => {
    await client.query('UPDATE "ConnectedAccount" SET "shared" = FALSE, "hasMessaging" = TRUE WHERE "id" = $1', [
      accountId,
    ]);
    const repo = new PrismaMessagingRepo();
    const hidden = "private-draft@example.invalid";
    const cold = await runWithTenant(owner, () =>
      repo.findOrCreateDraftThread({
        connectedAccountId: accountId,
        provider: "google",
        recipients: [],
        bcc: [hidden],
      }),
    );
    await runWithTenant(owner, () =>
      repo.upsertThreadDraftOrThrow({
        threadId: cold.id,
        connectedAccountId: accountId,
        provider: "google",
        sender: attendee("owner@example.invalid"),
        subject: "Private target",
        bodyText: "Synthetic draft",
        recipients: { to: [], cc: [], bcc: [attendee(hidden)] },
      }),
    );
    await runWithTenant(owner, () => repo.setThreadSharedToCrm({ threadId: cold.id, shared: true }));
    const privateId = draftThreadProviderId("google", [], { bcc: [hidden] });
    expect(cold.unipileThreadId).toBe(privateId);
    for (const user of [owner, colleague]) {
      const [detail, requiredDetail, items] = await runWithTenant(user, () =>
        Promise.all([repo.findThreadById(cold.id), repo.findThreadByIdOrThrow(cold.id), repo.getItems({ take: 100 })]),
      );
      const listed = items.find((thread) => thread.id === cold.id);
      expect(listed).toBeDefined();
      for (const thread of [detail, requiredDetail, listed]) {
        expect(thread?.unipileThreadId).toBe(`draft_${cold.id}`);
        expect(isDraftThreadId(thread?.unipileThreadId ?? "")).toBe(true);
        expect(JSON.stringify(thread)).not.toContain(privateId);
        expect(JSON.stringify(thread)).not.toContain(hidden);
      }
    }
    await client.query('UPDATE "ConnectedAccount" SET "shared" = TRUE WHERE "id" = $1', [accountId]);
    const wholeAccount = await runWithTenant(colleague, () => repo.findThreadById(cold.id));
    expect(wholeAccount?.unipileThreadId).toBe(`draft_${cold.id}`);
    expect(await runWithTenant(outsider, () => repo.findThreadById(cold.id))).toBeNull();
    expect((await runWithTenant(owner, () => repo.findThreadById(threadId)))?.unipileThreadId).toBe(
      `bcc-thread-${threadId}`,
    );
  });
});
