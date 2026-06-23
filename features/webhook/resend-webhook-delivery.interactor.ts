import type { WebhookDeliveryDto } from "./get-webhook-deliveries.interactor";
import type { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { ValidateWebhookDeliveryIdsInteractor } from "@/core/validation/validators/validate-webhook-delivery-ids.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { Write } from "@/core/decorators/write.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z.object({
  id: z.uuid(),
});
export type ResendWebhookDeliveryData = z.infer<typeof Schema>;

export abstract class GetWebhookDeliveryByIdRepo {
  abstract getDeliveryByIdOrThrow(id: string): Promise<WebhookDeliveryDto>;
}

@TenantInteractor({ resource: Resource.api, action: Action.create })
export class ResendWebhookDeliveryInteractor extends AuthenticatedInteractor<ResendWebhookDeliveryData, string> {
  constructor(
    private deliveryRepo: GetWebhookDeliveryByIdRepo,
    private createRepo: CreateWebhookDeliveryRepo,
    private backgroundTaskService: BackgroundTaskService,
    private validator: ValidateWebhookDeliveryIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: Schema,
    output: z.string(),
    tx: false,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
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
