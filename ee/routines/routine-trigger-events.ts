import type { z } from "zod";

import { WebhookCurrentEventSchema } from "@/features/webhook/webhook.schema";
import { DomainEvent } from "@/features/event/domain-events";

const NON_TRIGGERING_EVENTS = [DomainEvent.MESSAGING_EMAIL_DELETED, DomainEvent.MESSAGING_CHAT_DELETED] as const;

export const RoutineTriggerEventSchema = WebhookCurrentEventSchema.exclude([...NON_TRIGGERING_EVENTS]);

export const ROUTINE_TRIGGER_EVENTS = RoutineTriggerEventSchema.options;

export type RoutineTriggerEvent = z.infer<typeof RoutineTriggerEventSchema>;

export function isRoutineTriggerEvent(value: string): value is RoutineTriggerEvent {
  return (ROUTINE_TRIGGER_EVENTS as readonly string[]).includes(value);
}
