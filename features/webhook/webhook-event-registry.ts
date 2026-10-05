export const WEBHOOK_RECORD_EVENTS = ["record.created", "record.updated", "record.deleted"] as const;

export const WEBHOOK_MESSAGING_EVENTS = [
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
] as const;

export const WEBHOOK_CURRENT_EVENTS = [...WEBHOOK_RECORD_EVENTS, ...WEBHOOK_MESSAGING_EVENTS] as const;

export const WEBHOOK_EVENT_COUNT = WEBHOOK_CURRENT_EVENTS.length;
export const WEBHOOK_MESSAGING_EVENT_COUNT = WEBHOOK_MESSAGING_EVENTS.length;
export const WEBHOOK_RECORD_EVENT_COUNT = WEBHOOK_RECORD_EVENTS.length;
