import type { ContactDto } from "@/features/contacts/contact.schema";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { DealDto } from "@/features/deals/deal.schema";
import type { ServiceDto } from "@/features/services/service.schema";
import type { TaskDto } from "@/features/tasks/task.schema";
import type { RoleDto } from "@/features/role/role.schema";
import type { WebhookDto } from "@/features/webhook/webhook.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { LegalAcceptanceAuditPayload, LegalNoticeAuditPayload } from "@/features/legal/legal-audit.schema";

import type { CountryCode, Status, Currency, EntityType, MessagingProvider } from "@/generated/prisma";

export enum DomainEvent {
  USER_REGISTERED = "user.registered",
  USER_UPDATED = "user.updated",
  COMPANY_UPDATED = "company.updated",
  CONTACT_CREATED = "contact.created",
  CONTACT_UPDATED = "contact.updated",
  CONTACT_DELETED = "contact.deleted",
  ORGANIZATION_CREATED = "organization.created",
  ORGANIZATION_UPDATED = "organization.updated",
  ORGANIZATION_DELETED = "organization.deleted",
  DEAL_CREATED = "deal.created",
  DEAL_UPDATED = "deal.updated",
  DEAL_DELETED = "deal.deleted",
  SERVICE_CREATED = "service.created",
  SERVICE_UPDATED = "service.updated",
  SERVICE_DELETED = "service.deleted",
  TASK_CREATED = "task.created",
  TASK_UPDATED = "task.updated",
  TASK_DELETED = "task.deleted",
  ROLE_CREATED = "role.created",
  ROLE_UPDATED = "role.updated",
  ROLE_DELETED = "role.deleted",
  WEBHOOK_CREATED = "webhook.created",
  WEBHOOK_UPDATED = "webhook.updated",
  WEBHOOK_DELETED = "webhook.deleted",
  CUSTOM_COLUMN_CREATED = "custom_column.created",
  CUSTOM_COLUMN_UPDATED = "custom_column.updated",
  CUSTOM_COLUMN_DELETED = "custom_column.deleted",
  CONNECTED_ACCOUNT_CREATED = "connected_account.created",
  CONNECTED_ACCOUNT_DELETED = "connected_account.deleted",
  CONNECTED_ACCOUNT_UPDATED = "connected_account.updated",
  CONNECTED_ACCOUNT_RECONNECTED = "connected_account.reconnected",
  CONNECTED_ACCOUNT_RESYNCED = "connected_account.resynced",
  MESSAGING_MESSAGE_RECEIVED = "messaging.message.received",
  MESSAGING_MESSAGE_UPDATED = "messaging.message.updated",
  MESSAGING_MESSAGE_DELETED = "messaging.message.deleted",
  MESSAGING_MESSAGE_REACTION = "messaging.message.reaction",
  MESSAGING_EMAIL_RECEIVED = "messaging.email.received",
  MESSAGING_EMAIL_DELETED = "messaging.email.deleted",
  MESSAGING_CHAT_UPDATED = "messaging.chat.updated",
  MESSAGING_CHAT_DELETED = "messaging.chat.deleted",
  MESSAGING_CALENDAR_CHANGED = "messaging.calendar.changed",
  MESSAGING_CALENDAR_EVENT_CHANGED = "messaging.calendar_event.changed",
  MESSAGING_RELATION_CREATED = "messaging.relation.created",
  LEGAL_NOTICE_SENT = "legal.notice_sent",
  LEGAL_DOCUMENTS_ACCEPTED = "legal.documents_accepted",
}

type ConnectedAccountAuditPayload = {
  provider: MessagingProvider;
  displayName: string | null;
  emailAddress: string | null;
};

