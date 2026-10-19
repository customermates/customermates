import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";
import type { TenantUser } from "@/features/user/user.schema";
import type { MessagingService } from "../../messaging.service";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { PermissionService } from "@/core/base/permission.service";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { createTestMessagingRepo } from "@/tests/helpers/messaging-repository";
import { createMockUser } from "@/tests/helpers/mock-user";
import { DRAFT_SEND_RETENTION_DAYS } from "../../draft-send";
import { PrismaConnectedAccountRepo } from "../../persistence/prisma-connected-account.repository";
import { PrismaUnipileWebhookRepo } from "../../persistence/prisma-unipile-webhook.repository";
import { DiscardDraftInteractor } from "../discard-draft.interactor";
import { PruneDraftSendsInteractor } from "../prune-draft-sends.interactor";
import { SaveDraftInteractor } from "../save-draft.interactor";
import { DraftSendGate } from "../draft-send-gate";
import { SendEmailInteractor, type SendEmailData } from "../send-email.interactor";

vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Result = { ok: boolean; data?: unknown; error?: { issues: Array<{ params?: { error?: string } }> } };
type DraftEmail = SendEmailData & { draftMessageId: string; draftRevision: string };

function failureCode(result: unknown) {
  return (result as Result).error?.issues[0]?.params?.error;
}

