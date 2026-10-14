import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { RootStore } from "@/core/stores/root.store";

import { makeObservable, observable, runInAction } from "mobx";

import { getMessagingThreadsAction, getUnreadThreadCountAction, refreshInboxAction } from "../actions";
import { ForbiddenError } from "@/core/errors/app-errors";
import { MESSAGING_RATE_LIMITS_DOCS_PATH } from "./lazy-media";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { settingsHref } from "@/app/components/navigation/settings-routes";

export class MessagingThreadsStore extends BaseDataViewStore<MessagingThread> {
  isRefreshingInbox = false;
  unreadThreadCount: number | null = null;
  private unreadCountGeneration = 0;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      isRefreshingInbox: observable,
      unreadThreadCount: observable,
    });
  }

  get columnsDefinition(): TableColumn[] {
    return [{ uid: "participants" }, { uid: "account" }, { uid: "state" }, { uid: "lastMessageAt" }];
  }

  protected async refreshAction(params?: GetQueryParams) {
    const [threads] = await Promise.all([getMessagingThreadsAction(params), this.refreshUnreadCount()]);
    if (!threads.ok) {
      if (threads.failure.kind === "authorization") throw new ForbiddenError();
      throw new Error("Inbox threads could not be loaded");
    }
    return threads.data;
  }

  refreshUnreadCount = async (): Promise<void> => {
    const generation = ++this.unreadCountGeneration;
    const count = await getUnreadThreadCountAction();
    if (generation !== this.unreadCountGeneration) return;
    if (!count.ok) {
      if (count.failure.kind === "authorization") {
        runInAction(() => (this.unreadThreadCount = null));
        return;
      }
      throw new Error("Inbox unread count could not be loaded");
    }
    runInAction(() => (this.unreadThreadCount = count.data));
  };

  refreshInbox = async (): Promise<void> => {
    runInAction(() => (this.isRefreshingInbox = true));

    try {
      const result = await refreshInboxAction();
      if (!result.ok) {
        if (result.code === "permissionDenied" || result.code === "insufficientPermissions") {
          this.toastError("Inbox.shareToCrmPermissionDenied");
          return;
        }
        toastZodErrorTree(result.error);
        return;
      }

      if (result.data.rateLimited) {
        this.toastError("Inbox.refreshRateLimited", {
          action: {
            labelKey: "Inbox.learnMore",
            href: `/${this.rootStore.localeStore.locale}${MESSAGING_RATE_LIMITS_DOCS_PATH}`,
          },
        });
      }

      const { reconnectAccounts, failedAccounts } = result.data;
      if (reconnectAccounts > 0) {
        this.toastError("Inbox.refreshNeedsReconnect", {
          values: { count: reconnectAccounts },
          action: {
            labelKey: "ConnectedAccountsCard.title",
            href: `/${this.rootStore.localeStore.locale}${settingsHref("channels")}`,
          },
        });
      }
      if (failedAccounts > 0) {
        this.toastError("Inbox.refreshPartial", {
          values: { count: failedAccounts },
        });
      }

      await this.refresh();
      if (!result.data.rateLimited && reconnectAccounts === 0 && failedAccounts === 0)
        this.toastSuccess("Inbox.refreshDone");
    } catch (error) {
      this.toastError(
        error instanceof ForbiddenError ? "Inbox.shareToCrmPermissionDenied" : "Common.notifications.unexpectedError",
      );
    } finally {
      runInAction(() => (this.isRefreshingInbox = false));
    }
  };
}
