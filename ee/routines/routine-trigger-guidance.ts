import { EntityType } from "@/features/records/history/v1/legacy-enums";

import type { StoredRoutineTriggerEvent } from "./routine-trigger-events";

import { STORED_ROUTINE_TRIGGER_EVENTS } from "./routine-trigger-events";

type GuidedRoutineTriggerEvent = Exclude<
  StoredRoutineTriggerEvent,
  "messaging.email.deleted" | "messaging.chat.deleted"
>;

export const ROUTINE_TRIGGER_GUIDANCE_ACTIONS = [
  "recordCreated",
  "recordUpdated",
  "recordDeleted",
  "messageReceived",
  "messageUpdated",
  "messageDeleted",
  "messageReaction",
  "emailReceived",
  "chatUpdated",
  "calendarChanged",
  "calendarEventChanged",
  "relationCreated",
] as const;

export type RoutineTriggerGuidanceAction = (typeof ROUTINE_TRIGGER_GUIDANCE_ACTIONS)[number];

export type RoutineTriggerGuidance = {
  action: RoutineTriggerGuidanceAction;
  entityType: EntityType | null;
};

export type RoutineTriggerGuidanceItem = {
  event: string;
  guidance: RoutineTriggerGuidance;
};

const RECORD_GUIDANCE = {
  contact: EntityType.contact,
  organization: EntityType.organization,
  deal: EntityType.deal,
  service: EntityType.service,
  task: EntityType.task,
} as const;

function recordGuidance(
  entityType: EntityType,
  action: Extract<RoutineTriggerGuidanceAction, "recordCreated" | "recordUpdated" | "recordDeleted">,
): RoutineTriggerGuidance {
  return { action, entityType };
}

export const ROUTINE_TRIGGER_GUIDANCE = {
  "record.created": { action: "recordCreated", entityType: null },
  "record.updated": { action: "recordUpdated", entityType: null },
  "record.deleted": { action: "recordDeleted", entityType: null },
  "contact.created": recordGuidance(RECORD_GUIDANCE.contact, "recordCreated"),
  "contact.updated": recordGuidance(RECORD_GUIDANCE.contact, "recordUpdated"),
  "contact.deleted": recordGuidance(RECORD_GUIDANCE.contact, "recordDeleted"),
  "organization.created": recordGuidance(RECORD_GUIDANCE.organization, "recordCreated"),
  "organization.updated": recordGuidance(RECORD_GUIDANCE.organization, "recordUpdated"),
  "organization.deleted": recordGuidance(RECORD_GUIDANCE.organization, "recordDeleted"),
  "deal.created": recordGuidance(RECORD_GUIDANCE.deal, "recordCreated"),
  "deal.updated": recordGuidance(RECORD_GUIDANCE.deal, "recordUpdated"),
  "deal.deleted": recordGuidance(RECORD_GUIDANCE.deal, "recordDeleted"),
  "service.created": recordGuidance(RECORD_GUIDANCE.service, "recordCreated"),
  "service.updated": recordGuidance(RECORD_GUIDANCE.service, "recordUpdated"),
  "service.deleted": recordGuidance(RECORD_GUIDANCE.service, "recordDeleted"),
  "task.created": recordGuidance(RECORD_GUIDANCE.task, "recordCreated"),
  "task.updated": recordGuidance(RECORD_GUIDANCE.task, "recordUpdated"),
  "task.deleted": recordGuidance(RECORD_GUIDANCE.task, "recordDeleted"),
  "messaging.message.received": { action: "messageReceived", entityType: null },
  "messaging.message.updated": { action: "messageUpdated", entityType: null },
  "messaging.message.deleted": { action: "messageDeleted", entityType: null },
  "messaging.message.reaction": { action: "messageReaction", entityType: null },
  "messaging.email.received": { action: "emailReceived", entityType: null },
  "messaging.chat.updated": { action: "chatUpdated", entityType: null },
  "messaging.calendar.changed": { action: "calendarChanged", entityType: null },
  "messaging.calendar_event.changed": {
    action: "calendarEventChanged",
    entityType: null,
  },
  "messaging.relation.created": { action: "relationCreated", entityType: null },
} satisfies Record<GuidedRoutineTriggerEvent, RoutineTriggerGuidance>;

export function routineTriggerGuidance(event: string): RoutineTriggerGuidance | null {
  return Object.prototype.hasOwnProperty.call(ROUTINE_TRIGGER_GUIDANCE, event)
    ? ROUTINE_TRIGGER_GUIDANCE[event as GuidedRoutineTriggerEvent]
    : null;
}

export function orderedRoutineTriggerGuidance(events: readonly string[]): RoutineTriggerGuidanceItem[] {
  const selected = new Set(events);

  return STORED_ROUTINE_TRIGGER_EVENTS.flatMap((event) => {
    const guidance = routineTriggerGuidance(event);

    return selected.has(event) && guidance ? [{ event, guidance }] : [];
  });
}
