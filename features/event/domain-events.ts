import type { AccountRemovalReason } from "@/ee/messaging/connect/account-removal-reason";
import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { LegalAcceptanceAuditPayload, LegalNoticeAuditPayload } from "@/features/legal/legal-audit.schema";
import type { RoleDto } from "@/features/role/role.schema";
import type { WebhookEventPayload } from "@/features/webhook/webhook-event-payload";
import type { WikiPageDto } from "@/features/wiki/wiki.schema";

import type { CountryCode, MessagingProvider, Status } from "@/generated/prisma";

export enum DomainEvent {
  USER_REGISTERED = "user.registered",
  USER_UPDATED = "user.updated",
  ROLE_CREATED = "role.created",
  ROLE_UPDATED = "role.updated",
  ROLE_DELETED = "role.deleted",
  WEBHOOK_CREATED = "webhook.created",
  WEBHOOK_UPDATED = "webhook.updated",
  WEBHOOK_DELETED = "webhook.deleted",
  WIKI_PAGE_CREATED = "wiki_page.created",
  WIKI_PAGE_UPDATED = "wiki_page.updated",
  WIKI_PAGE_DELETED = "wiki_page.deleted",
  ROUTINE_CREATED = "routine.created",
  ROUTINE_UPDATED = "routine.updated",
  ROUTINE_DELETED = "routine.deleted",
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
  RECORDS_EXPORTED = "records.exported",
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
    payload: WebhookEventPayload;
  };
  [DomainEvent.WEBHOOK_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      webhook: WebhookEventPayload;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.WEBHOOK_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: WebhookEventPayload;
  };
  [DomainEvent.WIKI_PAGE_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: WikiPageDto;
  };
  [DomainEvent.WIKI_PAGE_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      wikiPage: WikiPageDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.WIKI_PAGE_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: WikiPageDto;
  };
  [DomainEvent.ROUTINE_CREATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: RoutineDto;
  };
  [DomainEvent.ROUTINE_UPDATED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      routine: RoutineDto;
      changes: Record<string, { previous: unknown; current: unknown }>;
    };
  };
  [DomainEvent.ROUTINE_DELETED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: RoutineDto;
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
    payload: ConnectedAccountAuditPayload & {
      removalReason?: AccountRemovalReason;
    };
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
      threadId: string;
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
      threadId: string;
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
  [DomainEvent.RECORDS_EXPORTED]: {
    userId: string;
    companyId: string;
    entityId: string;
    payload: {
      typeId: string;
      rowCount: number;
      truncated: boolean;
      scope: "selection" | "view";
    };
  };
};
