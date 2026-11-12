import { z } from "zod";

import type { AutomationTriggerKind } from "@/generated/prisma";
import type { CalculatedValue } from "@/features/records/record-model.schema";
import type { AutomationTrigger } from "./automation-rule.schema";

import { RecordEventPayloadSchema } from "@/features/records/record-event.schema";
import { scalarEquals } from "./automation-conditions";
import { eventOccurrenceKey } from "./automation-occurrence";

export const MESSAGE_RULE_EVENTS = ["messaging.email.received", "messaging.message.received"] as const;
export const EXTERNAL_RULE_EVENTS = ["form.submitted", "webhook.received"] as const;

const ExternalPayloadSchema = z.looseObject({
  typeId: z.uuid().optional(),
  recordId: z.uuid().nullish(),
  formId: z.uuid().optional(),
  webhookId: z.uuid().optional(),
  outcome: z.string().optional(),
});

const MessagePayloadSchema = z.looseObject({ connectedAccountId: z.string().min(1) });

export type AutomationEventDescriptor = {
  triggerKinds: AutomationTriggerKind[];
  typeId: string | null;
  includeUntyped: boolean;
  recordId: string | null;
  occurrenceKey: string;
  chain: string[];
  changedFieldIds: string[];
  afterValues: Map<string, CalculatedValue>;
  channel: "email" | "chat" | null;
  sourceId: string | null;
  connectedAccountId: string | null;
};

type EventInput = { id: string; kind: string; subjectKind: string; payload: unknown };

function emptyDescriptor(): Omit<AutomationEventDescriptor, "triggerKinds" | "occurrenceKey"> {
  return {
    typeId: null,
    includeUntyped: false,
    recordId: null,
    chain: [],
    changedFieldIds: [],
    afterValues: new Map(),
    channel: null,
    sourceId: null,
    connectedAccountId: null,
  };
}

function describeRecordEvent(event: EventInput): AutomationEventDescriptor | null {
  if (event.kind !== "record.created" && event.kind !== "record.updated") return null;
  const payload = RecordEventPayloadSchema.safeParse(event.payload);
  if (!payload.success) return null;
  const afterValues = new Map<string, CalculatedValue>();
  for (const field of payload.data.fields) if (field.after) afterValues.set(field.fieldId, field.after.value);
  return {
    ...emptyDescriptor(),
    triggerKinds: event.kind === "record.created" ? ["recordCreated"] : ["recordUpdated", "fieldChanged"],
    typeId: payload.data.ref.typeId,
    recordId: payload.data.ref.recordId,
    occurrenceKey: eventOccurrenceKey(event.id),
    chain: payload.data.cause.ruleChain ?? [],
    changedFieldIds: payload.data.changedFieldIds,
    afterValues,
  };
}

function describeMessageEvent(event: EventInput): AutomationEventDescriptor | null {
  if (!(MESSAGE_RULE_EVENTS as readonly string[]).includes(event.kind)) return null;
  const payload = MessagePayloadSchema.safeParse(event.payload);
  if (!payload.success) return null;
  return {
    ...emptyDescriptor(),
    triggerKinds: ["messageReceived"],
    includeUntyped: true,
    occurrenceKey: eventOccurrenceKey(event.id),
    channel: event.kind === "messaging.email.received" ? "email" : "chat",
    connectedAccountId: payload.data.connectedAccountId,
  };
}

function describeExternalEvent(event: EventInput): AutomationEventDescriptor | null {
  if (!(EXTERNAL_RULE_EVENTS as readonly string[]).includes(event.kind)) return null;
  const payload = ExternalPayloadSchema.safeParse(event.payload);
  if (!payload.success || !payload.data.typeId || !payload.data.recordId) return null;
  if (payload.data.outcome === "duplicate") return null;
  const isForm = event.kind === "form.submitted";
  return {
    ...emptyDescriptor(),
    triggerKinds: [isForm ? "formSubmitted" : "webhookReceived"],
    typeId: payload.data.typeId,
    includeUntyped: true,
    recordId: payload.data.recordId,
    occurrenceKey: eventOccurrenceKey(event.id),
    sourceId: (isForm ? payload.data.formId : payload.data.webhookId) ?? null,
  };
}

export function describeAutomationEvent(event: EventInput): AutomationEventDescriptor | null {
  if (event.subjectKind === "record") return describeRecordEvent(event);
  return describeMessageEvent(event) ?? describeExternalEvent(event);
}

export function triggerMatchesEvent(trigger: AutomationTrigger, event: AutomationEventDescriptor): boolean {
  switch (trigger.kind) {
    case "recordCreated":
      return event.triggerKinds.includes("recordCreated") && event.typeId === trigger.typeId;
    case "recordUpdated":
      return (
        event.triggerKinds.includes("recordUpdated") &&
        event.typeId === trigger.typeId &&
        event.changedFieldIds.length > 0 &&
        (trigger.fieldIds.length === 0 || trigger.fieldIds.some((id) => event.changedFieldIds.includes(id)))
      );
    case "fieldChanged": {
      if (!event.triggerKinds.includes("fieldChanged") || event.typeId !== trigger.typeId) return false;
      if (!event.changedFieldIds.includes(trigger.fieldId)) return false;
      if (!trigger.to) return true;
      const after = event.afterValues.get(trigger.fieldId);
      return after?.state === "value" && scalarEquals(after.value, trigger.to);
    }
    case "messageReceived":
      return event.triggerKinds.includes("messageReceived") && (trigger.channel === "any" || trigger.channel === event.channel);
    case "formSubmitted":
    case "webhookReceived":
      return (
        event.triggerKinds.includes(trigger.kind) &&
        (!trigger.typeId || trigger.typeId === event.typeId) &&
        (!trigger.sourceId || trigger.sourceId === event.sourceId)
      );
    case "dateReached":
      return false;
  }
}

export function subscribedRuleKinds(eventKind: string): AutomationTriggerKind[] {
  if ((MESSAGE_RULE_EVENTS as readonly string[]).includes(eventKind)) return ["messageReceived"];
  if (eventKind === "form.submitted") return ["formSubmitted"];
  if (eventKind === "webhook.received") return ["webhookReceived"];
  return [];
}
