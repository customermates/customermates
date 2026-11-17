import type { RootStore } from "@/core/stores/root.store";
import type { ReviewDraft } from "@/ee/messaging/outbound/list-review-drafts.interactor";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  countReviewDraftsAction: vi.fn(),
  discardDraftAction: vi.fn(),
  listReviewDraftsAction: vi.fn(),
  saveDraftAction: vi.fn(),
  sendChatMessageAction: vi.fn(),
  sendEmailAction: vi.fn(),
  startChatAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("../../actions", () => actions);
vi.mock("sonner", () => ({ toast }));

import { DraftReviewStore, draftRecipients } from "../draft-review.store";

const REVISION = "2026-11-17T10:00:00.000Z";

function attendee(identifier: string, isSelf = false) {
  return {
    attendeeId: identifier,
    identifier,
    displayName: null,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    records: [],
    isSelf,
  };
}

function entry(
  id: string,
  options: {
    provider?: "mail" | "linkedin";
    newConversation?: boolean;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string | null;
  } = {},
): ReviewDraft {
  const provider = options.provider ?? "mail";
  const threadId = `thread-${id}`;
  return {
    draft: {
      id,
      messagingThreadId: threadId,
      connectedAccountId: "account",
      provider,
      isDraft: true,
      draftRevision: REVISION,
      bodyText: `Body of ${id}`,
      subject: options.subject === undefined ? `Subject of ${id}` : options.subject,
      recipients: {
        to: (options.to ?? ["client@example.test"]).map((identifier) => attendee(identifier)),
        cc: (options.cc ?? []).map((identifier) => attendee(identifier)),
        bcc: (options.bcc ?? []).map((identifier) => attendee(identifier)),
      },
      attachmentsMeta: [],
    },
    thread: {
      id: threadId,
      provider,
      unipileThreadId: options.newConversation ? `draft_${threadId}` : `chat_${threadId}`,
      participants: [attendee("me@example.test", true), attendee("participant@example.test")],
    },
    history: [],
    accountLabel: "me@example.test",
  } as unknown as ReviewDraft;
}

function fixture(items: ReviewDraft[]) {
  const root = {
    localeStore: { getTranslation: (key: string) => key },
    messagingThreadsStore: { refreshInBackground: vi.fn() },
    messagingThreadDetailStore: { thread: null, refresh: vi.fn() },
  };
  actions.listReviewDraftsAction.mockResolvedValue({ ok: true, data: { items, total: items.length } });
  actions.countReviewDraftsAction.mockResolvedValue({ ok: true, data: { items: [], total: items.length } });
  return { store: new DraftReviewStore(root as unknown as RootStore), root };
}

async function opened(items: ReviewDraft[]) {
  const context = fixture(items);
  context.store.open();
  await vi.waitFor(() => expect(context.store.status).toBe("ready"));
  return context;
}

const sent = { ok: true, data: { message: null, messageId: "sent", threadId: "thread", repeated: false } };

