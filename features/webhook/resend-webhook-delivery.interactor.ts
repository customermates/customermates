import type { WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";
import type { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import type { deliverWebhook } from "@/trigger/webhook-deliveries";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UserAccessor } from "@/core/base/user-accessor";

const ResendWebhookDeliverySchema = z.object({
  id: z.uuid(),
});
export type ResendWebhookDeliveryData = z.infer<typeof ResendWebhookDeliverySchema>;

export abstract class GetWebhookDeliveryByIdRepo {
  abstract getDeliveryByIdOrThrow(id: string): Promise<WebhookDeliveryDto>;
}

@TenantInteractor({ resource: Resource.api, action: Action.create })
export class ResendWebhookDeliveryInteractor extends UserAccessor {
  constructor(
    private deliveryRepo: GetWebhookDeliveryByIdRepo,
    private createRepo: CreateWebhookDeliveryRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {
    super();
  }

  @Enforce(ResendWebhookDeliverySchema)
  async invoke(data: ResendWebhookDeliveryData): Promise<void> {
    const delivery = await this.deliveryRepo.getDeliveryByIdOrThrow(data.id);
    const requestBody = delivery.requestBody as Record<string, unknown>;

    const [newDeliveryId] = await this.createRepo.create([
      {
        url: delivery.url,
        event: delivery.event,
        requestBody,
      },
    ]);

    await this.backgroundTaskService.dispatch<typeof deliverWebhook>("deliver-webhook", {
      deliveryId: newDeliveryId,
      url: delivery.url,
      companyId: this.companyId,
      requestBody,
    });
  }
}
