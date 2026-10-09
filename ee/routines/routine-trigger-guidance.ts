import type { RoutineTriggerEvent } from "./routine-trigger-events";

import { ROUTINE_TRIGGER_EVENTS } from "./routine-trigger-events";

type GuidedRoutineTriggerEvent = Exclude<RoutineTriggerEvent, "messaging.email.deleted" | "messaging.chat.deleted">;

export const ROUTINE_TRIGGER_GUIDANCE_ACTIONS = [
  "recordCreated",
  "recordUpdated",
  "recordDeleted",
  "recordRestored",
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
};

export type RoutineTriggerGuidanceItem = {
  event: string;
  guidance: RoutineTriggerGuidance;
};

export const ROUTINE_TRIGGER_GUIDANCE = {
  "record.created": { action: "recordCreated" },
  "record.updated": { action: "recordUpdated" },
  "record.deleted": { action: "recordDeleted" },
  "record.restored": { action: "recordRestored" },
  "messaging.message.received": { action: "messageReceived" },
  "messaging.message.updated": { action: "messageUpdated" },
  "messaging.message.deleted": { action: "messageDeleted" },
  "messaging.message.reaction": { action: "messageReaction" },
  "messaging.email.received": { action: "emailReceived" },
  "messaging.chat.updated": { action: "chatUpdated" },
  "messaging.calendar.changed": { action: "calendarChanged" },
  "messaging.calendar_event.changed": { action: "calendarEventChanged" },
  "messaging.relation.created": { action: "relationCreated" },
} satisfies Record<GuidedRoutineTriggerEvent, RoutineTriggerGuidance>;

export function routineTriggerGuidance(event: string): RoutineTriggerGuidance | null {
  return Object.prototype.hasOwnProperty.call(ROUTINE_TRIGGER_GUIDANCE, event)
    ? ROUTINE_TRIGGER_GUIDANCE[event as GuidedRoutineTriggerEvent]
    : null;
}

export function orderedRoutineTriggerGuidance(events: readonly string[]): RoutineTriggerGuidanceItem[] {
  const selected = new Set(events);

  return ROUTINE_TRIGGER_EVENTS.flatMap((event) => {
    const guidance = routineTriggerGuidance(event);

    return selected.has(event) && guidance ? [{ event, guidance }] : [];
  });
}
