import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";
import type { MessagingAttendee, MessagingThread, MessagingThreadState } from "@/ee/messaging/messaging.schema";
import type { AccountOwnerDto } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { action, makeObservable, observable, runInAction } from "mobx";

import { getMessagingThreadAction, updateThreadAction, resyncThreadAction } from "../actions";
import { MESSAGING_RATE_LIMITS_DOCS_PATH } from "./lazy-media";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export type ThreadDetail = {
  thread: MessagingThread;
  messages: MessagingMessageDto[];
  accountOwners: Record<string, AccountOwnerDto>;
};

export class MessagingThreadDetailStore extends BaseStore {
  thread: MessagingThread | null = null;
  messages: MessagingMessageDto[] = [];
  accountOwners: Record<string, AccountOwnerDto> = {};
  messageStatus: Record<string, "sending" | "failed"> = {};
  loadingOlder = false;
  private olderSyncAttempted = new Set<string>();

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      thread: observable,
      messages: observable,
      accountOwners: observable,
      messageStatus: observable,
      loadingOlder: observable,
      hydrate: action,
      refresh: action,
      setState: action,
      markRead: action,
      toggleSharing: action,
      resyncThread: action,
      loadOlderMessages: action,
      applyParticipantContact: action,
      appendMessage: action,
      replaceMessageById: action,
      removeMessageById: action,
      setMessageStatus: action,
      clearMessageStatus: action,
    });
  }

  appendMessage = (message: MessagingMessageDto) => {
    this.messages = [...this.messages, message];
  };

  replaceMessageById = (id: string, next: MessagingMessageDto) => {
    this.messages = this.messages.map((message) => (message.id === id ? next : message));
  };

  removeMessageById = (id: string) => {
    this.messages = this.messages.filter((message) => message.id !== id);
    this.clearMessageStatus(id);
  };

  setMessageStatus = (id: string, status: "sending" | "failed") => {
    this.messageStatus = { ...this.messageStatus, [id]: status };
  };

  clearMessageStatus = (id: string) => {
    this.messageStatus = Object.fromEntries(Object.entries(this.messageStatus).filter(([key]) => key !== id));
  };

  hydrate = (detail: ThreadDetail | null) => {
    this.thread = detail?.thread ?? null;
    this.messages = detail?.messages ?? [];
    this.accountOwners = detail?.accountOwners ?? {};
    this.messageStatus = {};
    this.loadingOlder = false;

    const thread = detail?.thread;
    if (thread) {
      const list = this.rootStore.messagingThreadsStore;
      if (list.items.some((item) => item.id === thread.id)) list.upsertItemLocal(thread);
    }
  };

  refresh = async (): Promise<void> => {
    if (!this.thread) return;

    const detail = await getMessagingThreadAction(this.thread.id);
    runInAction(() => this.hydrate(detail));
  };

  setState = async (next: MessagingThreadState): Promise<void> => {
    const thread = this.thread;
    if (!thread || next === thread.state) return;

    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await updateThreadAction({
        threadId: thread.id,
        state: next,
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      this.applyState(thread.id, next);
    });
  };

  markRead = async (): Promise<void> => {
    const thread = this.thread;
    if (!thread || this.rootStore.appMode === "demo" || thread.state !== "unread") return;

    const result = await updateThreadAction({
      threadId: thread.id,
      state: "open",
    });
    if (result.ok) this.applyState(thread.id, "open");
  };

  toggleSharing = async (shared: boolean): Promise<void> => {
    const thread = this.thread;
    if (!thread) return;

    const previous = thread.sharedToCrm;
    runInAction(() => {
      thread.sharedToCrm = shared;
    });

    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await updateThreadAction({
        threadId: thread.id,
        sharedToCrm: shared,
      });
      if (!result.ok) {
        runInAction(() => {
          thread.sharedToCrm = previous;
        });
        this.toastError("Inbox.shareToCrmUpdateFailed");
        return;
      }
      this.toastSuccess(shared ? "Inbox.shareToCrmSharedToast" : "Inbox.shareToCrmPrivateToast");
    });
  };

  resyncThread = async (): Promise<void> => {
    const thread = this.thread;
    if (!thread) return;

    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await resyncThreadAction(thread.id);
      if (!result.ok || !result.data.fetched) {
        if (result.ok && result.data.rateLimited) this.toastRateLimited(result.data.retryAfter);
        else this.toastError("Inbox.resyncThreadFailed");

        return;
      }

      await this.refresh();
      this.toastSuccess("Inbox.resyncThreadDone");
    });
  };

  loadOlderMessages = async (): Promise<void> => {
    const thread = this.thread;
    if (!thread || this.rootStore.appMode === "demo" || this.loadingOlder || this.olderSyncAttempted.has(thread.id))
      return;

    this.olderSyncAttempted.add(thread.id);
    this.loadingOlder = true;
    try {
      const result = await resyncThreadAction(thread.id);
      if (!result.ok || !result.data.fetched) {
        if (result.ok && result.data.rateLimited) this.toastRateLimited(result.data.retryAfter);
        return;
      }

      await this.refresh();
    } finally {
      runInAction(() => {
        this.loadingOlder = false;
      });
    }
  };

  applyParticipantContact = (threadId: string, identifier: string, contact: MessagingAttendee["contact"]) => {
    const patch = (participants: MessagingAttendee[]) =>
      participants.map((participant) =>
        participant.identifier === identifier ? { ...participant, contact } : participant,
      );

    runInAction(() => {
      if (this.thread && this.thread.id === threadId) {
        this.thread.participants = patch(this.thread.participants);
        this.messages = this.messages.map((message) =>
          message.sender.identifier === identifier ? { ...message, sender: { ...message.sender, contact } } : message,
        );
      }

      const list = this.rootStore.messagingThreadsStore;
      const existing = list.items.find((thread) => thread.id === threadId);
      if (existing) list.upsertItemLocal({ ...existing, participants: patch(existing.participants) });
    });
  };

  private toastRateLimited = (retryAfter: string | undefined) => {
    this.toastError("Inbox.rateLimited", {
      values: { retryAfter },
      action: {
        labelKey: "Inbox.learnMore",
        href: `/${this.rootStore.localeStore.locale}${MESSAGING_RATE_LIMITS_DOCS_PATH}`,
      },
    });
  };

  private applyState = (threadId: string, state: MessagingThreadState) => {
    runInAction(() => {
      if (this.thread && this.thread.id === threadId) this.thread.state = state;

      const list = this.rootStore.messagingThreadsStore;
      const existing = list.items.find((thread) => thread.id === threadId);
      if (existing) list.upsertItemLocal({ ...existing, state });
    });
  };
}
