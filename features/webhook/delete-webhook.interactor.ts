import type { WebhookDto } from "./webhook.schema";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const DeleteWebhookSchema = z.object({
  id: z.uuid(),
});
export type DeleteWebhookData = Data<typeof DeleteWebhookSchema>;

export abstract class DeleteWebhookRepo {
  abstract deleteWebhookOrThrow(id: string): Promise<WebhookDto>;
}

@TenantInteractor({ resource: Resource.api, action: Action.delete })
export class DeleteWebhookInteractor extends AuthenticatedInteractor<DeleteWebhookData, string> {
  constructor(
    private repo: DeleteWebhookRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(DeleteWebhookSchema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteWebhookData): Validated<string> {
    const webhook = await this.repo.deleteWebhookOrThrow(data.id);

    await this.eventService.publish(DomainEvent.WEBHOOK_DELETED, {
      entityId: webhook.id,
      payload: webhook,
    });

    return { ok: true as const, data: data.id };
  }
}
