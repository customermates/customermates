import type { WebhookDto } from "./webhook.schema";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";
import type { ValidateWebhookIdsInteractor } from "@/core/validation/validators/validate-webhook-ids.interactor";
import type { z as zType } from "zod";

import z from "zod";
import { Resource, Action } from "@/generated/prisma";

import { WebhookEventSchema, WebhookDtoSchema } from "./webhook.schema";
import { WebhookHeadersSchema, allowsCredentialedHeaders } from "./webhook-headers";
import { toWebhookEventPayload } from "./webhook-event-payload";
import { WEBHOOK_BODY_TEMPLATE_MAX_CHARS, isRenderableWebhookBodyTemplate } from "./webhook-body-template";

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
    headers: WebhookHeadersSchema.nullable().optional(),
    bodyTemplate: z
      .string()
      .max(WEBHOOK_BODY_TEMPLATE_MAX_CHARS)
      .nullable()
      .optional()
      .superRefine((template, ctx) => {
        if (template === null || template === undefined) return;
        if (!isRenderableWebhookBodyTemplate(template))
          ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.webhookBodyTemplateInvalid } });
      }),
    enabled: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.url && data.headers && Object.keys(data.headers).length > 0 && !allowsCredentialedHeaders(data.url)) {
      ctx.addIssue({
        code: "custom",
        path: ["headers"],
        params: { error: CustomErrorCode.webhookHeadersRequireHttps },
      });
    }

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
  abstract getWebhookById(id: string): Promise<WebhookDto | null>;
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
      const previousPayload = toWebhookEventPayload(previousWebhook);
      const nextPayload = toWebhookEventPayload(webhook);

      await this.eventService.publish(DomainEvent.WEBHOOK_UPDATED, {
        entityId: webhook.id,
        payload: {
          webhook: nextPayload,
          changes: calculateChanges(previousPayload, nextPayload),
        },
      });
    } else {
      await this.eventService.publish(DomainEvent.WEBHOOK_CREATED, {
        entityId: webhook.id,
        payload: toWebhookEventPayload(webhook),
      });
    }

    return { ok: true as const, data: webhook };
  }

  private async precheck(data: UpsertWebhookData, ctx: zType.RefinementCtx) {
    if (data.id) await this.validator.invoke([{ ids: data.id, path: ["id"] }], ctx);

    const existing = data.id ? await this.repo.getWebhookById(data.id) : null;
    const url = data.url ?? existing?.url;
    const headers = data.headers === undefined ? existing?.headers : data.headers;

    if (url && headers && Object.keys(headers).length > 0 && !allowsCredentialedHeaders(url)) {
      ctx.addIssue({
        code: "custom",
        path: ["headers"],
        params: { error: CustomErrorCode.webhookHeadersRequireHttps },
      });
    }
  }
}