export type DomainEventMap = {
  [DomainEvent.USER_REGISTERED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      email: string;
      firstName: string;
      lastName: string;
      country: CountryCode;
      status: Status;
      avatarUrl: string | null;
      roleId: string | null;
      isNewCompany: boolean;
    };
  };
  [DomainEvent.USER_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      firstName: string;
      lastName: string;
      country: CountryCode;
      status?: Status;
      avatarUrl: string | null;
      roleId?: string;
    };
  };
  [DomainEvent.COMPANY_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      currency?: Currency;
      terminology?: { entityType: EntityType; presetKey: string }[];
    };
  };
  [DomainEvent.CONTACT_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ContactDto;
  };
  [DomainEvent.CONTACT_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      contact: ContactDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.CONTACT_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ContactDto;
  };
  [DomainEvent.ORGANIZATION_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: OrganizationDto;
  };
  [DomainEvent.ORGANIZATION_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      organization: OrganizationDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.ORGANIZATION_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: OrganizationDto;
  };
  [DomainEvent.DEAL_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: DealDto;
  };
  [DomainEvent.DEAL_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      deal: DealDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.DEAL_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: DealDto;
  };
  [DomainEvent.SERVICE_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ServiceDto;
  };
  [DomainEvent.SERVICE_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      service: ServiceDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.SERVICE_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ServiceDto;
  };
  [DomainEvent.TASK_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: TaskDto;
  };
  [DomainEvent.TASK_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      task: TaskDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.TASK_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: TaskDto;
  };
  [DomainEvent.ROLE_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: RoleDto;
  };
  [DomainEvent.ROLE_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      role: RoleDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.ROLE_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: RoleDto;
  };
  [DomainEvent.WEBHOOK_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: WebhookDto;
  };
  [DomainEvent.WEBHOOK_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      webhook: WebhookDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.WEBHOOK_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: WebhookDto;
  };
  [DomainEvent.CUSTOM_COLUMN_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: CustomColumnDto;
  };
  [DomainEvent.CUSTOM_COLUMN_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      customColumn: CustomColumnDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.CUSTOM_COLUMN_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: CustomColumnDto;
  };
  [DomainEvent.CONNECTED_ACCOUNT_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ConnectedAccountAuditPayload;
  };
  [DomainEvent.CONNECTED_ACCOUNT_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ConnectedAccountAuditPayload;
  };
  [DomainEvent.CONNECTED_ACCOUNT_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccount: ConnectedAccountAuditPayload;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.CONNECTED_ACCOUNT_RECONNECTED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ConnectedAccountAuditPayload;
  };
  [DomainEvent.CONNECTED_ACCOUNT_RESYNCED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: ConnectedAccountAuditPayload;
  };
  [DomainEvent.MESSAGING_MESSAGE_RECEIVED]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      provider: MessagingProvider;
      providerMessageId: string;
      threadId: string;
    };
  };
  [DomainEvent.MESSAGING_MESSAGE_UPDATED]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      provider: MessagingProvider;
      providerMessageId: string;
      threadId: string;
    };
  };
  [DomainEvent.MESSAGING_MESSAGE_DELETED]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      provider: MessagingProvider;
      providerMessageId: string;
      threadId: string;
    };
  };
  [DomainEvent.MESSAGING_MESSAGE_REACTION]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      provider: MessagingProvider;
      providerMessageId: string;
      threadId: string;
    };
  };
  [DomainEvent.MESSAGING_EMAIL_RECEIVED]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      provider: MessagingProvider;
      providerMessageId: string;
      threadId: string;
    };
  };
  [DomainEvent.MESSAGING_EMAIL_DELETED]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      provider: MessagingProvider;
      providerMessageId: string;
      threadId: string;
    };
  };
  [DomainEvent.MESSAGING_CHAT_UPDATED]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      provider: MessagingProvider;
      providerThreadId: string;
    };
  };
  [DomainEvent.MESSAGING_CHAT_DELETED]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      provider: MessagingProvider;
      providerThreadId: string;
    };
  };
  [DomainEvent.MESSAGING_CALENDAR_CHANGED]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      providerCalendarId: string;
    };
  };
  [DomainEvent.MESSAGING_CALENDAR_EVENT_CHANGED]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      providerCalendarId: string;
      providerEventId: string;
    };
  };
  [DomainEvent.MESSAGING_RELATION_CREATED]: {
    userId: null;
    companyId: string;
    entityId: string;
    payload: {
      connectedAccountId: string;
      provider: MessagingProvider;
      providerUserId: string;
    };
  };
  [DomainEvent.LEGAL_NOTICE_SENT]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: LegalNoticeAuditPayload;
  };
  [DomainEvent.LEGAL_DOCUMENTS_ACCEPTED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: LegalAcceptanceAuditPayload;
  };
};

export const AUDIT_LOG_EXCLUDED_EVENTS: ReadonlySet<DomainEvent> = new Set([
  DomainEvent.MESSAGING_MESSAGE_RECEIVED,
  DomainEvent.MESSAGING_MESSAGE_UPDATED,
  DomainEvent.MESSAGING_MESSAGE_DELETED,
  DomainEvent.MESSAGING_MESSAGE_REACTION,
  DomainEvent.MESSAGING_EMAIL_RECEIVED,
  DomainEvent.MESSAGING_EMAIL_DELETED,
  DomainEvent.MESSAGING_CHAT_UPDATED,
  DomainEvent.MESSAGING_CHAT_DELETED,
  DomainEvent.MESSAGING_CALENDAR_CHANGED,
  DomainEvent.MESSAGING_CALENDAR_EVENT_CHANGED,
  DomainEvent.MESSAGING_RELATION_CREATED,
]);
