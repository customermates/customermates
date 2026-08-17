import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";
import { WEBHOOK_EVENTS } from "./webhook-event-registry";

export const WebhookEventSchema = z.enum(WEBHOOK_EVENTS);

export const WebhookDtoSchema = z.object({
  id: z.uuid(),
  url: zx.secureUrl(),
  description: z.string().nullable(),
  events: z.array(WebhookEventSchema),
  secret: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WebhookDto = Data<typeof WebhookDtoSchema>;

export const WebhookPublicDtoSchema = WebhookDtoSchema.omit({
  secret: true,
}).extend({
  hasSecret: z.boolean(),
});