describe("draft review queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends a reply email draft exactly as saved and moves on to the next draft", async () => {
    const first = entry("first", { cc: ["cc@example.test"], bcc: ["bcc@example.test"] });
    const { store, root } = await opened([first, entry("second")]);
    actions.sendEmailAction.mockResolvedValue(sent);

    await store.send();

    expect(actions.sendEmailAction).toHaveBeenCalledTimes(1);
    expect(actions.sendEmailAction).toHaveBeenCalledWith({
      threadId: "thread-first",
      to: [{ identifier: "client@example.test" }],
      cc: ["cc@example.test"],
      bcc: ["bcc@example.test"],
      subject: "Subject of first",
      body: "Body of first",
      bodyFormat: "markdown",
      attachments: undefined,
      draftMessageId: "first",
      draftRevision: REVISION,
    });
    expect(store.current?.draft.id).toBe("second");
    expect(store).toMatchObject({ sentCount: 1, openCount: 1, busy: false });
    expect(toast.success).toHaveBeenCalledWith("Inbox.compose.messageSent", { duration: 4000 });
    expect(root.messagingThreadsStore.refreshInBackground).toHaveBeenCalled();
  });

  it("sends a draft for a new conversation from its account and a new chat to the saved recipient", async () => {
    const { store } = await opened([
      entry("mail", { newConversation: true }),
      entry("chat", { provider: "linkedin", newConversation: true, to: ["jane-doe"] }),
      entry("reply", { provider: "linkedin", to: [] }),
    ]);
    actions.sendEmailAction.mockResolvedValue(sent);
    actions.startChatAction.mockResolvedValue(sent);
    actions.sendChatMessageAction.mockResolvedValue(sent);

    await store.send();
    await store.send();
    await store.send();

    expect(actions.sendEmailAction.mock.calls[0][0]).toMatchObject({ connectedAccountId: "account" });
    expect(actions.sendEmailAction.mock.calls[0][0]).not.toHaveProperty("threadId");
    expect(actions.startChatAction).toHaveBeenCalledWith({
      connectedAccountId: "account",
      attendeeIdentifiers: ["jane-doe"],
      text: "Body of chat",
      attachments: undefined,
      draftMessageId: "chat",
      draftRevision: REVISION,
    });
    expect(actions.sendChatMessageAction).toHaveBeenCalledWith({
      threadId: "thread-reply",
      text: "Body of reply",
      attachments: undefined,
      draftMessageId: "reply",
      draftRevision: REVISION,
    });
    expect(store.current).toBeNull();
  });

  it("never dispatches the same draft twice while a send is running", async () => {
    const { store } = await opened([entry("first"), entry("second")]);
    let release: (value: typeof sent) => void = () => undefined;
    actions.sendEmailAction.mockReturnValue(new Promise<typeof sent>((resolve) => (release = resolve)));

    const running = store.send();
    await store.send();
    store.keep();
    expect(store.busy).toBe(true);
    release(sent);
    await running;

    expect(actions.sendEmailAction).toHaveBeenCalledTimes(1);
    expect(store.current?.draft.id).toBe("second");
    expect(store.keptCount).toBe(0);
  });

  it("keeps a draft for later without sending it, also after the queue reloads", async () => {
    const { store } = await opened([entry("first"), entry("second")]);

    store.keep();
    expect(store.current?.draft.id).toBe("second");
    expect(store).toMatchObject({ keptCount: 1, openCount: 2 });

    await store.load();
    expect(store.queue.map((item) => item.draft.id)).toEqual(["second"]);
    expect(actions.sendEmailAction).not.toHaveBeenCalled();
  });

  it("tells the user why a send was refused and reloads when the draft is no longer what was shown", async () => {
    const { store } = await opened([entry("first")]);
    actions.sendEmailAction.mockResolvedValue({ ok: false, error: {}, code: "draftChanged" });
    actions.listReviewDraftsAction.mockResolvedValue({ ok: true, data: { items: [entry("fresh")], total: 1 } });

    await store.send();

    expect(toast.error).toHaveBeenCalledWith("ErrorCard.unexpectedError", expect.anything());
    expect(actions.listReviewDraftsAction).toHaveBeenCalledTimes(2);
    expect(store.current?.draft.id).toBe("fresh");
    expect(store).toMatchObject({ sentCount: 0, busy: false });
  });

  it("does not send an email draft without a subject", async () => {
    const { store } = await opened([entry("first", { subject: " " })]);

    await store.send();

    expect(actions.sendEmailAction).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Common.errors.subjectRequired", expect.anything());
  });

  it("saves an edited text without changing who the draft is addressed to", async () => {
    const draft = entry("first", { to: [], cc: ["cc@example.test"], bcc: ["bcc@example.test"] });
    const { store } = await opened([draft]);
    const revised = { ...draft.draft, bodyText: "Rewritten", draftRevision: "2026-11-17T10:05:00.000Z" };
    actions.saveDraftAction.mockResolvedValue({ ok: true, data: revised });

    store.startEdit();
    expect(store.editDirty).toBe(false);
    store.setEditBody("  Rewritten ");
    expect(store.editDirty).toBe(true);
    await store.saveEdit();

    expect(actions.saveDraftAction).toHaveBeenCalledWith({
      threadId: "thread-first",
      body: "Rewritten",
      recipients: [],
      subject: "Subject of first",
      cc: ["cc@example.test"],
      bcc: ["bcc@example.test"],
    });
    expect(store.current?.draft).toMatchObject({ bodyText: "Rewritten", draftRevision: "2026-11-17T10:05:00.000Z" });
    expect(store.editing).toBe(false);
  });

  it("leaves a chat reply draft's recipients to the conversation when it saves an edit", async () => {
    const { store } = await opened([entry("reply", { provider: "linkedin", to: [] })]);
    actions.saveDraftAction.mockResolvedValue({ ok: false, error: { errors: ["refused"] } });

    store.startEdit();
    store.setEditBody("Rewritten");
    await store.saveEdit();

    expect(actions.saveDraftAction).toHaveBeenCalledWith({
      threadId: "thread-reply",
      body: "Rewritten",
      recipients: ["participant@example.test"],
    });
    expect(store.editing).toBe(true);
    expect(store.current?.draft.bodyText).toBe("Body of reply");
  });

  it("brings a draft picked from the queue to the front without changing the order of the others", async () => {
    const { store } = await opened([entry("a"), entry("b"), entry("c")]);

    store.bringToFront("c");
    expect(store.queue.map((item) => item.draft.id)).toEqual(["c", "a", "b"]);

    store.startEdit();
    store.bringToFront("b");
    expect(store.current?.draft.id).toBe("c");
  });

  it("discards a draft with the revision it showed", async () => {
    const { store } = await opened([entry("first"), entry("second")]);
    actions.discardDraftAction.mockResolvedValue({ ok: true, data: { threadId: "thread-first" } });

    await store.discard();

    expect(actions.discardDraftAction).toHaveBeenCalledWith({ messageId: "first", draftRevision: REVISION });
    expect(store.current?.draft.id).toBe("second");
    expect(store.openCount).toBe(1);
  });

  it("addresses a chat draft without saved recipients to the other participants of its conversation", () => {
    expect(draftRecipients(entry("chat", { provider: "linkedin", to: [] }))).toEqual(["participant@example.test"]);
    expect(draftRecipients(entry("mail", { to: [] }))).toEqual([]);
    expect(draftRecipients(entry("mail"))).toEqual(["client@example.test"]);
  });
});
