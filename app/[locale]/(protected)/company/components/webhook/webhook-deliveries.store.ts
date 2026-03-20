import type { WebhookDeliveryDto } from "@/features/webhook/get-webhook-deliveries.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { XTableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { Resource } from "@/generated/prisma";

import { getWebhookDeliveriesAction } from "../../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class WebhookDeliveriesStore extends BaseDataViewStore<WebhookDeliveryDto> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, Resource.api);
  }

  get columnsDefinition(): XTableColumn[] {
    return [
      { uid: "name" },
      { uid: "event" },
      { uid: "entity" },
      { uid: "status" },
      { uid: "statusCode" },
      { uid: "createdAt", sortable: true },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getWebhookDeliveriesAction(params);
  }
}
