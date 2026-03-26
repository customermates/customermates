import type { DomainEvent, DomainEventMap } from "@/features/event/domain-events";

import { Resource, Action, WebhookDeliveryStatus } from "@/generated/prisma";

import { BaseGetRepo, P13nRepo } from "@/core/base/base-get.interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export type WebhookDeliveryDto = {
  id: string;
  url: string;
  event: DomainEvent;
  requestBody: {
    event: DomainEvent;
    data: DomainEventMap[DomainEvent];
    timestamp: string;
  };
  statusCode: number | null;
  responseMessage: string | null;
  success: boolean;
  status: WebhookDeliveryStatus;
  deliveredAt: Date | null;
  createdAt: Date;
};

export abstract class GetWebhookDeliveriesRepo extends BaseGetRepo<WebhookDeliveryDto> {}

@AllowInDemoMode
@TentantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetWebhookDeliveriesInteractor extends BaseGetInteractor<WebhookDeliveryDto> {
  constructor(repo: GetWebhookDeliveriesRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "createdAt", direction: "desc" },
      pagination: { pageSize: 25, page: 1 },
    });
  }

  @Enforce(GetQueryParamsSchema)
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
