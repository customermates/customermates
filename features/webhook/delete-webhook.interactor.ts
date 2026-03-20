import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { WebhookDto } from "./webhook.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";

export const DeleteWebhookSchema = z.object({
  id: z.uuid(),
});
export type DeleteWebhookData = Data<typeof DeleteWebhookSchema>;

export abstract class DeleteWebhookRepo {
  abstract deleteWebhookOrThrow(id: string): Promise<WebhookDto>;
}

@TentantInteractor({ resource: Resource.api, action: Action.delete })
export class DeleteWebhookInteractor {
  constructor(
    private repo: DeleteWebhookRepo,
    private eventService: EventService,
  ) {}

  @Validate(DeleteWebhookSchema)
  async invoke(data: DeleteWebhookData): Validated<string, DeleteWebhookData> {
    const webhook = await this.repo.deleteWebhookOrThrow(data.id);

    await this.eventService.publish(DomainEvent.WEBHOOK_DELETED, {
      entityId: webhook.id,
      payload: webhook,
    });

    return { ok: true, data: data.id };
  }
}
