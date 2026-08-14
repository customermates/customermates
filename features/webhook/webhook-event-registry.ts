export const WEBHOOK_EVENTS = [
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
] as const;

export const WEBHOOK_EVENT_COUNT = WEBHOOK_EVENTS.length;
export const WEBHOOK_MESSAGING_EVENT_COUNT = WEBHOOK_EVENTS.filter((event) => event.startsWith("messaging.")).length;
export const WEBHOOK_RECORD_EVENT_COUNT = WEBHOOK_EVENT_COUNT - WEBHOOK_MESSAGING_EVENT_COUNT;
