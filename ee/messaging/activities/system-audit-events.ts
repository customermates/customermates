import { DomainEvent } from "@/features/event/domain-events";
import { extractAuditChanges } from "@/features/audit-log/audit-log-changes";

export const SYSTEM_ACTIVITY_AUDIT_EVENTS = [
  DomainEvent.USER_REGISTERED,
  DomainEvent.USER_UPDATED,
  DomainEvent.COMPANY_UPDATED,
  DomainEvent.ROLE_CREATED,
  DomainEvent.ROLE_UPDATED,
  DomainEvent.ROLE_DELETED,
  DomainEvent.WEBHOOK_CREATED,
  DomainEvent.WEBHOOK_UPDATED,
  DomainEvent.WEBHOOK_DELETED,
  DomainEvent.CUSTOM_COLUMN_CREATED,
  DomainEvent.CUSTOM_COLUMN_UPDATED,
  DomainEvent.CUSTOM_COLUMN_DELETED,
  DomainEvent.ROUTINE_CREATED,
  DomainEvent.ROUTINE_UPDATED,
  DomainEvent.ROUTINE_DELETED,
  DomainEvent.CONNECTED_ACCOUNT_CREATED,
  DomainEvent.CONNECTED_ACCOUNT_DELETED,
  DomainEvent.CONNECTED_ACCOUNT_UPDATED,
  DomainEvent.CONNECTED_ACCOUNT_RECONNECTED,
  DomainEvent.CONNECTED_ACCOUNT_RESYNCED,
  DomainEvent.LEGAL_NOTICE_SENT,
  DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
  DomainEvent.RECORDS_EXPORTED,
] as const;

const systemEvents = new Set<string>(SYSTEM_ACTIVITY_AUDIT_EVENTS);

export function isSystemActivityAuditEvent(event: string): event is (typeof SYSTEM_ACTIVITY_AUDIT_EVENTS)[number] {
  return systemEvents.has(event);
}

export function systemActivityChanges(event: string, eventData: unknown, isAdmin: boolean) {
  if (!isSystemActivityAuditEvent(event) || (event === DomainEvent.RECORDS_EXPORTED && !isAdmin)) return [];
  try {
    return extractAuditChanges(eventData);
  } catch {
    return [];
  }
}
