import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";

import { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
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

@TentantInteractor({ resource: Resource.api, action: Action.create })
export class ResendWebhookDeliveryInteractor extends UserAccessor {
  constructor(
    private deliveryRepo: GetWebhookDeliveryByIdRepo,
    private createRepo: CreateWebhookDeliveryRepo,
  ) {
    super();
  }

  @Enforce(ResendWebhookDeliverySchema)
  async invoke(data: ResendWebhookDeliveryData): Promise<void> {
    const delivery = await this.deliveryRepo.getDeliveryByIdOrThrow(data.id);

    await this.createRepo.create([
      {
        url: delivery.url,
        event: delivery.event,
        requestBody: delivery.requestBody as Record<string, unknown>,
      },
    ]);
  }
}
