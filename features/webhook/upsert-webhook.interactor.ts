import type { WebhookDto } from "./webhook.schema";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import z from "zod";
import { Resource, Action } from "@/generated/prisma";

import { WebhookEventSchema, WebhookDtoSchema } from "./webhook.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { secureUrlSchema, type Validated } from "@/core/validation/validation.utils";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const UpsertWebhookSchema = z.object({
  id: z.uuid().optional(),
  url: secureUrlSchema(),
  description: z.string().optional(),
  events: z.array(WebhookEventSchema).min(1),
  secret: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type UpsertWebhookData = Data<typeof UpsertWebhookSchema>;

export abstract class UpsertWebhookRepo {
  abstract upsertWebhookOrThrow(args: UpsertWebhookData): Promise<WebhookDto>;
  abstract getWebhookByIdOrThrow(id: string): Promise<WebhookDto>;
}

@TenantInteractor({ resource: Resource.api, action: Action.update })
export class UpsertWebhookInteractor extends AuthenticatedInteractor<UpsertWebhookData, WebhookDto> {
  constructor(
    private repo: UpsertWebhookRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpsertWebhookSchema)
  @ValidateOutput(WebhookDtoSchema)
  @Transaction
  async invoke(data: UpsertWebhookData): Validated<WebhookDto> {
    const previousWebhook = data.id ? await this.repo.getWebhookByIdOrThrow(data.id) : undefined;
    const webhook = await this.repo.upsertWebhookOrThrow(data);

    if (data.id && previousWebhook) {
      const changes = calculateChanges(previousWebhook, webhook);

      await this.eventService.publish(DomainEvent.WEBHOOK_UPDATED, {
        entityId: webhook.id,
        payload: {
          webhook,
          changes,
        },
      });
    } else {
      await this.eventService.publish(DomainEvent.WEBHOOK_CREATED, {
        entityId: webhook.id,
        payload: webhook,
      });
    }

    return { ok: true as const, data: webhook };
  }
}
