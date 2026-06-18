import type { WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";
import type { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const ResendWebhookDeliverySchema = z.object({
  id: z.uuid(),
});
export type ResendWebhookDeliveryData = z.infer<typeof ResendWebhookDeliverySchema>;

export abstract class GetWebhookDeliveryByIdRepo {
  abstract getDeliveryByIdOrThrow(id: string): Promise<WebhookDeliveryDto>;
}

@TenantInteractor({ resource: Resource.api, action: Action.create })
export class ResendWebhookDeliveryInteractor extends AuthenticatedInteractor<ResendWebhookDeliveryData, string> {
  constructor(
    private deliveryRepo: GetWebhookDeliveryByIdRepo,
    private createRepo: CreateWebhookDeliveryRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {
    super();
  }

  @Validate(ResendWebhookDeliverySchema)
  @ValidateOutput(z.string())
  async invoke(data: ResendWebhookDeliveryData): Validated<string> {
    const delivery = await this.deliveryRepo.getDeliveryByIdOrThrow(data.id);
    const requestBody = delivery.requestBody as Record<string, unknown>;

    const [newDeliveryId] = await this.createRepo.create([
      {
        url: delivery.url,
        event: delivery.event,
        requestBody,
      },
    ]);

    await this.backgroundTaskService.dispatch("deliver-webhook", {
      deliveryId: newDeliveryId,
      url: delivery.url,
      companyId: this.companyId,
      requestBody,
    });

    return { ok: true as const, data: newDeliveryId };
  }
}
