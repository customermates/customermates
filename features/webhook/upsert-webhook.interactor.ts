import type { WebhookDto } from "./webhook.schema";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";
import type { ValidateWebhookIdsInteractor } from "@/core/validation/validators/validate-webhook-ids.interactor";
import type { z as zType } from "zod";

import z from "zod";
import { Resource, Action } from "@/generated/prisma";

import { WebhookEventSchema, WebhookDtoSchema } from "./webhook.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { zx, type Validated } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const UpsertWebhookSchema = z
  .object({
    id: z.uuid().optional(),
    url: zx.secureUrl().optional(),
    description: z.string().max(500).nullable().optional(),
    events: z
      .array(WebhookEventSchema)
      .meta({ minItems: 1 })
      .superRefine((events, ctx) => {
        if (events.length === 0)
          ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.webhookEventsRequired } });
        if (new Set(events).size !== events.length)
          ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.duplicateWebhookEvents } });
      })
      .optional(),
    secret: z.string().min(1).max(256).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.id) return;
    if (data.url === undefined)
      ctx.addIssue({ code: "custom", path: ["url"], params: { error: CustomErrorCode.invalidUrl } });
    if (data.events === undefined)
      ctx.addIssue({ code: "custom", path: ["events"], params: { error: CustomErrorCode.webhookEventsRequired } });
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
    private validator: ValidateWebhookIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: UpsertWebhookSchema,
    output: WebhookDtoSchema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
  })
  async invoke(data: UpsertWebhookData): Validated<WebhookDto> {
    const previousWebhook = data.id ? await this.repo.getWebhookByIdOrThrow(data.id) : undefined;

    const webhook = await this.repo.upsertWebhookOrThrow(data);

    if (previousWebhook) {
      await this.eventService.publish(DomainEvent.WEBHOOK_UPDATED, {
        entityId: webhook.id,
        payload: {
          webhook,
          changes: calculateChanges(previousWebhook, webhook),
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

  private async precheck(data: UpsertWebhookData, ctx: zType.RefinementCtx) {
    if (data.id) await this.validator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }
}
