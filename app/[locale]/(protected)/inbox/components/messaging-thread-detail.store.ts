import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";
import type { MessagingAttendee, MessagingThread, MessagingThreadState } from "@/ee/messaging/messaging.schema";
import type { AccountOwnerDto } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { action, makeObservable, observable, runInAction } from "mobx";

import { getMessagingThreadAction, setThreadStateAction, shareThreadToCrmAction } from "../actions";

export type ThreadDetail = {
  thread: MessagingThread;
  messages: MessagingMessageDto[];
  accountOwners: Record<string, AccountOwnerDto>;
};

export class MessagingThreadDetailStore extends BaseStore {
  thread: MessagingThread | null = null;
  messages: MessagingMessageDto[] = [];
  accountOwners: Record<string, AccountOwnerDto> = {};

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      thread: observable,
      messages: observable,
      accountOwners: observable,
      hydrate: action,
      refresh: action,
      setState: action,
      markRead: action,
      toggleSharing: action,
      applyParticipantContact: action,
    });
  }

  hydrate = (detail: ThreadDetail | null) => {
    this.thread = detail?.thread ?? null;
    this.messages = detail?.messages ?? [];
    this.accountOwners = detail?.accountOwners ?? {};
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
      const result = await setThreadStateAction({
        threadId: thread.id,
        state: next,
      });
      if (result.ok) this.applyState(thread.id, next);
    });
  };

  markRead = async (): Promise<void> => {
    const thread = this.thread;
    if (!thread || thread.state !== "unread") return;

    const result = await setThreadStateAction({
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
      const result = await shareThreadToCrmAction({
        threadId: thread.id,
        shared,
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

  private applyState = (threadId: string, state: MessagingThreadState) => {
    runInAction(() => {
      if (this.thread && this.thread.id === threadId) this.thread.state = state;

      const list = this.rootStore.messagingThreadsStore;
      const existing = list.items.find((thread) => thread.id === threadId);
      if (existing) list.upsertItemLocal({ ...existing, state });
    });
  };
}
