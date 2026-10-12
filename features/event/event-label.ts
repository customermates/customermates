export const LEGACY_DOMAIN_EVENTS = [
  "company.updated",
  "contact.created",
  "contact.deleted",
  "contact.updated",
  "custom_column.created",
  "custom_column.deleted",
  "custom_column.updated",
  "deal.created",
  "deal.deleted",
  "deal.updated",
  "organization.created",
  "organization.deleted",
  "organization.updated",
  "service.created",
  "service.deleted",
  "service.updated",
  "task.created",
  "task.deleted",
  "task.updated",
] as const;

export type EventLabelTranslator = {
  (key: string): string;
  has: (key: string) => boolean;
  raw: (key: string) => unknown;
};

export function eventLabel(t: EventLabelTranslator, event: string): string {
  if (t.has(`Common.events.${event}`) && typeof t.raw(`Common.events.${event}`) === "string")
    return t(`Common.events.${event}`);
  if (t.has(`Common.legacyEvents.${event}`) && typeof t.raw(`Common.legacyEvents.${event}`) === "string")
    return t(`Common.legacyEvents.${event}`);
  return event;
}
