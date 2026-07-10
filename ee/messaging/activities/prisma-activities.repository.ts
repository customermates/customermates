import type { GetQueryParams, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { MessagingMessage } from "../messaging.schema";
import type { CalendarAttendee } from "@/ee/calendar/calendar.schema";
import type { ActivityEntryDto, ActivityKind } from "./activities.schema";

import { type Prisma, type EntityType, Action, MessagingProvider, Resource } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getContactRepo, getCustomColumnRepo } from "@/core/di";
import { extractAuditChanges } from "@/ee/audit-log/audit-log-changes";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { contactFullName, formatChannelIdentifier, threadCounterpart } from "../thread-display";
import { EMAIL_PROVIDERS } from "../provider";
import { threadAccessWhere, calendarEventAccessWhere, accountActivityAccessWhere } from "../messaging-access";

import type { GetActivitiesRepo } from "./get-activities.interactor";
import type { ActivityThreadOptionsData, ActivityThreadOptionsRepo } from "./get-activity-thread-options.interactor";

import { interpretFilters } from "./timeline-filters";

export abstract class ActivityContactRepo {
  abstract resolveContactIdsForEntityCompanyWide(args: { entityType: EntityType; entityId: string }): Promise<string[]>;
  abstract findContactEmailsCompanyWide(contactIds: string[]): Promise<string[]>;
}

type ThreadLabelInput = {
  type: "single" | "group" | "channel";
  provider: MessagingProvider;
  name: string | null;
  subject: string | null;
  participants: Array<{
    isSelf: boolean;
    displayName: string | null;
    identifier: string | null;
    contact?: { firstName: string; lastName: string } | null;
  }>;
};

export class PrismaActivitiesRepo extends BaseRepository implements GetActivitiesRepo, ActivityThreadOptionsRepo {
  private scope: { entityType?: EntityType; entityId?: string } = {};

  setScope(entityType?: EntityType, entityId?: string) {
    this.scope = { entityType, entityId };
  }

  getSortableFields() {
    return [{ field: "at", resolvedFields: ["at"] }];
  }

