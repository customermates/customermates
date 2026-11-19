import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { DomainEvent } from "@/features/event/domain-events";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createTestMessagingRepo } from "@/tests/helpers/messaging-repository";

import { ProcessEmailNewWebhookInteractor } from "../email/process-email-new-webhook.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("a new-email webhook announces an email once", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const accountId = randomUUID();
  const ownerId = randomUUID();
  const unipileAccountId = `unipile-${accountId}`;
  const account = {
    id: accountId,
    companyId,
    unipileAccountId,
    provider: "mail",
    status: "ok",
    emailAddress: "owner@example.test",
    sentFolderIds: [],
  };
  const publish = vi.fn().mockResolvedValue(undefined);

  function handler() {
    return new ProcessEmailNewWebhookInteractor(
      createTestMessagingRepo(),
      { findAccountByUnipileIdUnscoped: () => Promise.resolve(account) } as never,
      { publish } as never,
      () => ({ synchronize: () => Promise.resolve() }),
    );
  }

  function webhook(emailId: string, receivedAt: Date) {
    return {
      type: "email.new" as const,
      account_id: unipileAccountId,
      receivedAt,
      payload: {
        email: {
          id: emailId,
          message_id: `<${emailId}@example.test>`,
          thread_id: `thread-${emailId}`,
          subject: "Receipt",
          body: "Thank you for your payment.",
          date: "2026-07-16T09:00:00.000Z",
          folders: ["reference"],
          from: [{ email: "billing@example.test", display_name: "Billing" }],
          to: [{ email: "owner@example.test", display_name: "Owner" }],
        },
      },
    };
  }

  async function storedAt(emailId: string): Promise<Date> {
    const rows = await client.query('SELECT "createdAt" FROM "MessagingMessage" WHERE "unipileMessageId" = $1', [
      emailId,
    ]);
    expect(rows.rows).toHaveLength(1);
    return rows.rows[0].createdAt;
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, `redelivery-${ownerId}@example.com`, "Redelivery", "Owner", companyId],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [accountId, companyId, ownerId, "mail", unipileAccountId, "ok"],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("announces a new email, and again when the same webhook is processed a second time after a failure", async () => {
    const emailId = `mail-${randomUUID()}`;
    const receivedAt = new Date(Date.now() - 1000);
    publish.mockClear();

    await runWithoutTenant(() => handler().invoke(webhook(emailId, receivedAt)));
    await runWithoutTenant(() => handler().invoke(webhook(emailId, receivedAt)));

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[0]?.[0]).toBe(DomainEvent.MESSAGING_EMAIL_RECEIVED);
    expect(publish.mock.calls[1]?.[1]).toMatchObject({ entityId: publish.mock.calls[0]?.[1].entityId });
  });

  it("stays silent when the provider sends the webhook again for an email that is already stored", async () => {
    const emailId = `mail-${randomUUID()}`;
    publish.mockClear();

    await runWithoutTenant(() => handler().invoke(webhook(emailId, new Date(Date.now() - 1000))));
    const firstStoredAt = await storedAt(emailId);
    await runWithoutTenant(() => handler().invoke(webhook(emailId, new Date(firstStoredAt.getTime() + 60_000))));

    expect(publish).toHaveBeenCalledTimes(1);
    expect(await storedAt(emailId)).toEqual(firstStoredAt);
  });
});
