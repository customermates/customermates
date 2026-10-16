import type { TenantUser } from "@/features/user/user.schema";
import type { MessagingService } from "../../messaging.service";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { PermissionService } from "@/core/base/permission.service";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { createTestMessagingRepo } from "@/tests/helpers/messaging-repository";
import { createMockUser } from "@/tests/helpers/mock-user";
import { PrismaConnectedAccountRepo } from "../../persistence/prisma-connected-account.repository";
import { PrismaUnipileWebhookRepo } from "../../persistence/prisma-unipile-webhook.repository";
import { SaveDraftInteractor, type SaveDraftData } from "../save-draft.interactor";
import { SendChatMessageInteractor, type SendChatMessageData } from "../send-chat-message.interactor";
import { SendEmailInteractor, type SendEmailData } from "../send-email.interactor";
import { StartChatInteractor } from "../start-chat.interactor";

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

type Result = {
  ok: boolean;
  data?: unknown;
  error?: { issues: Array<{ params?: { error?: string; kind?: string } }> };
};
type SentData = {
  message: { id: string; messagingThreadId: string } | null;
  messageId: string | null;
  threadId: string | null;
  providerMessageId: string | null;
  repeated: boolean;
};

function failureCode(result: unknown) {
  return (result as Result).error?.issues[0]?.params?.error;
}

