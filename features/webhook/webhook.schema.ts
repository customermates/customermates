import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { secureUrlSchema } from "@/core/validation/validation.utils";

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
]);

export const WebhookDtoSchema = z.object({
  id: z.uuid(),
  url: secureUrlSchema(),
  description: z.string().nullable(),
  events: z.array(WebhookEventSchema),
  secret: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WebhookDto = Data<typeof WebhookDtoSchema>;
