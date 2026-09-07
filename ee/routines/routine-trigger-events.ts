import type { z } from "zod";

import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import { DomainEvent } from "@/features/event/domain-events";

export const RoutineTriggerEventSchema = WebhookEventSchema.exclude([
  DomainEvent.MESSAGING_EMAIL_DELETED,
  DomainEvent.MESSAGING_CHAT_DELETED,
]);

export const ROUTINE_TRIGGER_EVENTS = RoutineTriggerEventSchema.options;

export type RoutineTriggerEvent = z.infer<typeof RoutineTriggerEventSchema>;
