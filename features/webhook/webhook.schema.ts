import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";
import {
  RecordTriggerDefinitionSchema,
  RecordTriggerSourceSchema,
} from "@/features/records/record-event-subscription.schema";
import { WEBHOOK_CURRENT_EVENTS } from "./webhook-event-registry";

export const WebhookCurrentEventSchema = z.enum(WEBHOOK_CURRENT_EVENTS);

export const WEBHOOK_MASKED_VALUE = "********";

export const WEBHOOK_PAUSE_REASONS = ["triggerFieldDeleted"] as const;

export const WebhookDtoSchema = z.object({
  id: z.uuid(),
  url: zx.secureUrl(),
  description: z.string().nullable(),
  events: z.array(WebhookCurrentEventSchema),
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
