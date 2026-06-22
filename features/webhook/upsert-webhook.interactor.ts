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
import { zx, type Validated } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { validateWebhookIds } from "@/core/validation/ids-validators";
import { getWebhookRepo } from "@/core/di";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z
  .object({
    id: z.uuid().optional(),
    url: zx.secureUrl().optional(),
    description: z.string().max(500).nullable().optional(),
    events: z
      .array(WebhookEventSchema)
      .min(1)
      .superRefine((events, ctx) => {
        if (new Set(events).size !== events.length)
          ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.duplicateWebhookEvents } });
      })
      .optional(),
    secret: z.string().min(1).max(256).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .superRefine(async (data, ctx) => {
    if (!data.id && (!data.url || !data.events))
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.webhookCreateFieldsRequired } });

    if (data.id) {
      const validIdsSet = await getWebhookRepo().findIds(new Set([data.id]));
      validateWebhookIds(data.id, validIdsSet, ctx, ["id"]);
    }
  });
export type UpsertWebhookData = Data<typeof Schema>;

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

  @Validate(Schema)
  @ValidateOutput(WebhookDtoSchema)
  @Transaction
  async invoke(data: UpsertWebhookData): Validated<WebhookDto> {
    const previousWebhook = data.id ? await this.repo.getWebhookByIdOrThrow(data.id) : undefined;

    const webhook = await this.repo.upsertWebhookOrThrow(data);

    if (previousWebhook) {
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
