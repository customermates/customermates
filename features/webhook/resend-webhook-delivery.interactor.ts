import type { GetWebhookDeliveryByIdRepo } from "./get-webhook-delivery-by-id.repo";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { ValidateWebhookDeliveryIdsInteractor } from "@/core/validation/validators/validate-webhook-delivery-ids.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { Write } from "@/core/decorators/write.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failConflict, failNotFound, failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({
  id: z.uuid(),
});
export type ResendWebhookDeliveryData = z.infer<typeof Schema>;

@TenantInteractor({ resource: Resource.api, action: Action.create })
export class ResendWebhookDeliveryInteractor extends AuthenticatedInteractor<ResendWebhookDeliveryData, string> {
  constructor(
    private deliveryRepo: GetWebhookDeliveryByIdRepo,
    private backgroundTaskService: BackgroundTaskService,
    private validator: ValidateWebhookDeliveryIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: Schema,
    output: z.string(),
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: ResendWebhookDeliveryData): Validated<string> {
    const result = await this.deliveryRepo.createRetryById(data.id);
    if (result.status === "missing") return failNotFound(CustomErrorCode.webhookDeliveryNotFound);
    if (result.status === "unavailable") return failConflict(CustomErrorCode.webhookNotFound);
    if (result.status === "stale") return failConflict(CustomErrorCode.recordSchemaChanged);
    if (result.status === "forbidden") return failAuthorization(CustomErrorCode.permissionDenied);

    await this.backgroundTaskService.dispatch("deliver-webhook", {
      deliveryId: result.id,
      companyId: this.companyId,
    });
    return { ok: true as const, data: result.id };
  }
}
