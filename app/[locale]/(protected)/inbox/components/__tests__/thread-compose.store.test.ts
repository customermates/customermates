import type { RootStore } from "@/core/stores/root.store";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { isObservableArray } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

const actions = vi.hoisted(() => ({
  discardDraftAction: vi.fn(),
  saveDraftAction: vi.fn(),
  sendChatMessageAction: vi.fn(),
  sendEmailAction: vi.fn(),
  startChatAction: vi.fn(),
}));
const attachmentInputs = vi.hoisted(() => ({
  toAttachmentInput: vi.fn(),
}));

vi.mock("../../actions", () => actions);
vi.mock("../attachment-input", () => ({
  MAX_ATTACHMENTS_BYTES: 25 * 1024 * 1024,
  toAttachmentInput: attachmentInputs.toAttachmentInput,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: vi.fn(() => false),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ThreadComposeStore } from "../thread-compose.store";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
const THREAD_ID = "00000000-0000-4000-8000-000000000003";
const OTHER_THREAD_ID = "00000000-0000-4000-8000-000000000006";
const DRAFT_ID = "00000000-0000-4000-8000-000000000004";
const DRAFT_THREAD_ID = "00000000-0000-4000-8000-000000000005";
const RECIPIENT = "recipient@example.com";
const DRAFT_REVISION = "2026-09-04T10:00:00.000Z";

function attendee(identifier: string) {
  return {
    attendeeId: identifier,
    displayName: null,
    identifier,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    isSelf: false,
    contact: null,
  };
}

function message(overrides: Partial<MessagingMessageDto> & Pick<MessagingMessageDto, "provider">): MessagingMessageDto {
  const { provider, isDraft = true, draftRevision = isDraft ? DRAFT_REVISION : null, ...rest } = overrides;

  return {
    id: DRAFT_ID,
    messagingThreadId: THREAD_ID,
    connectedAccountId: ACCOUNT_ID,
    providerMessageId: null,
    provider,
    direction: "outbound",
    sender: { ...attendee("sender@example.com"), isSelf: true },
    recipients: { to: [attendee(RECIPIENT)], cc: [], bcc: [] },
    subject: provider === MessagingProvider.google ? "Re: Subject" : null,
    bodyText: "Prepared reply",
    bodyHtml: null,
    attachmentsMeta: [],
    isEvent: false,
    isDeleted: false,
    isHidden: false,
    isDraft,
    draftRevision,
    sentAt: new Date("2026-09-04T10:00:00.000Z"),
    editedAt: null,
    reactions: [],
    ...rest,
  };
}

function makeHarness(initialMessages: MessagingMessageDto[] = []) {
  const detail = {
    thread: { connectedAccountId: ACCOUNT_ID },
    messages: [...initialMessages],
    messageStatus: {} as Record<string, "sending" | "failed">,
    appendMessage: vi.fn((next: MessagingMessageDto) => {
      detail.messages = [...detail.messages, next];
    }),
    replaceMessageById: vi.fn((id: string, next: MessagingMessageDto) => {
      detail.messages = detail.messages.map((entry) => (entry.id === id ? next : entry));
    }),
    removeMessageById: vi.fn((id: string) => {
      detail.messages = detail.messages.filter((entry) => entry.id !== id);
      detail.messageStatus = Object.fromEntries(Object.entries(detail.messageStatus).filter(([key]) => key !== id));
    }),
    setMessageStatus: vi.fn((id: string, status: "sending" | "failed") => {
      detail.messageStatus = { ...detail.messageStatus, [id]: status };
    }),
    clearMessageStatus: vi.fn((id: string) => {
      detail.messageStatus = Object.fromEntries(Object.entries(detail.messageStatus).filter(([key]) => key !== id));
    }),
  };
  const rootStore = {
    connectedAccountsStore: { items: [] },
    localeStore: { getTranslation: (key: string) => key },
    messagingThreadDetailStore: detail,
  } as unknown as RootStore;

  return { detail, store: new ThreadComposeStore(rootStore) };
}

const failure = {
  ok: false as const,
  error: { errors: ["provider unavailable"] },
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ThreadComposeStore draft lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attachmentInputs.toAttachmentInput.mockResolvedValue({});
  });

  it("preserves derived reply recipients when a legacy draft has an empty to list", () => {
    const draft = message({
      provider: MessagingProvider.google,
      recipients: { to: [], cc: [], bcc: [] },
    });
    const { store } = makeHarness([draft]);
    store.initialize({
      provider: MessagingProvider.google,
      threadId: THREAD_ID,
      defaultRecipients: [RECIPIENT],
    });

    store.loadDraft(draft);

    expect(store.form.recipients).toEqual([RECIPIENT]);
    expect(store.editingDraftId).toBe(DRAFT_ID);
    expect(store.editingDraftRevision).toBe(DRAFT_REVISION);
  });

  it("passes the current to recipients when saving a reply draft", async () => {
    const first = "first@example.com";
    const second = "second@example.com";
    const saved = message({
      provider: MessagingProvider.google,
      recipients: { to: [attendee(first), attendee(second)], cc: [], bcc: [] },
    });
    actions.saveDraftAction.mockResolvedValue({ ok: true, data: saved });
    const { store } = makeHarness();
    store.initialize({
      provider: MessagingProvider.google,
      threadId: THREAD_ID,
      defaultSubject: "Subject",
      defaultRecipients: [first],
    });
    store.onChange("recipients", [first, second]);
    store.onChange("cc", ["cc@example.com"]);
    store.onChange("bcc", ["bcc@example.com"]);
    store.onChange("body", "Prepared reply");

    await store.saveDraft();

    expect(actions.saveDraftAction).toHaveBeenCalledOnce();
    const input = actions.saveDraftAction.mock.calls[0]?.[0];
    expect(input).toEqual(
      expect.objectContaining({
        threadId: THREAD_ID,
        recipients: [first, second],
        cc: ["cc@example.com"],
        bcc: ["bcc@example.com"],
        subject: "Re: Subject",
        body: "Prepared reply",
      }),
    );
    expect(isObservableArray(input?.recipients)).toBe(false);
    expect(isObservableArray(input?.cc)).toBe(false);
    expect(isObservableArray(input?.bcc)).toBe(false);
  });

  it.each([
    {
      label: "email",
      provider: MessagingProvider.google,
      action: actions.sendEmailAction,
    },
    {
      label: "chat",
      provider: MessagingProvider.linkedin,
      action: actions.sendChatMessageAction,
    },
  ])("retains the draft id when a failed $label send is retried", async ({ provider, action }) => {
    const draft = message({ provider });
    const sent = message({ provider, isDraft: false });
    action.mockResolvedValueOnce(failure).mockResolvedValueOnce({ ok: true, data: sent });
    const { detail, store } = makeHarness([draft]);
    store.initialize({
      provider,
      threadId: THREAD_ID,
      defaultRecipients: [RECIPIENT],
    });
    store.loadDraft(draft);

    await store.send();
    await store.retrySend(DRAFT_ID);

    expect(action).toHaveBeenCalledTimes(2);
    expect(action).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        draftMessageId: DRAFT_ID,
        draftRevision: DRAFT_REVISION,
      }),
    );
    expect(action).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        draftMessageId: DRAFT_ID,
        draftRevision: DRAFT_REVISION,
      }),
    );
    expect(detail.messages).toEqual([sent]);
  });

  it("clears the email reply body as soon as sending begins", async () => {
    actions.sendEmailAction.mockResolvedValue({ ok: true, data: null });
    const { store } = makeHarness();
    store.initialize({
      provider: MessagingProvider.google,
      threadId: THREAD_ID,
      defaultSubject: "Subject",
      defaultRecipients: [RECIPIENT],
    });
    store.onChange("body", "Message to send");

    const sending = store.send();

    expect(store.form.body).toBe("");
    await sending;
  });

  it("keeps an attachment send bound to the thread and provider that started it", async () => {
    const attachment = deferred<Record<string, never>>();
    attachmentInputs.toAttachmentInput.mockReturnValueOnce(attachment.promise);
    actions.sendEmailAction.mockResolvedValue({ ok: true, data: null });
    const { store } = makeHarness();
    store.initialize({
      provider: MessagingProvider.google,
      threadId: THREAD_ID,
      defaultSubject: "Subject",
      defaultRecipients: [RECIPIENT],
    });
    store.onChange("body", "Email from the first thread");
    store.addAttachments([{ name: "proof.txt", size: 5, type: "text/plain" } as File]);

    const sending = store.send();
    store.initialize({
      provider: MessagingProvider.linkedin,
      threadId: OTHER_THREAD_ID,
      defaultRecipients: ["linkedin-recipient"],
    });
    store.onChange("body", "Draft in the second thread");
    attachment.resolve({});
    await sending;

    expect(actions.sendEmailAction).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: THREAD_ID,
        body: "Email from the first thread",
      }),
    );
    expect(actions.sendChatMessageAction).not.toHaveBeenCalled();
    expect(store.form).toMatchObject({
      provider: MessagingProvider.linkedin,
      threadId: OTHER_THREAD_ID,
      body: "Draft in the second thread",
    });
  });

  it("keeps an attachment retry bound to the thread and provider that started it", async () => {
    const attachment = deferred<Record<string, never>>();
    attachmentInputs.toAttachmentInput.mockReturnValueOnce(attachment.promise);
    actions.sendEmailAction.mockResolvedValue({ ok: true, data: null });
    const failedMessage = message({ provider: MessagingProvider.google, isDraft: false });
    const { store } = makeHarness([failedMessage]);
    store.initialize({
      provider: MessagingProvider.google,
      threadId: THREAD_ID,
      defaultSubject: "Subject",
      defaultRecipients: [RECIPIENT],
    });
    store.pendingAttachments = {
      [DRAFT_ID]: [{ name: "proof.txt", size: 5, type: "text/plain" } as File],
    };

    const retrying = store.retrySend(DRAFT_ID);
    store.initialize({
      provider: MessagingProvider.linkedin,
      threadId: OTHER_THREAD_ID,
      defaultRecipients: ["linkedin-recipient"],
    });
    attachment.resolve({});
    await retrying;

    expect(actions.sendEmailAction).toHaveBeenCalledWith(expect.objectContaining({ threadId: THREAD_ID }));
    expect(actions.sendChatMessageAction).not.toHaveBeenCalled();
  });

  it("does not let an older new-thread completion clear or close the active compose", async () => {
    const firstSend = deferred<{ ok: true; data: null }>();
    const secondSend = deferred<{ ok: true; data: null }>();
    actions.sendEmailAction.mockReturnValueOnce(firstSend.promise).mockReturnValueOnce(secondSend.promise);
    const firstDone = vi.fn();
    const secondDone = vi.fn();
    const { store } = makeHarness();
    store.initializeNewThread({
      provider: MessagingProvider.google,
      connectedAccountId: ACCOUNT_ID,
      recipients: [{ identifier: RECIPIENT, displayName: null }],
      onDone: firstDone,
    });
    store.onChange("subject", "First subject");
    store.onChange("body", "First message");

    const firstSending = store.send();
    store.initializeNewThread({
      provider: MessagingProvider.google,
      connectedAccountId: OTHER_ACCOUNT_ID,
      recipients: [{ identifier: "second@example.com", displayName: null }],
      onDone: secondDone,
    });
    store.onChange("subject", "Second subject");
    store.onChange("body", "Second message");
    const secondSending = store.send();

    firstSend.resolve({ ok: true, data: null });
    await firstSending;

    expect(store.isLoading).toBe(true);
    expect(store.form).toMatchObject({ subject: "Second subject", body: "Second message" });
    expect(store.newThreadTarget?.connectedAccountId).toBe(OTHER_ACCOUNT_ID);
    expect(firstDone).not.toHaveBeenCalled();
    expect(secondDone).not.toHaveBeenCalled();

    secondSend.resolve({ ok: true, data: null });
    await secondSending;
    expect(secondDone).toHaveBeenCalledOnce();
  });

  it("releases a consumed cold-draft binding while preserving edits made during send", async () => {
    const sent = deferred<{ ok: true; data: null }>();
    actions.sendEmailAction.mockReturnValue(sent.promise);
    const onDone = vi.fn();
    const draft = message({ provider: MessagingProvider.google, messagingThreadId: DRAFT_THREAD_ID });
    const { store } = makeHarness([draft]);
    store.initializeNewThread({
      provider: MessagingProvider.google,
      connectedAccountId: ACCOUNT_ID,
      recipients: [{ identifier: RECIPIENT, displayName: null }],
      draftThreadId: DRAFT_THREAD_ID,
      onDone,
    });
    store.loadDraft(draft);

    const sending = store.send();
    store.onChange("body", "Next unsent message");
    sent.resolve({ ok: true, data: null });
    await sending;

    expect(actions.sendEmailAction).toHaveBeenCalledWith(
      expect.objectContaining({
        draftMessageId: DRAFT_ID,
        draftRevision: DRAFT_REVISION,
        body: "Prepared reply",
      }),
    );
    expect(store.form.body).toBe("Next unsent message");
    expect(store.editingDraftId).toBeNull();
    expect(store.editingDraftRevision).toBeNull();
    expect(store.newThreadTarget?.draftThreadId).toBeUndefined();
    expect(onDone).not.toHaveBeenCalled();

    actions.saveDraftAction.mockResolvedValue({
      ok: true,
      data: message({ provider: MessagingProvider.google, messagingThreadId: OTHER_THREAD_ID }),
    });
    await store.saveDraft();

    const savedInput = actions.saveDraftAction.mock.calls[0]?.[0];
    expect(savedInput).toEqual(
      expect.objectContaining({ connectedAccountId: ACCOUNT_ID, body: "Next unsent message" }),
    );
    expect(savedInput).not.toHaveProperty("threadId");
  });

  it("does not apply an older draft-save result to a newly opened thread", async () => {
    const savedDraft = deferred<{ ok: true; data: MessagingMessageDto }>();
    actions.saveDraftAction.mockReturnValue(savedDraft.promise);
    const { detail, store } = makeHarness();
    store.initialize({
      provider: MessagingProvider.google,
      threadId: THREAD_ID,
      defaultSubject: "First subject",
      defaultRecipients: [RECIPIENT],
    });
    store.onChange("body", "First draft");

    const saving = store.saveDraft();
    store.initialize({
      provider: MessagingProvider.linkedin,
      threadId: OTHER_THREAD_ID,
      defaultRecipients: ["linkedin-recipient"],
    });
    store.onChange("body", "Second draft");
    savedDraft.resolve({ ok: true, data: message({ provider: MessagingProvider.google }) });
    await saving;

    expect(detail.messages).toEqual([]);
    expect(store.form).toMatchObject({
      provider: MessagingProvider.linkedin,
      threadId: OTHER_THREAD_ID,
      body: "Second draft",
    });
  });

  it("restores an optimistically removed draft when exact-revision discard fails", async () => {
    const draft = message({ provider: MessagingProvider.google });
    actions.discardDraftAction.mockResolvedValue(failure);
    const { detail, store } = makeHarness([draft]);

    await store.discardDraft(DRAFT_ID, DRAFT_REVISION);

    expect(actions.discardDraftAction).toHaveBeenCalledWith({
      messageId: DRAFT_ID,
      draftRevision: DRAFT_REVISION,
    });
    expect(detail.messages).toEqual([draft]);
  });

  it.each([
    {
      provider: MessagingProvider.google,
      action: actions.sendEmailAction,
      success: { ok: true as const, data: null },
    },
    {
      provider: MessagingProvider.linkedin,
      action: actions.startChatAction,
      success: { ok: true as const, data: { threadId: THREAD_ID } },
    },
  ])("passes the loaded revision when sending a cold $provider draft", async ({ provider, action, success }) => {
    const draft = message({ provider, messagingThreadId: DRAFT_THREAD_ID });
    action.mockResolvedValue(success);
    const { store } = makeHarness([draft]);
    store.initializeNewThread({
      provider,
      connectedAccountId: ACCOUNT_ID,
      recipients: [{ identifier: RECIPIENT, displayName: null }],
      draftThreadId: DRAFT_THREAD_ID,
    });
    store.loadDraft(draft);

    await store.send();

    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        draftMessageId: DRAFT_ID,
        draftRevision: DRAFT_REVISION,
      }),
    );
  });

  it("does not let a reopened cold draft switch its connected account", () => {
    const { store } = makeHarness();
    const savedDraftInit = {
      provider: MessagingProvider.google,
      connectedAccountId: ACCOUNT_ID,
      recipients: [{ identifier: RECIPIENT, displayName: null }],
      draftThreadId: DRAFT_THREAD_ID,
    };
    store.initializeNewThread(savedDraftInit);

    store.setNewThreadAccount(OTHER_ACCOUNT_ID);

    expect(store.newThreadTarget).toMatchObject({
      connectedAccountId: ACCOUNT_ID,
      draftThreadId: DRAFT_THREAD_ID,
    });
  });

  it.each(["sales_navigator", "recruiter"] as const)(
    "does not save a new LinkedIn %s compose as an incomplete draft",
    async (linkedinProduct) => {
      const { store } = makeHarness();
      store.initializeNewThread({
        provider: MessagingProvider.linkedin,
        connectedAccountId: ACCOUNT_ID,
        recipients: [{ identifier: "linkedin-recipient", displayName: null }],
      });
      store.onChange("body", "Prepared InMail");
      store.onChange("linkedinProduct", linkedinProduct);

      await store.saveDraft();

      expect(actions.saveDraftAction).not.toHaveBeenCalled();
    },
  );
});
