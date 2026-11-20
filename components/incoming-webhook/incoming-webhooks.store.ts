import type { IncomingWebhookDto } from "@/features/incoming-webhook/incoming-webhook.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { Resource } from "@/generated/prisma";

import { getIncomingWebhooksAction } from "./incoming-webhook-actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { actionData } from "@/core/utils/action-data";

export class IncomingWebhooksStore extends BaseDataViewStore<IncomingWebhookDto> {
  constructor(rootStore: RootStore) {
    super(rootStore, Resource.api);
  }

  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "name", sortable: true },
      { uid: "list", label: this.t("IncomingWebhooks.list"), sortable: false },
      { uid: "status", sortable: false },
      { uid: "lastRequest", sortable: false },
      { uid: "createdAt", sortable: true },
      { uid: "updatedAt", sortable: true },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return actionData(getIncomingWebhooksAction(params));
  }
}
