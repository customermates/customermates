import type { WebhookDto } from "@/features/webhook/webhook.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { XTableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { Resource } from "@/generated/prisma";

import { getWebhooksAction } from "../../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class WebhooksStore extends BaseDataViewStore<WebhookDto> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, Resource.api);
  }

  get columnsDefinition(): XTableColumn[] {
    return [
      { uid: "name", sortable: false },
      { uid: "description", sortable: false },
      { uid: "events", sortable: false },
      { uid: "status", sortable: false },
      { uid: "createdAt", sortable: true },
      { uid: "updatedAt", sortable: true },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getWebhooksAction(params);
  }
}