function sentData(result: unknown): SentData {
  expect((result as Result).ok).toBe(true);
  return (result as Result).data as SentData;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describeDatabase("sending a saved draft revision at most once", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const emailAccountId = randomUUID();
  const chatAccountId = randomUUID();
  const ownerEmail = `draft-sender-${ownerId}@example.invalid`;
  const tenant = createMockUser({ id: ownerId, companyId, email: ownerEmail }) satisfies TenantUser;
  const address = (label: string) => `${label}-${randomUUID()}@example.invalid`;
  const phone = () => `+49176${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  const accounts = () => new PrismaConnectedAccountRepo(new PermissionService(), new PrismaUnipileWebhookRepo());
  const save = async (data: SaveDraftData) => {
    const result = await runWithTenant(tenant, () =>
      new SaveDraftInteractor(createTestMessagingRepo(), accounts(), mockEntitlementService()).invoke(data),
    );
    if (!result.ok || !result.data.draftRevision) throw new Error("draft was not saved");
    return { id: result.data.id, threadId: result.data.messagingThreadId, revision: result.data.draftRevision };
  };
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
      ).invoke(data),
    );
  const sendChat = (data: SendChatMessageData, provider: ReturnType<typeof chatProvider>) =>
    runWithTenant(tenant, () => {
      const service = provider as unknown as MessagingService;
      const startChat = new StartChatInteractor(
        accounts(),
        {
          findIdentityChannelsCompanyWide: vi.fn().mockResolvedValue([]),
          findIdentityCompanyWide: vi.fn(),
          isRecordWritePaused: vi.fn(),
          isRecordEditableCompanyWide: vi.fn(),
          setIdentityResolutionCompanyWide: vi.fn(),
        } as never,
        service,
        createTestMessagingRepo(),
        mockEntitlementService(),
        { resolve: vi.fn().mockResolvedValue([]) } as never,
      );
      return new SendChatMessageInteractor(
        createTestMessagingRepo(),
        accounts(),
        service,
        new ValidateThreadIdsInteractor(createTestMessagingRepo()),
        mockEntitlementService(),
        startChat,
      ).invoke(data);
    });

  function emailProvider(outcomes: Array<"accept" | "unknown" | "reject"> = [], options: { sentCopy?: boolean } = {}) {
    const copies = new Map<string, unknown>();
    const gate = { wait: null as Promise<void> | null };
    const sendEmail = vi.fn(
      async (input: {
        subject: string;
        body: string;
        to: Array<{ email: string }>;
        cc?: Array<{ email: string }>;
        bcc?: Array<{ email: string }>;
      }) => {
        if (gate.wait) await gate.wait;
        const outcome = outcomes[sendEmail.mock.calls.length - 1] ?? "accept";
        if (outcome === "unknown") return { ok: false, error: CustomErrorCode.unipileSendOutcomeUnknown };
        if (outcome === "reject") return { ok: false, error: CustomErrorCode.unipileProviderRejected };
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
          cc: input.cc ?? [],
          bcc: input.bcc ?? [],
          folders: [],
        });
        return { ok: true, data: { id, messageId } };
      },
    );
    const getEmail = vi.fn(({ emailId }: { emailId: string }) => {
      const copy = copies.get(emailId);
      if (!copy || options.sentCopy === false) return Promise.reject(new Error("not indexed yet"));
      return Promise.resolve(copy);
    });
    return { sendEmail, getEmail, gate, copies };
  }

  function chatProvider(outcomes: Array<"accept" | "unknown"> = []) {
    const sendChatMessage = vi.fn(() => {
      const outcome = outcomes[sendChatMessage.mock.calls.length - 1] ?? "accept";
      if (outcome === "unknown")
        return Promise.resolve({ ok: false, error: CustomErrorCode.unipileSendOutcomeUnknown });
      return Promise.resolve({ ok: true, data: { messageId: `chat-message-${randomUUID()}` } });
    });
    const startChat = vi.fn(() =>
      Promise.resolve({
        ok: true,
        data: { chatId: `chat-${randomUUID()}`, messageId: `chat-message-${randomUUID()}` },
      }),
    );
    return { sendChatMessage, startChat, listInboxes: vi.fn() };
  }

  const draftRow = async (id: string) =>
    (
      await client.query<{ isDraft: boolean; bodyText: string | null }>(
        'SELECT "isDraft", "bodyText" FROM "MessagingMessage" WHERE "id" = $1',
        [id],
      )
    ).rows[0] ?? null;
  const claimRow = async (draftMessageId: string) =>
    (
      await client.query<{ state: string; providerMessageId: string | null; sentThreadId: string | null }>(
        'SELECT "state", "providerMessageId", "sentThreadId" FROM "MessagingDraftSend" WHERE "companyId" = $1 AND "draftMessageId" = $2',
        [companyId, draftMessageId],
      )
    ).rows[0] ?? null;
  const newEmail = async (label: string) => {
    const recipient = address(label);
    const draft = await save({
      connectedAccountId: emailAccountId,
      recipients: [recipient],
      subject: `${label} subject`,
      body: `${label} body`,
    });
    const input: SendEmailData = {
      connectedAccountId: emailAccountId,
      to: [{ identifier: recipient }],
      subject: `${label} subject`,
      body: `${label} body`,
      bodyFormat: "markdown",
      draftMessageId: draft.id,
      draftRevision: draft.revision,
    };
    return { recipient, draft, input };
  };

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, ownerEmail, "Draft", "Sender", companyId],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "emailAddress", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
      [emailAccountId, companyId, ownerId, MessagingProvider.mail, `unipile-${emailAccountId}`, "ok", ownerEmail],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [chatAccountId, companyId, ownerId, MessagingProvider.whatsapp, `unipile-${chatAccountId}`, "ok"],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("returns the first result for a repeated send of the same revision and sends only once", async () => {
    const { draft, input } = await newEmail("repeat");
    const provider = emailProvider();

    const first = sentData(await sendEmail(input, provider));
    const second = sentData(await sendEmail(input, provider));

    expect(provider.sendEmail).toHaveBeenCalledOnce();
    expect(first.repeated).toBe(false);
    expect(first.threadId).not.toBeNull();
    expect(second).toMatchObject({
      repeated: true,
      messageId: first.messageId,
      threadId: first.threadId,
      providerMessageId: first.providerMessageId,
    });
    expect(await draftRow(draft.id)).toBeNull();
    expect(await claimRow(draft.id)).toMatchObject({ state: "sent", sentThreadId: first.threadId });
  });

  it("sends a draft revision once when two sends race", async () => {
    const { draft, input } = await newEmail("race");
    const provider = emailProvider();
    const release = deferred();
    provider.gate.wait = release.promise;

    const firstAttempt = sendEmail(input, provider);
    await vi.waitFor(() => expect(provider.sendEmail).toHaveBeenCalledOnce());
    const secondAttempt = await sendEmail(input, provider);
    release.resolve();
    const first = sentData(await firstAttempt);

    expect(failureCode(secondAttempt)).toBe(CustomErrorCode.draftSendInProgress);
    expect(provider.sendEmail).toHaveBeenCalledOnce();
    expect(first.repeated).toBe(false);
    const replay = sentData(await sendEmail(input, provider));
    expect(replay).toMatchObject({ repeated: true, messageId: first.messageId });
    expect(provider.sendEmail).toHaveBeenCalledOnce();
    expect(await draftRow(draft.id)).toBeNull();
  });

  it("never sends again after an outcome is unknown, neither by account nor by the draft's conversation", async () => {
    const { draft, input } = await newEmail("unknown");
    const provider = emailProvider(["unknown"]);

    const first = await sendEmail(input, provider);
    const byAccount = await sendEmail(input, provider);
    const byConversation = await sendEmail(
      { ...input, connectedAccountId: undefined, threadId: draft.threadId },
      provider,
    );

    expect(failureCode(first)).toBe(CustomErrorCode.unipileSendOutcomeUnknown);
    expect(failureCode(byAccount)).toBe(CustomErrorCode.draftSendOutcomeUnknown);
    expect(failureCode(byConversation)).toBe(CustomErrorCode.draftSendOutcomeUnknown);
    expect(provider.sendEmail).toHaveBeenCalledOnce();
    expect(await draftRow(draft.id)).toEqual({ isDraft: true, bodyText: "unknown body" });
    expect(await claimRow(draft.id)).toMatchObject({ state: "unknown" });
  });

  it("sends a version saved after an unknown outcome once and refuses the older revision", async () => {
    const { draft, input } = await newEmail("resave");
    const provider = emailProvider(["unknown"]);
    await sendEmail(input, provider);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const resaved = await save({ threadId: draft.threadId, subject: "resave subject", body: "resave body, checked" });
    expect(resaved.id).toBe(draft.id);
    const newer = { ...input, body: "resave body, checked", draftRevision: resaved.revision };

    const sent = sentData(await sendEmail(newer, provider));
    const repeated = sentData(await sendEmail(newer, provider));
    const older = await sendEmail(input, provider);

    expect(sent.repeated).toBe(false);
    expect(repeated.repeated).toBe(true);
    expect(failureCode(older)).toBe(CustomErrorCode.draftAlreadySent);
    expect(provider.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("refuses to save over a draft while its send is running", async () => {
    const { draft, input } = await newEmail("in-flight");
    const provider = emailProvider();
    const release = deferred();
    provider.gate.wait = release.promise;

    const sending = sendEmail(input, provider);
    await vi.waitFor(() => expect(provider.sendEmail).toHaveBeenCalledOnce());
    const resave = await runWithTenant(tenant, () =>
      new SaveDraftInteractor(createTestMessagingRepo(), accounts(), mockEntitlementService()).invoke({
        threadId: draft.threadId,
        subject: "in-flight subject",
        body: "edited while sending",
      }),
    );
    release.resolve();
    const sent = sentData(await sending);

    expect(failureCode(resave)).toBe(CustomErrorCode.draftSendInProgress);
    expect(sent.repeated).toBe(false);
    expect(await draftRow(draft.id)).toBeNull();
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });

  it("refuses another version of a draft whose earlier version was already sent", async () => {
    const { draft, input } = await newEmail("sent-then-edited");
    const provider = emailProvider();
    const failing = createTestMessagingRepo();
    failing.completeDraftSendRemovingDraft = () => Promise.reject(new Error("database unavailable"));
    expect(sentData(await sendEmail(input, provider, failing)).repeated).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const edited = await save({
      threadId: draft.threadId,
      subject: "sent-then-edited subject",
      body: "edited after the send",
    });
    const second = await sendEmail(
      { ...input, body: "edited after the send", draftRevision: edited.revision },
      provider,
    );

    expect(edited.id).toBe(draft.id);
    expect(failureCode(second)).toBe(CustomErrorCode.draftAlreadySent);
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });

  it("replays the first result when another send finishes the draft between its check and its claim", async () => {
    const { draft, input } = await newEmail("check-then-claim");
    const provider = emailProvider();
    const raced: { first?: SentData } = {};
    const racing = createTestMessagingRepo();
    const findDraftById = racing.findDraftById.bind(racing);
    racing.findDraftById = async (args) => {
      const found = await findDraftById(args);
      raced.first = sentData(await sendEmail(input, provider));
      return found;
    };

    const late = sentData(await sendEmail(input, provider, racing));

    expect(raced.first?.repeated).toBe(false);
    expect(late).toMatchObject({ repeated: true, messageId: raced.first?.messageId, threadId: raced.first?.threadId });
    expect(provider.sendEmail).toHaveBeenCalledOnce();
    expect(await draftRow(draft.id)).toBeNull();
  });

  it("releases the claim after a definitive provider refusal so the same revision can be sent", async () => {
    const { draft, input } = await newEmail("refused");
    const provider = emailProvider(["reject"]);

    const refused = await sendEmail(input, provider);
    expect(failureCode(refused)).toBe(CustomErrorCode.unipileProviderRejected);
    expect(await claimRow(draft.id)).toBeNull();
    expect(await draftRow(draft.id)).toEqual({ isDraft: true, bodyText: "refused body" });

    const sent = sentData(await sendEmail(input, provider));
    expect(sent.repeated).toBe(false);
    expect(provider.sendEmail).toHaveBeenCalledTimes(2);
    expect(await draftRow(draft.id)).toBeNull();
  });

  it("reports an accepted send whose sent copy is not readable yet, and resolves its reference once synced", async () => {
    const { draft, input, recipient } = await newEmail("unsynced");
    const provider = emailProvider([], { sentCopy: false });

    const first = sentData(await sendEmail(input, provider));
    expect(first).toMatchObject({ message: null, messageId: null, threadId: null, repeated: false });
    expect(first.providerMessageId).toMatch(/^<.+@example\.invalid>$/);
    expect(await draftRow(draft.id)).toBeNull();
    expect(await claimRow(draft.id)).toMatchObject({ state: "sent", providerMessageId: first.providerMessageId });

    const [unipileMessageId] = [...provider.copies.keys()];
    const synced = await runWithTenant(tenant, () =>
      createTestMessagingRepo().persistOutboundMessageOrThrow({
        connectedAccountId: emailAccountId,
        message: {
          unipileMessageId,
          providerMessageId: first.providerMessageId,
          provider: MessagingProvider.mail,
          direction: "outbound",
          origin: "external",
          sender: {
            attendeeId: ownerEmail,
            identifier: ownerEmail,
            displayName: null,
            pictureUrl: null,
            profileUrl: null,
            headline: null,
            occupation: null,
            isSelf: true,
            records: [],
          },
          recipients: {
            to: [
              {
                attendeeId: recipient,
                identifier: recipient,
                displayName: null,
                pictureUrl: null,
                profileUrl: null,
                headline: null,
                occupation: null,
                isSelf: false,
                records: [],
              },
            ],
            cc: [],
            bcc: [],
          },
          subject: "unsynced subject",
          bodyText: "unsynced body",
          bodyHtml: null,
          attachmentsMeta: [],
          isEvent: false,
          isDeleted: false,
          isHidden: false,
          sentAt: new Date(),
          reactions: [],
          unipileThreadId: `provider-thread-${randomUUID()}`,
          threadType: "single",
        },
      }),
    );

    const replay = sentData(await sendEmail(input, provider));
    expect(replay).toMatchObject({ repeated: true, messageId: synced.id, threadId: synced.messagingThreadId });
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });

  it("keeps an accepted send at most once when finishing the draft fails after the provider accepted it", async () => {
    const { draft, input } = await newEmail("finish-failed");
    const provider = emailProvider();
    const failing = createTestMessagingRepo();
    failing.completeDraftSendRemovingDraft = () => Promise.reject(new Error("database unavailable"));

    const first = sentData(await sendEmail(input, provider, failing));
    expect(first.repeated).toBe(false);
    expect(await claimRow(draft.id)).toMatchObject({ state: "sent" });
    expect(await draftRow(draft.id)).toEqual({ isDraft: true, bodyText: "finish-failed body" });

    const replay = sentData(await sendEmail(input, provider));
    expect(replay.repeated).toBe(true);
    expect(provider.sendEmail).toHaveBeenCalledOnce();
    expect(await draftRow(draft.id)).toBeNull();
  });

  it("sends a draft by its draft-only conversation id like by its account", async () => {
    const { draft, input, recipient } = await newEmail("conversation");
    const provider = emailProvider();

    const unbound = await sendEmail(
      {
        ...input,
        connectedAccountId: undefined,
        threadId: draft.threadId,
        draftMessageId: undefined,
        draftRevision: undefined,
      },
      provider,
    );
    expect(failureCode(unbound)).toBe(CustomErrorCode.draftThreadNotSent);

    const sent = sentData(
      await sendEmail({ ...input, connectedAccountId: undefined, threadId: draft.threadId }, provider),
    );
    expect(sent.repeated).toBe(false);
    expect(provider.sendEmail).toHaveBeenCalledOnce();
    expect(provider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: [{ email: recipient }] }));
    expect(await draftRow(draft.id)).toBeNull();

    const replayByAccount = sentData(await sendEmail(input, provider));
    expect(replayByAccount).toMatchObject({ repeated: true, threadId: sent.threadId });
    const replayByConversation = sentData(
      await sendEmail({ ...input, connectedAccountId: undefined, threadId: draft.threadId }, provider),
    );
    expect(replayByConversation).toMatchObject({ repeated: true, threadId: sent.threadId });
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });

  it("gives every new email its own draft, so a second email to the same person never replaces the first", async () => {
    const recipient = address("same-person");
    const first = await save({
      connectedAccountId: emailAccountId,
      recipients: [recipient],
      subject: "One",
      body: "First",
    });
    const second = await save({
      connectedAccountId: emailAccountId,
      recipients: [recipient],
      subject: "Two",
      body: "Second",
    });

    expect(second.threadId).not.toBe(first.threadId);
    expect(second.id).not.toBe(first.id);
    expect(await draftRow(first.id)).toEqual({ isDraft: true, bodyText: "First" });
    expect(await draftRow(second.id)).toEqual({ isDraft: true, bodyText: "Second" });
  });

  it("sends a chat reply draft once and replays the first result", async () => {
    const threadId = randomUUID();
    const counterpart = phone();
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [threadId, companyId, chatAccountId, MessagingProvider.whatsapp, "single", `chat-${threadId}`],
    );
    await client.query(
      'INSERT INTO "MessagingThreadParticipant" ("id", "companyId", "messagingThreadId", "provider", "providerUserId", "identifier", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP)',
      [randomUUID(), companyId, threadId, MessagingProvider.whatsapp, counterpart],
    );
    const draft = await save({ threadId, body: "Chat reply draft" });
    const provider = chatProvider();
    const input = { threadId, text: "Chat reply draft", draftMessageId: draft.id, draftRevision: draft.revision };

    const first = sentData(await sendChat(input, provider));
    const second = sentData(await sendChat(input, provider));

    expect(provider.sendChatMessage).toHaveBeenCalledOnce();
    expect(first).toMatchObject({ repeated: false, messageId: draft.id, threadId });
    expect(second).toMatchObject({ repeated: true, messageId: draft.id, threadId });
    expect(await draftRow(draft.id)).toEqual({ isDraft: false, bodyText: "Chat reply draft" });
  });

  it("refuses a chat draft again after its send outcome is unknown", async () => {
    const threadId = randomUUID();
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [threadId, companyId, chatAccountId, MessagingProvider.whatsapp, "single", `chat-${threadId}`],
    );
    await client.query(
      'INSERT INTO "MessagingThreadParticipant" ("id", "companyId", "messagingThreadId", "provider", "providerUserId", "identifier", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP)',
      [randomUUID(), companyId, threadId, MessagingProvider.whatsapp, phone()],
    );
    const draft = await save({ threadId, body: "Unconfirmed chat draft" });
    const provider = chatProvider(["unknown"]);
    const input = { threadId, text: "Unconfirmed chat draft", draftMessageId: draft.id, draftRevision: draft.revision };

    const first = await sendChat(input, provider);
    const retry = await sendChat(input, provider);

    expect(failureCode(first)).toBe(CustomErrorCode.unipileSendOutcomeUnknown);
    expect(failureCode(retry)).toBe(CustomErrorCode.draftSendOutcomeUnknown);
    expect(provider.sendChatMessage).toHaveBeenCalledOnce();
    expect(await draftRow(draft.id)).toEqual({ isDraft: true, bodyText: "Unconfirmed chat draft" });
  });

  it("starts a new chat from its draft-only conversation once", async () => {
    const counterpart = phone();
    const draft = await save({ connectedAccountId: chatAccountId, recipients: [counterpart], body: "New chat draft" });
    const provider = chatProvider();
    const input = {
      threadId: draft.threadId,
      text: "New chat draft",
      draftMessageId: draft.id,
      draftRevision: draft.revision,
    };

    const first = sentData(await sendChat(input, provider));
    const second = sentData(await sendChat(input, provider));

    expect(provider.startChat).toHaveBeenCalledOnce();
    expect(provider.startChat).toHaveBeenCalledWith(expect.objectContaining({ usersIds: [counterpart] }));
    expect(first.repeated).toBe(false);
    expect(first.threadId).not.toBeNull();
    expect(first.threadId).not.toBe(draft.threadId);
    expect(second).toMatchObject({ repeated: true, threadId: first.threadId });
    expect(await draftRow(draft.id)).toBeNull();
  });
});
