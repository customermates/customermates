import { z } from "zod";

import { Resource, Action, Webhook } from "@/generated/prisma";

import { WebhookService } from "./webhook.service";
import { WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";

import { UserAccessor } from "@/core/base/user-accessor";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";

const ResendWebhookDeliverySchema = z.object({
  id: z.uuid(),
});
export type ResendWebhookDeliveryData = z.infer<typeof ResendWebhookDeliverySchema>;

export abstract class GetWebhookDeliveryByIdRepo {
  abstract getDeliveryByIdOrThrow(id: string): Promise<WebhookDeliveryDto>;
}

export abstract class GetWebhookByUrlRepo {
  abstract getWebhookByUrlOrThrow(url: string): Promise<Webhook>;
}

@TentantInteractor({ resource: Resource.api, action: Action.create })
export class ResendWebhookDeliveryInteractor extends UserAccessor {
  constructor(
    private deliveryRepo: GetWebhookDeliveryByIdRepo,
    private webhookRepo: GetWebhookByUrlRepo,
    private webhookService: WebhookService,
  ) {
    super();
  }

  @Enforce(ResendWebhookDeliverySchema)
  async invoke(data: ResendWebhookDeliveryData): Promise<void> {
    const companyId = this.user.companyId;
    const delivery = await this.deliveryRepo.getDeliveryByIdOrThrow(data.id);
    const webhook = await this.webhookRepo.getWebhookByUrlOrThrow(delivery.url);

    await this.webhookService.deliverWebhookEvent({
      url: delivery.url,
      companyId,
      event: delivery.event,
      requestBody: delivery.requestBody,
      secret: webhook?.secret ?? null,
    });
  }
}