describeDatabase("pruning draft send records", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const accountId = randomUUID();
  const ownerEmail = `draft-pruner-${ownerId}@example.invalid`;
  const tenant = createMockUser({ id: ownerId, companyId, email: ownerEmail }) satisfies TenantUser;
  const otherCompanyId = randomUUID();
  const otherOwnerId = randomUUID();
  const otherAccountId = randomUUID();

  const accounts = () =>
    new PrismaConnectedAccountRepo(
      new PermissionService(),
      new PrismaUnipileWebhookRepo(),
      new PrismaBillingUsageRepo(),
    );
  const prune = () => new PruneDraftSendsInteractor(createTestMessagingRepo()).invoke();

  function emailProvider(outcome: "accept" | "unknown" = "accept") {
    const copies = new Map<string, unknown>();
    const sendEmail = vi.fn((input: { subject: string; body: string; to: Array<{ email: string }> }) => {
      if (outcome === "unknown")
        return Promise.resolve({ ok: false, error: CustomErrorCode.unipileSendOutcomeUnknown });
      const id = `unipile-${randomUUID()}`;
      const messageId = `<${randomUUID()}@example.invalid>`;
      copies.set(id, {
        id,
        message_id: messageId,
        thread_id: `provider-thread-${randomUUID()}`,
        subject: input.subject,
        body: input.body,
        date: new Date().toISOString(),
        from: [{ email: ownerEmail }],
        to: input.to,
        cc: [],
        bcc: [],
        folders: [],
      });
      return Promise.resolve({ ok: true, data: { id, messageId } });
    });
    const getEmail = vi.fn(({ emailId }: { emailId: string }) => {
      const copy = copies.get(emailId);
      return copy ? Promise.resolve(copy) : Promise.reject(new Error("not indexed yet"));
    });
    return { sendEmail, getEmail };
  }

  const sendEmail = (
    data: SendEmailData,
    provider: ReturnType<typeof emailProvider>,
    repo: ReturnType<typeof createTestMessagingRepo> = createTestMessagingRepo(),
  ) =>
    runWithTenant(tenant, () =>
      new SendEmailInteractor(
        repo,
        accounts(),
        provider as unknown as MessagingService,
        mockEntitlementService(),
        new DraftSendGate(repo),
      ).invoke(data),
    );

  const newEmail = async (label: string): Promise<DraftEmail> => {
    const recipient = `${label}-${randomUUID()}@example.invalid`;
    const saved = await runWithTenant(tenant, () =>
      new SaveDraftInteractor(createTestMessagingRepo(), accounts(), mockEntitlementService()).invoke({
        connectedAccountId: accountId,
        recipients: [recipient],
        subject: `${label} subject`,
        body: `${label} body`,
      }),
    );
    if (!saved.ok || !saved.data.draftRevision) throw new Error("draft was not saved");
    return {
      connectedAccountId: accountId,
      to: [{ identifier: recipient }],
      subject: `${label} subject`,
      body: `${label} body`,
      bodyFormat: "markdown",
      draftMessageId: saved.data.id,
      draftRevision: saved.data.draftRevision,
    };
  };

  const age = (draftMessageId: string, days: number) =>
    client.query(
      'UPDATE "MessagingDraftSend" SET "updatedAt" = CURRENT_TIMESTAMP - make_interval(days => $2::int) WHERE "draftMessageId" = $1',
      [draftMessageId, days],
    );
  const sendRecord = async (draftMessageId: string) =>
    (
      await client.query<{ state: string }>('SELECT "state" FROM "MessagingDraftSend" WHERE "draftMessageId" = $1', [
        draftMessageId,
      ])
    ).rows[0] ?? null;
  const insertThread = async (company: string, account: string) => {
    const threadId = randomUUID();
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [threadId, company, account, MessagingProvider.mail, "single", `provider-thread-${threadId}`],
    );
    return threadId;
  };
  const insertMessage = async (company: string, account: string, isDraft: boolean) => {
    const messageId = randomUUID();
    await client.query(
      'INSERT INTO "MessagingMessage" ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId", "provider", "direction", "origin", "sender", "isDraft", "sentAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        messageId,
        company,
        await insertThread(company, account),
        account,
        `unipile-${messageId}`,
        MessagingProvider.mail,
        "outbound",
        "unipile",
        JSON.stringify({ identifier: ownerEmail }),
        isDraft,
      ],
    );
    return messageId;
  };
  const insertSendRecord = async (args: {
    company: string;
    account: string;
    draftMessageId: string;
    state: "sending" | "sent" | "unknown";
    days: number;
  }) => {
    await client.query(
      'INSERT INTO "MessagingDraftSend" ("id", "companyId", "connectedAccountId", "draftMessageId", "draftRevision", "state", "contentHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5::"MessagingDraftSendState", $6, CURRENT_TIMESTAMP - make_interval(days => $7::int))',
      [randomUUID(), args.company, args.account, args.draftMessageId, args.state, `hash-${randomUUID()}`, args.days],
    );
    return args.draftMessageId;
  };

  beforeAll(async () => {
    await client.connect();
    const workspaces = [
      { company: companyId, owner: ownerId, account: accountId, email: ownerEmail },
      {
        company: otherCompanyId,
        owner: otherOwnerId,
        account: otherAccountId,
        email: `draft-pruner-${otherOwnerId}@example.invalid`,
      },
    ];
    for (const { company, owner, account, email } of workspaces) {
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [company]);
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [owner, email, "Draft", "Pruner", company],
      );
      await client.query(
        'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "emailAddress", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
        [account, company, owner, MessagingProvider.mail, `unipile-${account}`, "ok", email],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1::text[])', [[companyId, otherCompanyId]]);
    await client.end();
  });

  it(`deletes the record of an accepted send ${DRAFT_SEND_RETENTION_DAYS} days after it once its draft is gone`, async () => {
    const expired = await newEmail("expired-sent");
    const recent = await newEmail("recent-sent");
    const provider = emailProvider();
    expect((await sendEmail(expired, provider)).ok).toBe(true);
    expect((await sendEmail(recent, provider)).ok).toBe(true);
    await age(expired.draftMessageId, DRAFT_SEND_RETENTION_DAYS + 1);
    await age(recent.draftMessageId, DRAFT_SEND_RETENTION_DAYS - 1);

    const result = await prune();

    expect(result.pruned).toBeGreaterThanOrEqual(1);
    expect(await sendRecord(expired.draftMessageId)).toBeNull();
    expect(await sendRecord(recent.draftMessageId)).toEqual({ state: "sent" });
    expect(failureCode(await sendEmail(expired, provider))).toBe(CustomErrorCode.draftMessageNotFound);
    expect(provider.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("keeps an expired record while its draft exists, so neither an unconfirmed nor an accepted draft goes out twice", async () => {
    const unconfirmed = await newEmail("expired-unknown");
    const leftover = await newEmail("expired-leftover");
    const unknownProvider = emailProvider("unknown");
    const provider = emailProvider();
    const failing = createTestMessagingRepo();
    failing.completeDraftSendRemovingDraft = () => Promise.reject(new Error("database unavailable"));
    expect(failureCode(await sendEmail(unconfirmed, unknownProvider))).toBe(CustomErrorCode.unipileSendOutcomeUnknown);
    expect((await sendEmail(leftover, provider, failing)).ok).toBe(true);
    await age(unconfirmed.draftMessageId, DRAFT_SEND_RETENTION_DAYS + 15);
    await age(leftover.draftMessageId, DRAFT_SEND_RETENTION_DAYS + 15);

    await prune();

    expect(await sendRecord(unconfirmed.draftMessageId)).toEqual({ state: "unknown" });
    expect(await sendRecord(leftover.draftMessageId)).toEqual({ state: "sent" });
    expect(failureCode(await sendEmail(unconfirmed, provider))).toBe(CustomErrorCode.draftSendOutcomeUnknown);
    expect(((await sendEmail(leftover, provider)) as Result).data).toMatchObject({ repeated: true });
    expect(unknownProvider.sendEmail).toHaveBeenCalledOnce();
    expect(provider.sendEmail).toHaveBeenCalledOnce();

    await prune();

    expect(await sendRecord(leftover.draftMessageId)).toBeNull();
    expect(await sendRecord(unconfirmed.draftMessageId)).toEqual({ state: "unknown" });
  });

  it(`deletes the record of an unconfirmed send ${DRAFT_SEND_RETENTION_DAYS} days after it once its draft is discarded`, async () => {
    const unconfirmed = await newEmail("discarded-unknown");
    await sendEmail(unconfirmed, emailProvider("unknown"));
    const discarded = await runWithTenant(tenant, () =>
      new DiscardDraftInteractor(createTestMessagingRepo(), mockEntitlementService()).invoke({
        messageId: unconfirmed.draftMessageId,
        draftRevision: unconfirmed.draftRevision,
      }),
    );
    expect(discarded.ok).toBe(true);

    await prune();
    expect(await sendRecord(unconfirmed.draftMessageId)).toEqual({ state: "unknown" });

    await age(unconfirmed.draftMessageId, DRAFT_SEND_RETENTION_DAYS + 1);
    await prune();
    expect(await sendRecord(unconfirmed.draftMessageId)).toBeNull();
  });

  it("deletes an expired record whose reply draft became the sent message and keeps that message", async () => {
    const sentReply = await insertMessage(companyId, accountId, false);
    await insertSendRecord({
      company: companyId,
      account: accountId,
      draftMessageId: sentReply,
      state: "sent",
      days: DRAFT_SEND_RETENTION_DAYS + 1,
    });

    await prune();

    expect(await sendRecord(sentReply)).toBeNull();
    expect((await client.query('SELECT "isDraft" FROM "MessagingMessage" WHERE "id" = $1', [sentReply])).rows).toEqual([
      { isDraft: false },
    ]);
  });

  it("walks every workspace in batches past the records it keeps", async () => {
    const days = DRAFT_SEND_RETENTION_DAYS + 10;
    const stillSending = await insertSendRecord({
      company: otherCompanyId,
      account: otherAccountId,
      draftMessageId: await insertMessage(otherCompanyId, otherAccountId, true),
      state: "sending",
      days,
    });
    const goneSent = await insertSendRecord({
      company: otherCompanyId,
      account: otherAccountId,
      draftMessageId: randomUUID(),
      state: "sent",
      days,
    });
    const goneUnknown = await insertSendRecord({
      company: otherCompanyId,
      account: otherAccountId,
      draftMessageId: randomUUID(),
      state: "unknown",
      days,
    });
    const goneHere = await insertSendRecord({
      company: companyId,
      account: accountId,
      draftMessageId: randomUUID(),
      state: "sent",
      days,
    });
    const repo = createTestMessagingRepo();
    const before = new Date(Date.now() - DRAFT_SEND_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let after: string | null = null;
    let batches = 0;

    do {
      const batch: { pruned: number; next: string | null } = await repo.pruneDraftSendsUnscoped({
        before,
        after,
        limit: 1,
      });
      after = batch.next;
      batches += 1;
    } while (after);

    expect(batches).toBeGreaterThan(4);
    expect(await sendRecord(stillSending)).toEqual({ state: "sending" });
    expect(await sendRecord(goneSent)).toBeNull();
    expect(await sendRecord(goneUnknown)).toBeNull();
    expect(await sendRecord(goneHere)).toBeNull();
  });
});
