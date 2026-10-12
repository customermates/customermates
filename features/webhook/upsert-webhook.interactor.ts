import type { UpsertWebhookRepo } from "./upsert-webhook.repo";
import {
  RecordTriggerDefinitionSchema,
  RecordTriggerSourceSchema,
} from "@/features/records/record-event-subscription.schema";
import { RecordWriteError } from "@/features/records/record-write.service";
import { recordWriteFailure } from "@/features/records/mutate-record.interactor";
import type { WebhookDto } from "./webhook.schema";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";
import type { ValidateWebhookIdsInteractor } from "@/core/validation/validators/validate-webhook-ids.interactor";
import type { z as zType } from "zod";

import z from "zod";
import { Resource } from "@/generated/prisma";

import { WebhookCurrentEventSchema, WebhookDtoSchema } from "./webhook.schema";
import { WebhookHeadersSchema, allowsCredentialedHeaders } from "./webhook-headers";
import { calculateWebhookChanges, toWebhookEventPayload } from "./webhook-event-payload";
import { WEBHOOK_BODY_TEMPLATE_MAX_CHARS, isRenderableWebhookBodyTemplate } from "./webhook-body-template";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { zx, type Validated } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const UpsertWebhookSchema = z
  .object({
    id: z.uuid().optional(),
    url: zx.secureUrl().optional(),
    description: z.string().max(500).nullable().optional(),
    events: z
      .array(WebhookCurrentEventSchema)
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
    recordTrigger: RecordTriggerDefinitionSchema.nullable()
      .optional()
      .describe(
        "Narrows the record events to one filter: query (typeId, filters, relationships, relatedFilters, search) selects the records, and changedFieldIds limits record.updated to changes of those fields. Cannot be combined with recordSources. null clears it.",
      ),
    recordSources: z
      .array(RecordTriggerSourceSchema)
      .min(1)
      .max(50)
      .nullable()
      .optional()
      .describe(
        "Up to 50 trigger sources, each with its own query, changedFieldIds and record events, for a webhook that follows several lists. Cannot be combined with recordTrigger. null clears them.",
      ),
    recordOwnerUserId: z
      .uuid()
      .optional()
      .describe(
        "The user whose record access filters and redacts record deliveries. Defaults to the existing owner, or to the caller for a new subscription.",
      ),
    expectedSchemaRevision: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "The current configuration revision from POST /v1/model/discover. Required whenever record events are subscribed for the first time or recordTrigger, recordSources or recordOwnerUserId change; a stale revision fails with a conflict.",
      ),
  })
  .superRefine((data, ctx) => {
    if (data.recordTrigger && data.recordSources?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["recordSources"],
        params: { error: CustomErrorCode.recordConfigurationInvalid },
      });
    }
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

@TenantInteractor({ resource: Resource.api, manage: "upsert" })
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

    let webhook: WebhookDto;
    try {
      webhook = await this.repo.upsertWebhookOrThrow(data);
    } catch (error) {
      if (error instanceof RecordWriteError) return recordWriteFailure(error);
      throw error;
    }

    if (previousWebhook) {
      await this.eventService.publish(DomainEvent.WEBHOOK_UPDATED, {
        entityId: webhook.id,
        payload: {
          webhook: toWebhookEventPayload(webhook),
          changes: calculateWebhookChanges(previousWebhook, webhook),
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
