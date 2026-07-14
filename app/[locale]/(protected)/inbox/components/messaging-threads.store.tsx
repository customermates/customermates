import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { RootStore } from "@/core/stores/root.store";

import { makeObservable, observable, runInAction } from "mobx";

import { getMessagingThreadsAction, refreshInboxAction } from "../actions";
import { MESSAGING_RATE_LIMITS_DOCS_PATH } from "./lazy-media";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class MessagingThreadsStore extends BaseDataViewStore<MessagingThread> {
  isRefreshingInbox = false;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      isRefreshingInbox: observable,
    });
  }

  get columnsDefinition(): TableColumn[] {
    return [{ uid: "participants" }, { uid: "account" }, { uid: "state" }, { uid: "lastMessageAt" }];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getMessagingThreadsAction(params);
  }

  refreshInbox = async (): Promise<void> => {
    runInAction(() => (this.isRefreshingInbox = true));

    try {
      const result = await refreshInboxAction();
      if (!result.ok) {
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
      } else this.toastSuccess("Inbox.refreshDone");

      await this.refresh();
    } finally {
      runInAction(() => (this.isRefreshingInbox = false));
    }
  };
}
