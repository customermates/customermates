import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";
import type { TenantUser } from "@/features/user/user.schema";
import type { MessagingService } from "../../messaging.service";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { PermissionService } from "@/core/base/permission.service";
import { runWithTenant, runWithoutTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { createTestMessagingRepo } from "@/tests/helpers/messaging-repository";
import { createMockUser } from "@/tests/helpers/mock-user";
import { buildEmailMessage } from "../../unipile.mappers";
import { UnipileEmailSchema } from "../../unipile.schema";
import { PrismaConnectedAccountRepo } from "../../persistence/prisma-connected-account.repository";
import { PrismaUnipileWebhookRepo } from "../../persistence/prisma-unipile-webhook.repository";
import { SaveDraftInteractor, type SaveDraftData } from "../save-draft.interactor";
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

type Outcome = "accept" | "accepted-unknown" | "accepted-throw";
type ProviderEmail = {
  id: string;
  message_id: string;
  thread_id: string;
  subject: string;
  body: string;
  date: string;
  from: Array<{ email: string }>;
  to: Array<{ email: string }>;
  cc: Array<{ email: string }>;
  bcc: Array<{ email: string }>;
  folders: string[];
};
type Result = {
  ok: boolean;
  data?: { messageId: string | null; threadId: string | null; repeated: boolean };
  error?: { issues: Array<{ params?: { error?: string } }> };
};

function failureCode(result: unknown) {
  return (result as Result).error?.issues[0]?.params?.error;
}

function sentData(result: unknown) {
  expect((result as Result).ok).toBe(true);
  const data = (result as Result).data;
  if (!data) throw new Error("the send returned no result");
  return data;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describeDatabase("settling an unknown draft send from its synced sent copy", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const accountId = randomUUID();
  const otherAccountId = randomUUID();
  const ownerEmail = `reconcile-${ownerId}@example.invalid`;
  const otherEmail = `reconcile-other-${ownerId}@example.invalid`;
  const tenant = createMockUser({ id: ownerId, companyId, email: ownerEmail }) satisfies TenantUser;
  const address = (label: string) => `${label}-${randomUUID()}@example.invalid`;

  const accounts = () =>
    new PrismaConnectedAccountRepo(
      new PermissionService(),
      new PrismaUnipileWebhookRepo(),
      new PrismaBillingUsageRepo(),
    );
  const save = async (data: SaveDraftData) => {
    const result = await runWithTenant(tenant, () =>
      new SaveDraftInteractor(createTestMessagingRepo(), accounts(), mockEntitlementService()).invoke(data),
    );
    if (!result.ok || !result.data.draftRevision) throw new Error("draft was not saved");
    return { id: result.data.id, threadId: result.data.messagingThreadId, revision: result.data.draftRevision };
  };
  const sendEmail = (data: SendEmailData, provider: ReturnType<typeof emailProvider>) =>
    runWithTenant(tenant, () => {
      const repo = createTestMessagingRepo();
      return new SendEmailInteractor(
        repo,
        accounts(),
        provider as unknown as MessagingService,
        mockEntitlementService(),
        new DraftSendGate(repo),
      ).invoke(data);
    });

  function emailProvider(outcomes: Outcome[]) {
    const accepted: ProviderEmail[] = [];
    const gate = { wait: null as Promise<void> | null };
    const sendEmail = vi.fn(
      async (input: {
        subject: string;
        body: string;
        to: Array<{ email: string }>;
        cc?: Array<{ email: string }>;
        bcc?: Array<{ email: string }>;
      }) => {
        const outcome = outcomes[sendEmail.mock.calls.length - 1] ?? "accept";
        const id = `unipile-${randomUUID()}`;
        const messageId = `<${randomUUID()}@example.invalid>`;
        accepted.push({
          id,
          message_id: messageId,
          thread_id: `provider-thread-${randomUUID()}`,
          subject: input.subject,
          body: input.body,
          date: new Date().toISOString(),
          from: [{ email: ownerEmail }],
          to: input.to,
          cc: input.cc ?? [],
          bcc: input.bcc ?? [],
          folders: [],
        });
        if (gate.wait) await gate.wait;
        if (outcome === "accepted-unknown") return { ok: false, error: CustomErrorCode.unipileSendOutcomeUnknown };
        if (outcome === "accepted-throw") throw new Error("connection reset after the provider accepted");
        return { ok: true, data: { id, messageId } };
      },
    );
    const getEmail = vi.fn(() => Promise.reject(new Error("not indexed yet")));
    return { sendEmail, getEmail, gate, accepted };
  }

  const ingest = (email: ProviderEmail, connectedAccountId = accountId, emailAddress = ownerEmail) => {
    const message = buildEmailMessage(UnipileEmailSchema.parse(email), {
      provider: MessagingProvider.mail,
      emailAddress,
      sentFolderIds: [],
    });
    if (!message) throw new Error("sent copy did not map");
    return runWithoutTenant(() =>
      createTestMessagingRepo().ingestMessageUnscoped({ companyId, connectedAccountId, message, backfill: false }),
    );
  };
  const copyRow = async (unipileMessageId: string) => {
    const row = (
      await client.query<{ id: string; messagingThreadId: string }>(
        'SELECT "id", "messagingThreadId" FROM "MessagingMessage" WHERE "connectedAccountId" = $1 AND "unipileMessageId" = $2 AND NOT "isDraft"',
        [accountId, unipileMessageId],
      )
    ).rows[0];
    if (!row) throw new Error("the sent copy was not stored");
    return row;
  };
  const draftRow = async (id: string) =>
    (
      await client.query<{ bodyText: string | null }>(
        'SELECT "bodyText" FROM "MessagingMessage" WHERE "id" = $1 AND "isDraft"',
        [id],
      )
    ).rows[0] ?? null;
  const threadRow = async (id: string) =>
    (await client.query('SELECT "id" FROM "MessagingThread" WHERE "id" = $1', [id])).rows[0] ?? null;
  const claimRow = async (draftMessageId: string) =>
    (
      await client.query<{
        state: string;
        sentMessageId: string | null;
        sentThreadId: string | null;
        unipileMessageId: string | null;
      }>(
        'SELECT "state", "sentMessageId", "sentThreadId", "unipileMessageId" FROM "MessagingDraftSend" WHERE "companyId" = $1 AND "draftMessageId" = $2',
        [companyId, draftMessageId],
      )
    ).rows[0] ?? null;
  const newEmail = async (label: string) => {
    const recipient = address(label);
    const draft = await save({
      connectedAccountId: accountId,
      recipients: [recipient],
      subject: `${label} subject`,
      body: `${label} body`,
    });
    const input: SendEmailData = {
      connectedAccountId: accountId,
      to: [{ identifier: recipient }],
      subject: `${label} subject`,
      body: `${label} body`,
      bodyFormat: "markdown",
      draftMessageId: draft.id,
      draftRevision: draft.revision,
    };
    return { recipient, draft, input };
  };
  const unknownSend = async (label: string) => {
    const email = await newEmail(label);
    const provider = emailProvider(["accepted-unknown"]);
    const first = await sendEmail(email.input, provider);
    expect(failureCode(first)).toBe(CustomErrorCode.unipileSendOutcomeUnknown);
    expect(await claimRow(email.draft.id)).toMatchObject({ state: "unknown" });
    return { ...email, provider, copy: provider.accepted[0] };
  };

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, ownerEmail, "Reconcile", "Owner", companyId],
    );
    for (const [id, email] of [
      [accountId, ownerEmail],
      [otherAccountId, otherEmail],
    ]) {
      await client.query(
        'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "emailAddress", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
        [id, companyId, ownerId, MessagingProvider.mail, `unipile-${id}`, "ok", email],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("settles the claim when the sent copy is ingested and replays its reference to every retry", async () => {
    const { draft, input, provider, copy } = await unknownSend("ingest");

    await ingest(copy);

    const synced = await copyRow(copy.id);
    expect(await claimRow(draft.id)).toEqual({
      state: "sent",
      sentMessageId: synced.id,
      sentThreadId: synced.messagingThreadId,
      unipileMessageId: copy.id,
    });
    expect(await draftRow(draft.id)).toBeNull();
    expect(await threadRow(draft.threadId)).toBeNull();
    const byAccount = sentData(await sendEmail(input, provider));
    const byConversation = sentData(
      await sendEmail({ ...input, connectedAccountId: undefined, threadId: draft.threadId }, provider),
    );
    for (const retry of [byAccount, byConversation])
      expect(retry).toMatchObject({ repeated: true, messageId: synced.id, threadId: synced.messagingThreadId });
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });

  it("settles a send that never finished once its copy is ingested", async () => {
    const { draft, copy } = await unknownSend("stale");
    await client.query(
      `UPDATE "MessagingDraftSend" SET "state" = 'sending', "claimedAt" = NOW() - INTERVAL '6 minutes' WHERE "companyId" = $1 AND "draftMessageId" = $2`,
      [companyId, draft.id],
    );

    await ingest(copy);

    expect(await claimRow(draft.id)).toMatchObject({ state: "sent", unipileMessageId: copy.id });
    expect(await draftRow(draft.id)).toBeNull();
  });

  it("reports the send as sent when the copy synced while the provider call was still running", async () => {
    const { draft, input } = await newEmail("in-flight");
    const provider = emailProvider(["accepted-unknown"]);
    const release = deferred();
    provider.gate.wait = release.promise;

    const sending = sendEmail(input, provider);
    await vi.waitFor(() => expect(provider.accepted).toHaveLength(1));
    await ingest(provider.accepted[0]);
    expect(await claimRow(draft.id)).toMatchObject({ state: "sending" });
    release.resolve();
    const result = sentData(await sending);

    const synced = await copyRow(provider.accepted[0].id);
    expect(result).toMatchObject({ repeated: false, messageId: synced.id, threadId: synced.messagingThreadId });
    expect(await claimRow(draft.id)).toMatchObject({ state: "sent", sentMessageId: synced.id });
    expect(await draftRow(draft.id)).toBeNull();
  });

  it("settles on a retry when the copy was stored before the outcome became unknown", async () => {
    const { draft, input } = await newEmail("retry");
    const provider = emailProvider(["accepted-throw"]);
    const release = deferred();
    provider.gate.wait = release.promise;

    const sending = sendEmail(input, provider);
    await vi.waitFor(() => expect(provider.accepted).toHaveLength(1));
    await ingest(provider.accepted[0]);
    release.resolve();
    await expect(sending).rejects.toThrow("connection reset");
    expect(await claimRow(draft.id)).toMatchObject({ state: "unknown", sentMessageId: null });
    expect(await draftRow(draft.id)).not.toBeNull();

    const byConversation = sentData(
      await sendEmail({ ...input, connectedAccountId: undefined, threadId: draft.threadId }, provider),
    );
    const byAccount = sentData(await sendEmail(input, provider));

    const synced = await copyRow(provider.accepted[0].id);
    for (const retry of [byConversation, byAccount])
      expect(retry).toMatchObject({ repeated: true, messageId: synced.id, threadId: synced.messagingThreadId });
    expect(await draftRow(draft.id)).toBeNull();
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });

  it("never settles from a copy with other content, of another account or stored before the claim", async () => {
    const earlier = await newEmail("older-copy");
    const olderCopyProvider = emailProvider(["accept"]);
    sentData(
      await sendEmail(
        { ...earlier.input, draftMessageId: undefined, draftRevision: undefined, subject: "twin subject" },
        olderCopyProvider,
      ),
    );
    await ingest(olderCopyProvider.accepted[0]);
    const twin = await save({
      connectedAccountId: accountId,
      recipients: [earlier.recipient],
      subject: "twin subject",
      body: "older-copy body",
    });
    const twinProvider = emailProvider(["accepted-unknown"]);
    const twinSend = await sendEmail(
      { ...earlier.input, subject: "twin subject", draftMessageId: twin.id, draftRevision: twin.revision },
      twinProvider,
    );
    expect(failureCode(twinSend)).toBe(CustomErrorCode.unipileSendOutcomeUnknown);
    expect(await claimRow(twin.id)).toMatchObject({ state: "unknown" });

    const { draft, copy } = await unknownSend("no-match");
    const variant = (over: Partial<ProviderEmail>) => ({
      ...copy,
      id: `unipile-${randomUUID()}`,
      message_id: `<${randomUUID()}@example.invalid>`,
      ...over,
    });
    await ingest(variant({ body: "<p>no-match body, but edited</p>" }));
    await ingest(variant({ to: [{ email: address("someone-else") }] }));
    await ingest(variant({ from: [{ email: otherEmail }] }), otherAccountId, otherEmail);

    expect(await claimRow(draft.id)).toMatchObject({ state: "unknown", sentMessageId: null });
    expect(await draftRow(draft.id)).not.toBeNull();
    expect(await claimRow(twin.id)).toMatchObject({ state: "unknown", sentMessageId: null });
    expect(await draftRow(twin.id)).not.toBeNull();
  });

  it("settles once and never sends again when retries race the ingest of the copy", async () => {
    const { draft, input, provider, copy } = await unknownSend("race");
    const conversation = { ...input, connectedAccountId: undefined, threadId: draft.threadId };

    const [, ...retries] = await Promise.all([
      ingest(copy),
      sendEmail(input, provider),
      sendEmail(conversation, provider),
      sendEmail(input, provider),
    ]);

    const synced = await copyRow(copy.id);
    for (const retry of retries) {
      if ((retry as Result).ok) expect(sentData(retry)).toMatchObject({ repeated: true, messageId: synced.id });
      else expect(failureCode(retry)).toBe(CustomErrorCode.draftSendOutcomeUnknown);
    }
    expect(sentData(await sendEmail(input, provider))).toMatchObject({ repeated: true, messageId: synced.id });
    expect(await claimRow(draft.id)).toMatchObject({ state: "sent", sentMessageId: synced.id });
    const links = await client.query(
      'SELECT count(*)::int AS count FROM "MessagingDraftSend" WHERE "companyId" = $1 AND "sentMessageId" = $2',
      [companyId, synced.id],
    );
    expect(links.rows[0].count).toBe(1);
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });

  it("refuses an edited resend with draftAlreadySent once the copy of the first send synced", async () => {
    const { draft, input, provider, copy } = await unknownSend("edited");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const edited = await save({ threadId: draft.threadId, subject: "edited subject", body: "edited body, changed" });
    expect(edited.id).toBe(draft.id);

    await ingest(copy);

    expect(await claimRow(draft.id)).toMatchObject({ state: "sent", unipileMessageId: copy.id });
    expect(await draftRow(draft.id)).toEqual({ bodyText: "edited body, changed" });
    const resend = await sendEmail(
      { ...input, subject: "edited subject", body: "edited body, changed", draftRevision: edited.revision },
      provider,
    );
    expect(failureCode(resend)).toBe(CustomErrorCode.draftAlreadySent);
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });

  it("refuses an edited resend with draftAlreadySent when its own send finds the synced copy", async () => {
    const { draft, input } = await newEmail("edited-retry");
    const provider = emailProvider(["accepted-throw"]);
    const release = deferred();
    provider.gate.wait = release.promise;
    const sending = sendEmail(input, provider);
    await vi.waitFor(() => expect(provider.accepted).toHaveLength(1));
    await ingest(provider.accepted[0]);
    release.resolve();
    await expect(sending).rejects.toThrow("connection reset");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const edited = await save({ threadId: draft.threadId, subject: "edited-retry subject", body: "changed body" });

    const resend = await sendEmail({ ...input, body: "changed body", draftRevision: edited.revision }, provider);

    expect(failureCode(resend)).toBe(CustomErrorCode.draftAlreadySent);
    expect(await claimRow(draft.id)).toMatchObject({ state: "sent", unipileMessageId: provider.accepted[0].id });
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });

  it("removes a reply draft once its copy lands in the same conversation", async () => {
    const contact = address("reply");
    const providerThread = `provider-thread-${randomUUID()}`;
    await ingest(
      {
        id: `unipile-${randomUUID()}`,
        message_id: `<${randomUUID()}@example.invalid>`,
        thread_id: providerThread,
        subject: "Question",
        body: "<p>Can you send the offer?</p>",
        date: new Date(Date.now() - 60_000).toISOString(),
        from: [{ email: contact }],
        to: [{ email: ownerEmail }],
        cc: [],
        bcc: [],
        folders: [],
      },
      accountId,
    );
    const thread = (
      await client.query<{ id: string }>('SELECT "id" FROM "MessagingThread" WHERE "unipileThreadId" = $1', [
        providerThread,
      ])
    ).rows[0];
    const draft = await save({ threadId: thread.id, subject: "Re: Question", body: "Here is the offer." });
    const provider = emailProvider(["accepted-unknown"]);
    const input: SendEmailData = {
      threadId: thread.id,
      to: [{ identifier: contact }],
      subject: "Re: Question",
      body: "Here is the offer.",
      bodyFormat: "markdown",
      draftMessageId: draft.id,
      draftRevision: draft.revision,
    };
    expect(failureCode(await sendEmail(input, provider))).toBe(CustomErrorCode.unipileSendOutcomeUnknown);

    await ingest({ ...provider.accepted[0], thread_id: providerThread });

    const synced = await copyRow(provider.accepted[0].id);
    expect(synced.messagingThreadId).toBe(thread.id);
    expect(await claimRow(draft.id)).toMatchObject({ state: "sent", sentThreadId: thread.id });
    expect(await draftRow(draft.id)).toBeNull();
    expect(sentData(await sendEmail(input, provider))).toMatchObject({
      repeated: true,
      messageId: synced.id,
      threadId: thread.id,
    });
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });
});
