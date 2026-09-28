import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";
import type { MessagingAttendee, MessagingThread, MessagingThreadState } from "@/ee/messaging/messaging.schema";
import type { AccountOwnerDto, ThreadFolderContext } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { action, makeObservable, observable, runInAction } from "mobx";
import { Action, Resource } from "@/generated/prisma";

import { getMessagingThreadAction, updateThreadAction, resyncThreadAction, moveEmailThreadAction } from "../actions";
import { isEmailProvider } from "@/ee/messaging/provider";
import { MESSAGING_RATE_LIMITS_DOCS_PATH } from "./lazy-media";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export type ThreadDetail = {
  thread: MessagingThread;
  messages: MessagingMessageDto[];
  accountOwners: Record<string, AccountOwnerDto>;
  folderContext: ThreadFolderContext | null;
};

export class MessagingThreadDetailStore extends BaseStore {
  thread: MessagingThread | null = null;
  messages: MessagingMessageDto[] = [];
  accountOwners: Record<string, AccountOwnerDto> = {};
  folderContext: ThreadFolderContext | null = null;
  messageStatus: Record<string, "sending" | "failed"> = {};
  loadingOlder = false;
  movingThreadIds = new Set<string>();
  unavailableThreadId: string | null = null;
  private refreshGeneration = 0;
  private sharingPending = false;
  private olderSyncAttempted = new Set<string>();

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      thread: observable,
      messages: observable,
      accountOwners: observable,
      folderContext: observable,
      messageStatus: observable,
      loadingOlder: observable,
      movingThreadIds: observable,
      unavailableThreadId: observable,
      hydrate: action,
      refresh: action,
      setState: action,
      moveToFolder: action,
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
    this.refreshGeneration += 1;
    this.messages = [...this.messages, message];
  };

  replaceMessageById = (id: string, next: MessagingMessageDto) => {
    this.refreshGeneration += 1;
    this.messages = this.messages.map((message) => (message.id === id ? next : message));
  };

  removeMessageById = (id: string) => {
    this.refreshGeneration += 1;
    this.messages = this.messages.filter((message) => message.id !== id);
    this.clearMessageStatus(id);
  };

  setMessageStatus = (id: string, status: "sending" | "failed") => {
    this.refreshGeneration += 1;
    this.messageStatus = { ...this.messageStatus, [id]: status };
  };

  clearMessageStatus = (id: string) => {
    this.messageStatus = Object.fromEntries(Object.entries(this.messageStatus).filter(([key]) => key !== id));
  };

  hydrate = (detail: ThreadDetail | null) => {
    this.refreshGeneration += 1;
    this.unavailableThreadId = null;
    this.thread = detail?.thread ?? null;
    this.messages = detail?.messages ?? [];
    this.accountOwners = detail?.accountOwners ?? {};
    this.folderContext = detail?.folderContext ?? null;
    this.messageStatus = {};
    this.loadingOlder = false;

    const thread = detail?.thread;
    if (thread) {
      const list = this.rootStore.messagingThreadsStore;
      if (list.items.some((item) => item.id === thread.id)) list.upsertItemLocal(thread);
    }
  };

  refresh = async (background = false): Promise<void> => {
    const thread = this.thread;
    if (
      !thread ||
      this.sharingPending ||
      (background && (this.loadingOlder || Object.keys(this.messageStatus).length > 0))
    )
      return;
    const composer = this.rootStore.threadComposeStore;
    if (composer.form.threadId === thread.id && composer.hasComposedContent) return;
    const generation = ++this.refreshGeneration;
    const detail = await getMessagingThreadAction(thread.id);
    if (
      this.thread?.id !== thread.id ||
      generation !== this.refreshGeneration ||
      this.sharingPending ||
      (background && this.loadingOlder) ||
      Object.keys(this.messageStatus).length > 0 ||
      (composer.form.threadId === thread.id && composer.hasComposedContent)
    )
      return;
    runInAction(() => {
      const unavailable = !detail || (isEmailProvider(detail.thread.provider) && detail.messages.length === 0);
      this.hydrate(unavailable ? null : detail);
      if (unavailable) this.unavailableThreadId = thread.id;
    });
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

      await this.applyState(thread.id, next);
    });
  };

  moveToFolder = async (folderId: string): Promise<void> => {
    const thread = this.thread;
    const context = this.folderContext;
    if (!thread || !context || this.movingThreadIds.has(thread.id) || context.currentFolderIds.includes(folderId))
      return;

    this.movingThreadIds.add(thread.id);
    try {
      const result = await moveEmailThreadAction({
        threadId: thread.id,
        folderId,
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      if (result.data.rateLimited) {
        this.toastError("Inbox.folders.moveRateLimited", {
          values: {
            folder: result.data.folderName,
            retryAfter: result.data.retryAfter ?? "",
          },
        });
      } else if (result.data.failedCount > 0) {
        this.toastError("Inbox.folders.movePartial", {
          values: {
            folder: result.data.folderName,
            failed: String(result.data.failedCount),
          },
        });
      } else if (result.data.movedCount === 0) {
        this.toastError("Inbox.folders.moveNothing", {
          values: { folder: result.data.folderName },
        });
      }

      await Promise.all([
        this.rootStore.messagingThreadsStore.refresh(),
        this.thread?.id === thread.id ? this.refresh() : Promise.resolve(),
      ]);
      if (result.data.movedCount > 0 && !result.data.rateLimited && result.data.failedCount === 0) {
        this.toastSuccess(
          this.unavailableThreadId === thread.id ? "Inbox.folders.movedHidden" : "Inbox.folders.moved",
          {
            values: { folder: result.data.folderName },
          },
        );
      }
    } finally {
      runInAction(() => this.movingThreadIds.delete(thread.id));
    }
  };

  markRead = async (): Promise<void> => {
    const thread = this.thread;
    if (!thread || this.rootStore.appMode === "demo" || thread.state !== "unread") return;

    const result = await updateThreadAction({
      threadId: thread.id,
      state: "open",
    });
    if (result.ok) await this.applyState(thread.id, "open");
  };

  toggleSharing = async (shared: boolean): Promise<void> => {
    const thread = this.thread;
    if (!thread || this.sharingPending) return;

    const previous = thread.sharedToCrm;
    this.sharingPending = true;
    this.refreshGeneration += 1;
    runInAction(() => {
      thread.sharedToCrm = shared;
    });

    try {
      await this.rootStore.loadingOverlayStore.withLoading(async () => {
        const result = await updateThreadAction({
          threadId: thread.id,
          sharedToCrm: shared,
        });
        runInAction(() => {
          if (this.thread?.id === thread.id) this.thread.sharedToCrm = result.ok ? shared : previous;
        });
        if (!result.ok) {
          this.toastError("Inbox.shareToCrmUpdateFailed");
          return;
        }
        this.toastSuccess(shared ? "Inbox.shareToCrmSharedToast" : "Inbox.shareToCrmPrivateToast");
      });
    } catch (error) {
      runInAction(() => {
        if (this.thread?.id === thread.id) this.thread.sharedToCrm = previous;
      });
      throw error;
    } finally {
      this.sharingPending = false;
      this.refreshGeneration += 1;
    }
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
    if (
      !thread ||
      this.rootStore.appMode === "demo" ||
      !this.rootStore.userStore.can(Resource.inboxMessages, Action.update) ||
      this.loadingOlder ||
      this.olderSyncAttempted.has(thread.id)
    )
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

  applyParticipantContact = async (threadId: string, identifier: string, contact: MessagingAttendee["contact"]) => {
    const patch = (participants: MessagingAttendee[]) =>
      participants.map((participant) =>
        participant.identifier === identifier ? { ...participant, contact } : participant,
      );

    runInAction(() => {
      if (this.thread && this.thread.id === threadId) {
        this.refreshGeneration += 1;
        this.thread.participants = patch(this.thread.participants);
        this.messages = this.messages.map((message) =>
          message.sender.identifier === identifier ? { ...message, sender: { ...message.sender, contact } } : message,
        );
      }
    });
    const list = this.rootStore.messagingThreadsStore;
    const existing = list.items.find((thread) => thread.id === threadId);
    if (existing) {
      await list.upsertItem({
        ...existing,
        participants: patch(existing.participants),
      });
    }
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

  private applyState = async (threadId: string, state: MessagingThreadState) => {
    runInAction(() => {
      if (this.thread && this.thread.id === threadId) {
        this.refreshGeneration += 1;
        this.thread.state = state;
      }
    });
    const list = this.rootStore.messagingThreadsStore;
    const existing = list.items.find((thread) => thread.id === threadId);
    if (existing) await list.upsertItem({ ...existing, state });
    await list.refreshUnreadCount();
  };
}
