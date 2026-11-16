import type { NotificationDto, NotificationInbox } from "@/features/notifications/notification.schema";

import { makeObservable, observable, runInAction } from "mobx";

import {
  getNotificationsAction,
  markNotificationsReadAction,
} from "@/app/components/notifications/notification-actions";
import { actionData } from "@/core/utils/action-data";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { appendOlderPage, markItemsRead, mergeNewestPage, NOTIFICATIONS_PAGE_SIZE } from "./notifications-page-model";

export class NotificationsStore {
  items: NotificationDto[] = [];
  nextBefore: string | null = null;
  unreadCount: number | null = null;
  isLoadingMore = false;
  isMarking = false;
  private unreadCountGeneration = 0;
  private mutationGeneration = 0;

  constructor() {
    makeObservable(this, {
      items: observable.ref,
      nextBefore: observable,
      unreadCount: observable,
      isLoadingMore: observable,
      isMarking: observable,
    });
  }

  hydrate(inbox: NotificationInbox) {
    this.mutationGeneration += 1;
    runInAction(() => {
      this.items = inbox.items;
      this.nextBefore = inbox.nextBefore;
      this.unreadCount = inbox.unreadCount;
    });
  }

  refreshUnreadCount = async (): Promise<void> => {
    const generation = ++this.unreadCountGeneration;
    const mutation = this.mutationGeneration;
    const inbox = await actionData(getNotificationsAction({ limit: 1 }));
    if (generation !== this.unreadCountGeneration || mutation !== this.mutationGeneration) return;
    runInAction(() => (this.unreadCount = inbox.unreadCount));
  };

  refreshNewest = async (): Promise<void> => {
    const mutation = this.mutationGeneration;
    const inbox = await actionData(getNotificationsAction({ limit: NOTIFICATIONS_PAGE_SIZE }));
    if (mutation !== this.mutationGeneration) return;
    const merged = mergeNewestPage(this, inbox);
    runInAction(() => {
      this.items = merged.items;
      this.nextBefore = merged.nextBefore;
      this.unreadCount = inbox.unreadCount;
    });
  };

  loadMore = async (): Promise<void> => {
    const before = this.nextBefore;
    if (!before || this.isLoadingMore) return;
    runInAction(() => (this.isLoadingMore = true));
    try {
      const inbox = await actionData(getNotificationsAction({ limit: NOTIFICATIONS_PAGE_SIZE, before }));
      const merged = appendOlderPage(this, inbox);
      runInAction(() => {
        this.items = merged.items;
        this.nextBefore = merged.nextBefore;
        this.unreadCount = inbox.unreadCount;
      });
    } finally {
      runInAction(() => (this.isLoadingMore = false));
    }
  };

  markRead = async (ids: readonly string[]): Promise<void> => {
    const unread = new Set(this.items.filter((item) => !item.read && ids.includes(item.id)).map((item) => item.id));
    if (unread.size === 0) return;
    await this.mark({ ids: [...unread] }, (marked) => {
      this.items = markItemsRead(this.items, unread);
      this.unreadCount = Math.max(0, (this.unreadCount ?? 0) - marked);
    });
  };

  markAllRead = async (): Promise<void> => {
    await this.mark({ all: true }, () => {
      this.items = markItemsRead(this.items, "all");
      this.unreadCount = 0;
    });
  };

  private async mark(input: { ids: string[] } | { all: true }, apply: (marked: number) => void) {
    this.mutationGeneration += 1;
    runInAction(() => (this.isMarking = true));
    try {
      const result = await markNotificationsReadAction(input);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      this.mutationGeneration += 1;
      runInAction(() => apply(result.data.marked));
    } finally {
      runInAction(() => (this.isMarking = false));
    }
  }
}
