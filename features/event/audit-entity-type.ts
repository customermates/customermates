import { DomainEvent } from "./domain-events";

import { EntityType } from "@/generated/prisma";

export const AUDIT_EVENT_ENTITY_TYPE: Record<DomainEvent, EntityType | null> = {
  [DomainEvent.CONTACT_CREATED]: EntityType.contact,
  [DomainEvent.CONTACT_UPDATED]: EntityType.contact,
  [DomainEvent.CONTACT_DELETED]: EntityType.contact,
  [DomainEvent.ORGANIZATION_CREATED]: EntityType.organization,
  [DomainEvent.ORGANIZATION_UPDATED]: EntityType.organization,
  [DomainEvent.ORGANIZATION_DELETED]: EntityType.organization,
  [DomainEvent.DEAL_CREATED]: EntityType.deal,
  [DomainEvent.DEAL_UPDATED]: EntityType.deal,
  [DomainEvent.DEAL_DELETED]: EntityType.deal,
  [DomainEvent.SERVICE_CREATED]: EntityType.service,
  [DomainEvent.SERVICE_UPDATED]: EntityType.service,
  [DomainEvent.SERVICE_DELETED]: EntityType.service,
  [DomainEvent.TASK_CREATED]: EntityType.task,
  [DomainEvent.TASK_UPDATED]: EntityType.task,
  [DomainEvent.TASK_DELETED]: EntityType.task,

  [DomainEvent.USER_REGISTERED]: null,
  [DomainEvent.USER_UPDATED]: null,
  [DomainEvent.COMPANY_UPDATED]: null,
  [DomainEvent.LEGAL_NOTICE_SENT]: null,
  [DomainEvent.LEGAL_DOCUMENTS_ACCEPTED]: null,
  [DomainEvent.ROLE_CREATED]: null,
  [DomainEvent.ROLE_UPDATED]: null,
  [DomainEvent.ROLE_DELETED]: null,
  [DomainEvent.WEBHOOK_CREATED]: null,
  [DomainEvent.WEBHOOK_UPDATED]: null,
  [DomainEvent.WEBHOOK_DELETED]: null,
  [DomainEvent.CUSTOM_COLUMN_CREATED]: null,
  [DomainEvent.CUSTOM_COLUMN_UPDATED]: null,
  [DomainEvent.CUSTOM_COLUMN_DELETED]: null,
  [DomainEvent.CONNECTED_ACCOUNT_CREATED]: null,
  [DomainEvent.CONNECTED_ACCOUNT_DELETED]: null,
  [DomainEvent.CONNECTED_ACCOUNT_UPDATED]: null,
  [DomainEvent.CONNECTED_ACCOUNT_RECONNECTED]: null,
  [DomainEvent.CONNECTED_ACCOUNT_RESYNCED]: null,
  [DomainEvent.MESSAGING_MESSAGE_RECEIVED]: null,
  [DomainEvent.MESSAGING_MESSAGE_UPDATED]: null,
  [DomainEvent.MESSAGING_MESSAGE_DELETED]: null,
  [DomainEvent.MESSAGING_MESSAGE_REACTION]: null,
  [DomainEvent.MESSAGING_EMAIL_RECEIVED]: null,
  [DomainEvent.MESSAGING_EMAIL_DELETED]: null,
  [DomainEvent.MESSAGING_CHAT_UPDATED]: null,
  [DomainEvent.MESSAGING_CHAT_DELETED]: null,
  [DomainEvent.MESSAGING_CALENDAR_CHANGED]: null,
  [DomainEvent.MESSAGING_CALENDAR_EVENT_CHANGED]: null,
  [DomainEvent.MESSAGING_RELATION_CREATED]: null,
};

export function auditEntityTypeFor(event: string): EntityType | null {
  return AUDIT_EVENT_ENTITY_TYPE[event as DomainEvent] ?? null;
}

export function auditEventsForEntityTypes(entityTypes: readonly EntityType[]): DomainEvent[] {
  const wanted = new Set(entityTypes);

  return (Object.keys(AUDIT_EVENT_ENTITY_TYPE) as DomainEvent[]).filter((event) => {
    const entityType = AUDIT_EVENT_ENTITY_TYPE[event];

    return entityType !== null && wanted.has(entityType);
  });
}
