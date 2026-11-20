import type { z } from "zod";

import { WebhookEventSchema } from "@/features/webhook/webhook.schema";

const NON_TRIGGERING_EVENTS = [
  "messaging.email.deleted",
  "messaging.chat.deleted",
  "automation.rule.fired",
  "form.submitted",
  "webhook.received",
  "booking.changed",
  "record.deletedPermanently",
] as const;

export const RoutineTriggerEventSchema = WebhookEventSchema.exclude([...NON_TRIGGERING_EVENTS]);

export const ROUTINE_TRIGGER_EVENTS = RoutineTriggerEventSchema.options;

export type RoutineTriggerEvent = z.infer<typeof RoutineTriggerEventSchema>;

export function isRoutineTriggerEvent(value: string): value is RoutineTriggerEvent {
  return (ROUTINE_TRIGGER_EVENTS as readonly string[]).includes(value);
}
