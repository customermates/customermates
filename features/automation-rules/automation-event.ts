import { z } from "zod";

import type { AutomationTriggerKind } from "@/generated/prisma";
import type { AutomationTrigger } from "./automation-rule.schema";

import { EXTERNAL_TRIGGER_EVENTS } from "@/features/event/external-trigger-events";
import type { WEBHOOK_MESSAGING_EVENTS } from "@/features/webhook/webhook-event-registry";
import { eventOccurrenceKey } from "./automation-occurrence";

export const MESSAGE_RULE_EVENTS = [
  "messaging.email.received",
  "messaging.message.received",
] as const satisfies readonly (typeof WEBHOOK_MESSAGING_EVENTS)[number][];

const ExternalPayloadSchema = z.looseObject({
  typeId: z.uuid().optional(),
  recordId: z.uuid().nullish(),
  formId: z.uuid().optional(),
  webhookId: z.uuid().optional(),
  outcome: z.string().optional(),
});

const MessagePayloadSchema = z.looseObject({ connectedAccountId: z.string().min(1) });

export type AutomationEventDescriptor = {
  triggerKind: AutomationTriggerKind;
  typeId: string | null;
  recordId: string | null;
  occurrenceKey: string;
  channel: "email" | "chat" | null;
  sourceId: string | null;
  connectedAccountId: string | null;
};

type EventInput = { id: string; kind: string; payload: unknown };

function describeMessageEvent(event: EventInput): AutomationEventDescriptor | null {
  if (!(MESSAGE_RULE_EVENTS as readonly string[]).includes(event.kind)) return null;
  const payload = MessagePayloadSchema.safeParse(event.payload);
  if (!payload.success) return null;
  return {
    triggerKind: "messageReceived",
    typeId: null,
    recordId: null,
    occurrenceKey: eventOccurrenceKey(event.id),
    channel: event.kind === "messaging.email.received" ? "email" : "chat",
    sourceId: null,
    connectedAccountId: payload.data.connectedAccountId,
  };
}

function describeExternalEvent(event: EventInput): AutomationEventDescriptor | null {
  if (!(EXTERNAL_TRIGGER_EVENTS as readonly string[]).includes(event.kind)) return null;
  const payload = ExternalPayloadSchema.safeParse(event.payload);
  if (!payload.success || !payload.data.typeId || !payload.data.recordId) return null;
  if (payload.data.outcome === "duplicate") return null;
  const isForm = event.kind === "form.submitted";
  return {
    triggerKind: isForm ? "formSubmitted" : "webhookReceived",
    typeId: payload.data.typeId,
    recordId: payload.data.recordId,
    occurrenceKey: eventOccurrenceKey(event.id),
    channel: null,
    sourceId: (isForm ? payload.data.formId : payload.data.webhookId) ?? null,
    connectedAccountId: null,
  };
}

export function describeAutomationEvent(event: EventInput): AutomationEventDescriptor | null {
  return describeMessageEvent(event) ?? describeExternalEvent(event);
}

export function triggerMatchesEvent(trigger: AutomationTrigger, event: AutomationEventDescriptor): boolean {
  switch (trigger.kind) {
    case "messageReceived":
      return (
        event.triggerKind === "messageReceived" && (trigger.channel === "any" || trigger.channel === event.channel)
      );
    case "formSubmitted":
    case "webhookReceived":
      return (
        event.triggerKind === trigger.kind &&
        (!trigger.typeId || trigger.typeId === event.typeId) &&
        (!trigger.sourceId || trigger.sourceId === event.sourceId)
      );
    default:
      return false;
  }
}

export function subscribedRuleKinds(eventKind: string): AutomationTriggerKind[] {
  if ((MESSAGE_RULE_EVENTS as readonly string[]).includes(eventKind)) return ["messageReceived"];
  if (eventKind === "form.submitted") return ["formSubmitted"];
  if (eventKind === "webhook.received") return ["webhookReceived"];
  return [];
}
