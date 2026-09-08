import { DomainEvent } from "@/features/event/domain-events";

export const WIKI_PAGE_AUDIT_EVENTS = [
  DomainEvent.WIKI_PAGE_CREATED,
  DomainEvent.WIKI_PAGE_UPDATED,
  DomainEvent.WIKI_PAGE_DELETED,
] as const;
