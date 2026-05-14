import type { DomainEvent, DomainEventMap } from "@/features/event/domain-events";
import type { P13nRepo } from "@/core/base/base-get.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import type { WebhookDeliveryStatus } from "@/generated/prisma";

import { BaseGetRepo } from "@/core/base/base-get.interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

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

const WebhookDeliveryDtoSchema = z.object({
  id: z.string(),
  url: z.string(),
  event: z.string(),
  requestBody: z.any(),
  statusCode: z.number().nullable(),
  responseMessage: z.string().nullable(),
  success: z.boolean(),
  status: z.string(),
  deliveredAt: z.date().nullable(),
  createdAt: z.date(),
});

export abstract class GetWebhookDeliveriesRepo extends BaseGetRepo<WebhookDeliveryDto> {}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetWebhookDeliveriesInteractor extends BaseGetInteractor<WebhookDeliveryDto> {
  constructor(repo: GetWebhookDeliveriesRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "createdAt", direction: "desc" },
      pagination: { pageSize: 25, page: 1 },
    });
  }

  @Enforce(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(WebhookDeliveryDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
