import type { Filter } from "@/core/base/base-get.schema";

import type { Action, Resource } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";

import type { RecordQuery } from "@/features/records/record-query.schema";

export type RoutineEventAccessArgs = {
  event: string;
  entityId: string | null;
  triggerPayload: unknown;
  recordQuery?: RecordQuery;
  subscriptionId?: string;
};

export type RoutineEventUser = {
  id: string;
  companyId: string;
  role: {
    isSystemRole: boolean;
    permissions: { resource: Resource; action: Action }[];
  } | null;
};

export const MESSAGE_EVENTS = new Set<string>([
  DomainEvent.MESSAGING_MESSAGE_RECEIVED,
  DomainEvent.MESSAGING_MESSAGE_UPDATED,
  DomainEvent.MESSAGING_MESSAGE_DELETED,
  DomainEvent.MESSAGING_MESSAGE_REACTION,
  DomainEvent.MESSAGING_EMAIL_RECEIVED,
  DomainEvent.MESSAGING_EMAIL_DELETED,
]);
export const CHAT_EVENTS = new Set<string>([DomainEvent.MESSAGING_CHAT_UPDATED, DomainEvent.MESSAGING_CHAT_DELETED]);

export type CurrentRoutineTrigger = { payload: unknown };

export abstract class RoutineEventAccess {
  abstract matchesCurrentUser(args: RoutineEventAccessArgs & { filters: Filter[] }): Promise<boolean>;
  abstract currentUserTrigger(
    args: RoutineEventAccessArgs & { filters: Filter[] },
  ): Promise<CurrentRoutineTrigger | null>;
  abstract matchesUserUnscoped(
    args: RoutineEventAccessArgs & {
      companyId: string;
      userId: string;
      filters: Filter[];
    },
  ): Promise<boolean>;
  abstract canUserAccessUnscoped(
    args: RoutineEventAccessArgs & { companyId: string; userId: string },
  ): Promise<boolean>;
}
