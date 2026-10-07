import type { MessagingProvider } from "@/generated/prisma";
import type { DomainEventMap } from "./domain-events";

import { DomainEvent } from "./domain-events";

function connectedAccountName(
  account: {
    displayName: string | null;
    emailAddress: string | null;
    provider: MessagingProvider;
  },
  translate?: (key: string) => string,
): string {
  return (
    account.displayName ||
    account.emailAddress ||
    translate?.(`Common.providers.${account.provider}`) ||
    account.provider
  );
}

const entityNameExtractors: {
  [K in DomainEvent]: (eventData: DomainEventMap[K], translate?: (key: string) => string) => string;
} = {
  [DomainEvent.USER_UPDATED]: (eventData) => `${eventData.payload.firstName} ${eventData.payload.lastName}`.trim(),
  [DomainEvent.USER_REGISTERED]: (eventData) => `${eventData.payload.firstName} ${eventData.payload.lastName}`.trim(),
  [DomainEvent.ROLE_CREATED]: (eventData) => eventData.payload.name,
  [DomainEvent.ROLE_UPDATED]: (eventData) => eventData.payload.role.name,
  [DomainEvent.ROLE_DELETED]: (eventData) => eventData.payload.name,
  [DomainEvent.WEBHOOK_CREATED]: (eventData) => eventData.payload.url,
  [DomainEvent.WEBHOOK_UPDATED]: (eventData) => eventData.payload.webhook.url,
  [DomainEvent.WEBHOOK_DELETED]: (eventData) => eventData.payload.url,
  [DomainEvent.WIKI_PAGE_CREATED]: (eventData) => eventData.payload.title,
  [DomainEvent.WIKI_PAGE_UPDATED]: (eventData) => eventData.payload.wikiPage.title,
  [DomainEvent.WIKI_PAGE_DELETED]: (eventData) => eventData.payload.title,
  [DomainEvent.ROUTINE_CREATED]: (eventData) => eventData.payload.name,
  [DomainEvent.ROUTINE_UPDATED]: (eventData) => eventData.payload.routine.name,
  [DomainEvent.ROUTINE_DELETED]: (eventData) => eventData.payload.name,
  [DomainEvent.CONNECTED_ACCOUNT_CREATED]: (eventData, translate) => connectedAccountName(eventData.payload, translate),
  [DomainEvent.CONNECTED_ACCOUNT_DELETED]: (eventData, translate) => connectedAccountName(eventData.payload, translate),
  [DomainEvent.CONNECTED_ACCOUNT_UPDATED]: (eventData, translate) =>
    connectedAccountName(eventData.payload.connectedAccount, translate),
  [DomainEvent.CONNECTED_ACCOUNT_RECONNECTED]: (eventData, translate) =>
    connectedAccountName(eventData.payload, translate),
  [DomainEvent.CONNECTED_ACCOUNT_RESYNCED]: (eventData, translate) =>
    connectedAccountName(eventData.payload, translate),
  [DomainEvent.MESSAGING_MESSAGE_RECEIVED]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.MESSAGING_MESSAGE_UPDATED]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.MESSAGING_MESSAGE_DELETED]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.MESSAGING_MESSAGE_REACTION]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.MESSAGING_EMAIL_RECEIVED]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.MESSAGING_EMAIL_DELETED]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.MESSAGING_CHAT_UPDATED]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.MESSAGING_CHAT_DELETED]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.MESSAGING_CALENDAR_CHANGED]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.MESSAGING_CALENDAR_EVENT_CHANGED]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.MESSAGING_RELATION_CREATED]: (eventData) => eventData.payload.connectedAccountId,
  [DomainEvent.LEGAL_NOTICE_SENT]: (eventData) => eventData.entityId,
  [DomainEvent.LEGAL_DOCUMENTS_ACCEPTED]: (eventData) => eventData.entityId,
  [DomainEvent.RECORDS_EXPORTED]: (eventData) => eventData.payload.typeId,
};

export function getEntityName<E extends DomainEvent>(
  event: E,
  eventData: DomainEventMap[E] | null | undefined,
  translate?: (key: string) => string,
): string {
  if (!eventData) return "";

  try {
    const extractor = entityNameExtractors[event];
    return extractor ? extractor(eventData, translate) : "";
  } catch {
    return "";
  }
}
