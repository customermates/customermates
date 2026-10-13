import type { GetWebhookByIdRepo } from "./get-webhook-by-id.repo";
import type { GetWebhookDeliveriesInteractor, WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { Data } from "@/core/validation/validation.utils";

import { Resource } from "@/generated/prisma";

import { WebhookDeliveryDtoSchema } from "./get-webhook-deliveries.interactor";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { GetQueryParamsSchema, createGetResultSchema } from "@/core/base/base-get.schema";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { type Validated } from "@/core/validation/validation.utils";
import { z } from "zod";

const Schema = GetQueryParamsSchema.extend({ webhookId: z.uuid() });
type GetWebhookDeliveriesByWebhookData = Data<typeof Schema>;

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, read: "all" })
export class GetWebhookDeliveriesByWebhookInteractor extends AuthenticatedInteractor<
  GetWebhookDeliveriesByWebhookData,
  GetResult<WebhookDeliveryDto>
> {
  constructor(
    private webhooks: GetWebhookByIdRepo,
    private deliveries: GetWebhookDeliveriesInteractor,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(createGetResultSchema(WebhookDeliveryDtoSchema))
  async invoke({ webhookId, ...params }: GetWebhookDeliveriesByWebhookData): Validated<GetResult<WebhookDeliveryDto>> {
    if (!(await this.webhooks.getWebhookById(webhookId)))
      return failNotFound(CustomErrorCode.webhookNotFound, ["webhookId"]);
    return await this.deliveries.invoke({
      ...params,
      filters: [
        { field: FilterFieldKey.webhookId, operator: FilterOperatorKey.in, value: [webhookId] },
        ...(params.filters ?? []),
      ],
    });
  }
}
