import type { WebhookDto } from "./webhook.schema";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";
import type { ValidateWebhookIdsInteractor } from "@/core/validation/validators/validate-webhook-ids.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z.object({
  id: z.uuid(),
});
export type DeleteWebhookData = Data<typeof Schema>;

export abstract class DeleteWebhookRepo {
  abstract deleteWebhookOrThrow(id: string): Promise<WebhookDto>;
}

@TenantInteractor({ resource: Resource.api, action: Action.delete })
export class DeleteWebhookInteractor extends AuthenticatedInteractor<DeleteWebhookData, string> {
  constructor(
    private repo: DeleteWebhookRepo,
    private eventService: EventService,
    private validator: ValidateWebhookIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: Schema,
    output: z.string(),
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: DeleteWebhookData): Validated<string> {
    const webhook = await this.repo.deleteWebhookOrThrow(data.id);

    await this.eventService.publish(DomainEvent.WEBHOOK_DELETED, {
      entityId: webhook.id,
      payload: webhook,
    });

    return { ok: true as const, data: data.id };
  }
}