  getFilterableFields() {
    const canReadMessages =
      this.hasPermission(Resource.inboxMessages, Action.readAll) ||
      this.hasPermission(Resource.inboxMessages, Action.readOwn);
    const fields: FilterableField[] = [
      { field: FilterFieldKey.timelineKind, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.timelineKind] },
      {
        field: FilterFieldKey.timelineThreadId,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.timelineThreadId],
      },
      { field: FilterFieldKey.provider, operators: [FilterOperatorKey.in] },
    ];

    if (canReadMessages) return Promise.resolve(fields);
    if (this.hasPermission(Resource.auditLog, Action.readAll))
      return Promise.resolve(fields.filter((field) => field.field === FilterFieldKey.timelineKind.toString()));

    return Promise.resolve([]);
  }

  getCustomColumns() {
    return this.scope.entityType
      ? getCustomColumnRepo().findByEntityType(this.scope.entityType)
      : Promise.resolve<CustomColumnDto[]>([]);
  }

  async listThreadOptions(args: ActivityThreadOptionsData) {
    if (!args.entityType || !args.entityId) return this.listThreads();

    const contactIds = await getContactRepo().resolveContactIdsForEntityCompanyWide({
      entityType: args.entityType,
      entityId: args.entityId,
    });
    if (!contactIds.length) return [];

    return this.listThreads(contactIds);
  }

  async getItems(params: GetQueryParams) {
    const { query, contactIds, emails, entityIds, fetchAudit, fetchMessages, fetchActivities, fetchCalendar } =
      await this.plan(params);

    const pageSize = params.pagination?.pageSize ?? params.take ?? 100;
    const page = params.pagination?.page ?? 1;
    const skip = params.skip ?? (page - 1) * pageSize;
    const fetchN = skip + pageSize;
    const direction = params.sortDescriptor?.direction === "asc" ? ("asc" as const) : ("desc" as const);

    const providers = query.providers && [...query.providers];
    const threadIds = query.threadIdsIn && [...query.threadIdsIn];
    const threadIdsNotIn = query.threadIdsNotIn && [...query.threadIdsNotIn];

    const [auditLogs, messages, activities, calendarEvents] = await Promise.all([
      fetchAudit ? this.listAuditLogs(entityIds, fetchN, direction) : [],
      fetchMessages
        ? this.listMessages({ contactIds, limit: fetchN, providers, threadIds, threadIdsNotIn, direction })
        : [],
      fetchActivities ? this.listAccountActivities(contactIds, fetchN, direction) : [],
      fetchCalendar ? this.listCalendarEvents(emails, fetchN, direction) : [],
    ]);

    const myAccountIds = await this.listMySendingAccountIds(
      messages
        .filter(({ message }) => message.direction === "outbound")
        .map(({ message }) => message.connectedAccountId),
    );

    const merged: ActivityEntryDto[] = [
      ...auditLogs.map((log) => ({
        kind: "audit" as const,
        id: log.id,
        at: log.createdAt,
        actor: log.user,
        event: log.event,
        changes: extractAuditChanges(log.event, log.eventData),
      })),
      ...messages.map(({ message, thread }) => ({
        kind: "message" as const,
        id: message.id,
        at: message.sentAt,
        message,
        thread,
        senderIsMine: message.direction === "outbound" && myAccountIds.has(message.connectedAccountId),
      })),
      ...activities.map((activity) => ({
        kind: "activity" as const,
        id: activity.id,
        at: activity.occurredAt,
        payload: activity.payload,
      })),
      ...calendarEvents.map((event) => ({
        kind: "calendar_event" as const,
        id: event.id,
        at: event.startsAt,
        event,
      })),
    ];

    const seen = new Set<string>();

    return merged
      .filter((entry) => {
        const key = `${entry.kind}:${entry.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const byAt = a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        return direction === "asc" ? byAt : -byAt;
      })
      .slice(skip, skip + pageSize);
  }

  private async listMySendingAccountIds(accountIds: string[]): Promise<Set<string>> {
    if (accountIds.length === 0) return new Set();

    const rows = await this.prisma.connectedAccount.findMany({
      where: { id: { in: [...new Set(accountIds)] }, companyId: this.companyId, userId: this.userId },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }

  async getCount(params: GetQueryParams) {
    const { query, contactIds, emails, entityIds, fetchAudit, fetchMessages, fetchActivities, fetchCalendar } =
      await this.plan(params);

    const providers = query.providers && [...query.providers];
    const threadIds = query.threadIdsIn && [...query.threadIdsIn];
    const threadIdsNotIn = query.threadIdsNotIn && [...query.threadIdsNotIn];

    const [audit, messages, activities, calendar] = await Promise.all([
      fetchAudit ? this.countAuditLogs(entityIds) : 0,
      fetchMessages ? this.countMessages({ contactIds, providers, threadIds, threadIdsNotIn }) : 0,
      fetchActivities ? this.countAccountActivities(contactIds) : 0,
      fetchCalendar ? this.countCalendarEvents(emails) : 0,
    ]);

    return audit + messages + activities + calendar;
  }

  private async resolveScope() {
    const { entityType, entityId } = this.scope;
    if (!entityType || !entityId) return { contactIds: undefined, emails: undefined, entityIds: undefined };

    const contactIds = await getContactRepo().resolveContactIdsForEntityCompanyWide({ entityType, entityId });
    const emails = contactIds.length ? await getContactRepo().findContactEmailsCompanyWide(contactIds) : [];

    return { contactIds, emails, entityIds: [entityId] };
  }

  private async plan(params: GetQueryParams) {
    const canReadMessages =
      this.hasPermission(Resource.inboxMessages, Action.readAll) ||
      this.hasPermission(Resource.inboxMessages, Action.readOwn);
    const canReadAudit = this.hasPermission(Resource.auditLog, Action.readAll);
    const query = interpretFilters(params.filters);
    const { contactIds, emails, entityIds } = await this.resolveScope();
    const companyWide = !this.scope.entityId;
    const wantContactSources = canReadMessages && (companyWide || (contactIds?.length ?? 0) > 0);
    const kindAllowed = (kind: ActivityKind) =>
      (!query.kindsIn || query.kindsIn.has(kind)) && (!query.kindsNotIn || !query.kindsNotIn.has(kind));

    return {
      query,
      contactIds,
      emails,
      entityIds,
      fetchAudit: canReadAudit && kindAllowed("audit"),
      fetchMessages: wantContactSources && kindAllowed("message"),
      fetchActivities: wantContactSources && kindAllowed("activity"),
      fetchCalendar: wantContactSources && kindAllowed("calendar_event"),
    };
  }

  private listAuditLogs(entityIds: string[] | undefined, limit: number, direction: "asc" | "desc") {
    return this.prisma.auditLog.findMany({
      where: { companyId: this.companyId, ...(entityIds?.length ? { entityId: { in: entityIds } } : {}) },
      orderBy: [{ createdAt: direction }, { id: direction }],
      take: limit,
      select: {
        id: true,
        event: true,
        eventData: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } },
      },
    });
  }

  private countAuditLogs(entityIds: string[] | undefined) {
    return this.prisma.auditLog.count({
      where: { companyId: this.companyId, ...(entityIds?.length ? { entityId: { in: entityIds } } : {}) },
    });
  }

  private async listMessages(args: {
    contactIds?: string[];
    limit: number;
    providers?: string[];
    threadIds?: string[];
    threadIdsNotIn?: string[];
    direction: "asc" | "desc";
  }) {
    const { contactIds, providers, threadIds, threadIdsNotIn, direction } = args;
    const scoped: Prisma.MessagingMessageWhereInput = {};

    if (contactIds?.length) {
      const identifierGroups = await getContactRepo().classGroupedIdentifierWhereCompanyWide(contactIds);
      if (identifierGroups.length === 0) return [];
      scoped.OR = [
        {
          thread: {
            participants: {
              some: { OR: identifierGroups.map((group) => ({ ...group.providerWhere, identifier: group.identifier })) },
            },
          },
        },
        ...identifierGroups.map((group) => ({ ...group.providerWhere, senderIdentifier: group.identifier })),
      ];
    }

    const rows = await this.prisma.messagingMessage.findMany({
      where: {
        ...scoped,
        companyId: this.companyId,
        thread: threadAccessWhere(this.companyId, this.userId),
        ...(providers?.length ? { provider: { in: providers as MessagingProvider[] } } : {}),
        ...(threadIds?.length || threadIdsNotIn?.length
          ? {
              messagingThreadId: {
                ...(threadIds?.length ? { in: threadIds } : {}),
                ...(threadIdsNotIn?.length ? { notIn: threadIdsNotIn } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ sentAt: direction }, { id: direction }],
      take: args.limit,
      include: {
        thread: {
          select: {
            id: true,
            type: true,
            provider: true,
            name: true,
            subject: true,
            participants: { select: this.participantSelect },
          },
        },
      },
    });

    return this.redactBcc(rows).map((row) => {
      const { thread, ...message } = row;
      return {
        message: message as unknown as MessagingMessage,
        thread: { id: thread.id, type: thread.type, label: this.threadLabel(thread) },
      };
    });
  }

  private async countMessages(args: {
    contactIds?: string[];
    providers?: string[];
    threadIds?: string[];
    threadIdsNotIn?: string[];
  }) {
    const { contactIds, providers, threadIds, threadIdsNotIn } = args;
    const scoped: Prisma.MessagingMessageWhereInput = {};

    if (contactIds?.length) {
      const identifierGroups = await getContactRepo().classGroupedIdentifierWhereCompanyWide(contactIds);
      if (identifierGroups.length === 0) return 0;
      scoped.OR = [
        {
          thread: {
            participants: {
              some: { OR: identifierGroups.map((group) => ({ ...group.providerWhere, identifier: group.identifier })) },
            },
          },
        },
        ...identifierGroups.map((group) => ({ ...group.providerWhere, senderIdentifier: group.identifier })),
      ];
    }

    return this.prisma.messagingMessage.count({
      where: {
        ...scoped,
        companyId: this.companyId,
        thread: threadAccessWhere(this.companyId, this.userId),
        ...(providers?.length ? { provider: { in: providers as MessagingProvider[] } } : {}),
        ...(threadIds?.length || threadIdsNotIn?.length
          ? {
              messagingThreadId: {
                ...(threadIds?.length ? { in: threadIds } : {}),
                ...(threadIdsNotIn?.length ? { notIn: threadIdsNotIn } : {}),
              },
            }
          : {}),
      },
    });
  }

  private async listAccountActivities(contactIds: string[] | undefined, limit: number, direction: "asc" | "desc") {
    if (!this.canAccess(Resource.inboxMessages)) return [];

    const scoped: Prisma.AccountActivityWhereInput = {};
    if (contactIds?.length) {
      const identifiers = await getContactRepo().findContactIdentifierValuesCompanyWide(contactIds);
      const values = identifiers.filter((i) => i.provider === MessagingProvider.linkedin).map((i) => i.value);
      if (values.length === 0) return [];
      scoped.identifier = { in: values };
    }

    const rows = await this.prisma.accountActivity.findMany({
      where: { ...scoped, ...accountActivityAccessWhere(this.companyId, this.userId) },
      orderBy: [{ occurredAt: direction }, { id: direction }],
      take: limit,
      select: { id: true, payload: true, occurredAt: true },
    });

    return rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      payload: (row.payload as unknown as Record<string, unknown> | null) ?? {},
    }));
  }

  private async countAccountActivities(contactIds: string[] | undefined) {
    if (!this.canAccess(Resource.inboxMessages)) return 0;

    const scoped: Prisma.AccountActivityWhereInput = {};
    if (contactIds?.length) {
      const identifiers = await getContactRepo().findContactIdentifierValuesCompanyWide(contactIds);
      const values = identifiers.filter((i) => i.provider === MessagingProvider.linkedin).map((i) => i.value);
      if (values.length === 0) return 0;
      scoped.identifier = { in: values };
    }

    return this.prisma.accountActivity.count({
      where: { ...scoped, ...accountActivityAccessWhere(this.companyId, this.userId) },
    });
  }

  private async listCalendarEvents(emails: string[] | undefined, limit: number, direction: "asc" | "desc") {
    if (emails && emails.length === 0) return [];

    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        ...calendarEventAccessWhere(this.companyId, this.userId),
        ...(emails?.length ? { attendeeEmails: { hasSome: emails } } : {}),
      },
      include: { connectedAccount: { select: { provider: true } } },
      orderBy: [{ startsAt: direction }, { id: direction }],
      take: limit,
    });

    return rows.map(({ connectedAccount, ...row }) => ({
      ...row,
      provider: connectedAccount.provider,
      attendees: (row.attendees as unknown as CalendarAttendee[] | null) ?? [],
      organizer: (row.organizer as unknown as CalendarAttendee | null) ?? null,
    }));
  }

  private countCalendarEvents(emails: string[] | undefined) {
    if (emails && emails.length === 0) return Promise.resolve(0);

    return this.prisma.calendarEvent.count({
      where: {
        ...calendarEventAccessWhere(this.companyId, this.userId),
        ...(emails?.length ? { attendeeEmails: { hasSome: emails } } : {}),
      },
    });
  }

  private async listThreads(contactIds?: string[]) {
    const scoped: Prisma.MessagingThreadWhereInput = {};

    if (contactIds?.length) {
      const identifierGroups = await getContactRepo().classGroupedIdentifierWhereCompanyWide(contactIds);
      if (identifierGroups.length === 0) return [];
      scoped.participants = {
        some: { OR: identifierGroups.map((group) => ({ ...group.providerWhere, identifier: group.identifier })) },
      };
    }

    const rows = await this.prisma.messagingThread.findMany({
      where: { ...scoped, companyId: this.companyId, ...threadAccessWhere(this.companyId, this.userId) },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        provider: true,
        name: true,
        subject: true,
        participants: { select: this.participantSelect },
      },
    });

    return rows.map((thread) => ({
      id: thread.id,
      label: this.threadOptionLabel(thread),
      provider: thread.provider,
    }));
  }

  private redactBcc<T extends { recipients: unknown }>(rows: T[]): T[] {
    return rows.map((row) => {
      const recipients = row.recipients;
      if (recipients && typeof recipients === "object" && "bcc" in recipients)
        return { ...row, recipients: { ...recipients, bcc: [] } };

      return row;
    });
  }

  private get participantSelect() {
    return {
      providerUserId: true,
      identifier: true,
      displayName: true,
      pictureUrl: true,
      profileUrl: true,
      headline: true,
      occupation: true,
      isSelf: true,
    } as const;
  }

  private threadOptionLabel(thread: ThreadLabelInput): string {
    const base = this.threadLabel(thread);

    if (thread.type !== "single") return base;

    const subject = thread.subject?.trim();
    if (EMAIL_PROVIDERS.includes(thread.provider) && subject && subject !== base)
      return base ? `${base} · ${subject}` : subject;

    return base;
  }

  private threadLabel(thread: ThreadLabelInput): string {
    const counterpart = threadCounterpart(thread.participants);
    const counterpartName =
      contactFullName(counterpart?.contact) ||
      counterpart?.displayName?.trim() ||
      formatChannelIdentifier(thread.provider, counterpart?.identifier) ||
      "";

    if (thread.type === "group" || thread.type === "channel") return thread.name?.trim() || counterpartName;

    return counterpartName || thread.subject?.trim() || "";
  }
}
