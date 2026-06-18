import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { TableColumn } from "@/core/base/base-data-view.store";

import { getMessagingThreadsAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class MessagingThreadsStore extends BaseDataViewStore<MessagingThread> {
  get columnsDefinition(): TableColumn[] {
    return [{ uid: "participants" }, { uid: "account" }, { uid: "state" }, { uid: "lastMessageAt" }];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getMessagingThreadsAction(params);
  }
}
