import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";

export const WebhookEventSchema = z.enum([
  "contact.created",
  "contact.updated",
  "contact.deleted",
  "organization.created",
  "organization.updated",
  "organization.deleted",
  "deal.created",
  "deal.updated",
  "deal.deleted",
  "service.created",
  "service.updated",
  "service.deleted",
  "task.created",
  "task.updated",
  "task.deleted",
  "messaging.message.received",
  "messaging.message.updated",
  "messaging.message.deleted",
  "messaging.message.reaction",
  "messaging.email.received",
  "messaging.email.deleted",
  "messaging.chat.updated",
  "messaging.chat.deleted",
  "messaging.calendar.changed",
  "messaging.calendar_event.changed",
  "messaging.relation.created",
]);

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
