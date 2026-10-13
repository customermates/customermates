import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  RecordTriggerDefinitionSchema,
  RecordTriggerSourceSchema,
} from "@/features/records/record-event-subscription.schema";
import { WEBHOOK_EVENTS } from "./webhook-event-registry";

export const WebhookEventSchema = z.enum(WEBHOOK_EVENTS);

export const WEBHOOK_MASKED_VALUE = "********";

export function isWebhookEndpointUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname) && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

export const WebhookEndpointSchema = zx
  .secureUrl()
  .superRefine((value, ctx) => {
    if (!z.url({ protocol: /^(https?|mailto|tel)$/ }).safeParse(value).success) return;
    if (!isWebhookEndpointUrl(value))
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.webhookEndpointInvalid } });
  })
  .describe("HTTP or HTTPS endpoint with a valid host and no username or password");

const WEBHOOK_PAUSE_REASONS = ["triggerFieldDeleted"] as const;

export const WebhookDtoSchema = z.object({
  id: z.uuid(),
  url: zx.secureUrl(),
  description: z.string().nullable(),
  events: z.array(WebhookEventSchema),
  secret: z.string().nullable(),
  headers: z.record(z.string(), z.string()).nullable(),
  bodyTemplate: z.string().nullable(),
  enabled: z.boolean(),
  pausedReason: z
    .enum(WEBHOOK_PAUSE_REASONS)
    .nullable()
    .optional()
    .describe("Why the webhook was paused automatically, for example its only trigger field was deleted."),
  recordTrigger: RecordTriggerDefinitionSchema.nullable().optional(),
  recordSources: z.array(RecordTriggerSourceSchema).nullable().optional(),
  recordOwnerUserId: z.uuid().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WebhookDto = Data<typeof WebhookDtoSchema>;

export const WebhookPublicDtoSchema = WebhookDtoSchema.omit({
  secret: true,
  headers: true,
}).extend({
  hasSecret: z.boolean(),
  headerNames: z.array(z.string()),
});
