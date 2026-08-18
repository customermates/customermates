import type { Filter, FilterableField, GetQueryParams } from "@/core/base/base-get.schema";
import type { MessagingMessage } from "../messaging.schema";
import type { CalendarAttendee } from "@/ee/calendar/calendar.schema";
import type { ActivityEntryDto, ActivityKind } from "./activities.schema";

import { type Prisma, EntityType, Action, MessagingProvider, Resource } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getContactRepo, getCustomColumnRepo } from "@/core/di";
import { extractAuditChanges } from "@/features/audit-log/audit-log-changes";
import { contactFullName, formatChannelIdentifier, threadCounterpart } from "../thread-display";
import { channelClass, classWhere, EMAIL_PROVIDERS } from "../provider";
import { identifierKey } from "@/features/contacts/upsert/validate-identifiers";
import {
  accountActivityAccessWhere,
  calendarEventAccessWhere,
  folderMessageWhere,
  threadAccessWhere,
  threadFolderMembershipWhere,
  threadHasActivityWhere,
} from "../messaging-access";

import type { GetActivitiesRepo } from "./get-activities.interactor";
import type { ActivityThreadOptionsData, ActivityThreadOptionsRepo } from "./get-activity-thread-options.interactor";

import type { ActivityQuery, ActivityRelationshipRule } from "./timeline-filters";
import { channelWhere, interpretFilters, providerRelationWhere, providerWhere, threadWhere } from "./timeline-filters";
import type { ActivityRecordOptionsData, ActivityRecordOptionsRepo } from "./get-activity-record-options.interactor";
import type { GetWidgetActivityFilterableFieldsRepo } from "@/features/widget/get-widget-filterable-fields.interactor";

import type { ActivityRecordRefKey } from "./activity-record-refs";
import { buildRecordContext, EMPTY_RECORD_CONTEXT, recordRefKey } from "./activity-record-refs";
import { auditEntityTypeFor, auditEventsForEntityTypes } from "@/features/event/audit-entity-type";
import type { ActivityScope } from "./activity-scope.schema";
import { ACTIVITY_SCOPE_CONTACT_MAX } from "./activity-scope.schema";
import {
  activityFilterableFieldsForViewer,
  activityFilterableFieldsRetainedForFailClosedCompilation,
} from "./activity-filterable-fields";
import { TERMINOLOGY_ENTITY_RESOURCE } from "@/features/entity-terminology/entity-terminology.constants";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

type UnresolvedRecordRef = { entityType: EntityType; id: string };

type ResolvedRecord = { label: string; avatarUrl: string | null };

type ResolvedActivityScope = {
  contactIds: string[] | undefined;
  auditWhere: Prisma.AuditLogWhereInput | undefined;
  scopeTruncated: boolean;
};

type ContactSourceTargets = {
  message: Prisma.MessagingMessageWhereInput;
  messageNegative: Prisma.MessagingMessageWhereInput;
  account: Prisma.AccountActivityWhereInput;
  accountNegative: Prisma.AccountActivityWhereInput;
  calendar: Prisma.CalendarEventWhereInput;
  calendarNegative: Prisma.CalendarEventWhereInput;
  thread: Prisma.MessagingThreadWhereInput;
  threadNegative: Prisma.MessagingThreadWhereInput;
};

type ContactIdentifierTarget = {
  contactId: string;
  provider: MessagingProvider;
  value: string;
  messagingId: string | null;
};

type CompiledRelationshipWhere = {
  audit: Prisma.AuditLogWhereInput[];
  message: Prisma.MessagingMessageWhereInput[];
  account: Prisma.AccountActivityWhereInput[];
  calendar: Prisma.CalendarEventWhereInput[];
  thread: Prisma.MessagingThreadWhereInput[];
  contactSourcesAllowed: boolean;
  truncated: boolean;
  scopeTargets?: ContactSourceTargets;
};

type ActivitySourceWhere = {
  audit: Prisma.AuditLogWhereInput | undefined;
  message: Prisma.MessagingMessageWhereInput[];
  account: Prisma.AccountActivityWhereInput[];
  calendar: Prisma.CalendarEventWhereInput[];
};

type CompiledActivityPlan = {
  query: ActivityQuery;
  sourceWhere: ActivitySourceWhere;
  fetchAudit: boolean;
  fetchMessages: boolean;
  fetchActivities: boolean;
  fetchCalendar: boolean;
};

const EMPTY_AUDIT_WHERE: Prisma.AuditLogWhereInput = { id: { in: [] } };
const EMPTY_MESSAGE_WHERE: Prisma.MessagingMessageWhereInput = {
  id: { in: [] },
};
const EMPTY_ACCOUNT_WHERE: Prisma.AccountActivityWhereInput = {
  id: { in: [] },
};
const EMPTY_CALENDAR_WHERE: Prisma.CalendarEventWhereInput = { id: { in: [] } };
const EMPTY_THREAD_WHERE: Prisma.MessagingThreadWhereInput = { id: { in: [] } };

function relationshipIsPositive(rule: ActivityRelationshipRule) {
  return rule.operator === FilterOperatorKey.in || rule.operator === FilterOperatorKey.hasSome;
}

function auditRelationshipWhere(
  rule: ActivityRelationshipRule,
  accessibleAuditEntityIds?: string[],
): Prisma.AuditLogWhereInput {
  const events = auditEventsForEntityTypes([rule.entityType]);
  if (events.length === 0) return EMPTY_AUDIT_WHERE;

  const targetIds = rule.ids ?? (relationshipIsPositive(rule) ? accessibleAuditEntityIds : undefined);
  const target: Prisma.AuditLogWhereInput = {
    event: { in: events },
    ...(targetIds !== undefined ? { entityId: { in: targetIds } } : {}),
  };
  const relationshipWhere: Prisma.AuditLogWhereInput = relationshipIsPositive(rule) ? target : { NOT: target };

  if (accessibleAuditEntityIds === undefined) return relationshipWhere;

  const accessWhere: Prisma.AuditLogWhereInput = {
    OR: [{ event: { notIn: events } }, { event: { in: events }, entityId: { in: accessibleAuditEntityIds } }],
  };

  return { AND: [accessWhere, relationshipWhere] };
}

function scopedEntityTypes(scope: ActivityScope | undefined): EntityType[] {
  if (!scope) return [];

  return [...new Set([...(scope.entityTypes ?? []), ...(scope.records ?? []).map((record) => record.entityType)])];
}

function auditScopeWhere(scope: ActivityScope): Prisma.AuditLogWhereInput | undefined {
  const predicates: Prisma.AuditLogWhereInput[] = [];

  for (const record of scope.records ?? []) {
    const events = auditEventsForEntityTypes([record.entityType]);
    if (events.length) predicates.push({ event: { in: events }, entityId: { in: record.ids } });
  }

  const events = auditEventsForEntityTypes(scope.entityTypes ?? []);
  if (events.length) predicates.push({ event: { in: events } });

  if (predicates.length === 0) return { id: { in: [] } };

  return predicates.length === 1 ? predicates[0] : { OR: predicates };
}

type MergedActivityEntry = ActivityEntryDto & {
  unresolvedRefs: UnresolvedRecordRef[];
  unresolvedIdentifiers: UnresolvedIdentifier[];
};

type UnresolvedIdentifier = { provider: MessagingProvider; value: string };

type NamedModel = "organization" | "deal" | "service" | "task";

function auditRecordRefs(event: string, entityId: string | null): UnresolvedRecordRef[] {
  const entityType = auditEntityTypeFor(event);
  if (!entityType || !entityId) return [];

  return [{ entityType, id: entityId }];
}

function messageRecordRefs(message: MessagingMessage): UnresolvedRecordRef[] {
  const contactId = message.sender?.contact?.id;
  if (!contactId) return [];

  return [{ entityType: EntityType.contact, id: contactId }];
}

function messageIdentifiers(
  provider: MessagingProvider,
  participants: Array<{ isSelf: boolean; identifier: string | null }>,
): UnresolvedIdentifier[] {
  const counterparts = participants.filter((participant) => !participant.isSelf && participant.identifier);
  return [
    ...new Set(
      counterparts.map((participant) => participant.identifier).filter((value): value is string => Boolean(value)),
    ),
  ].map((value) => ({ provider, value }));
}

export abstract class ActivityContactRepo {
  abstract resolveContactIdsForEntityTypeCompanyWide(args: {
    entityType: EntityType;
    entityIds?: string[];
    limit: number;
  }): Promise<string[]>;
  abstract findContactIdentifierTargetsCompanyWide(contactIds: string[]): Promise<ContactIdentifierTarget[]>;
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

export class PrismaActivitiesRepo
  extends BaseRepository
  implements
    GetActivitiesRepo,
    ActivityThreadOptionsRepo,
    ActivityRecordOptionsRepo,
    GetWidgetActivityFilterableFieldsRepo
{
  private scope: ActivityScope | undefined;
  private messagingSourcesEnabled = false;
  private scopeTruncatedForQuery = false;
  private compiledPlans = new Map<string, Promise<CompiledActivityPlan>>();
  private contactExpansionCache = new Map<string, Promise<string[]>>();
  private accessibleAuditEntityIdsCache = new Map<EntityType, Promise<string[] | undefined>>();

  canReadMessagingSources() {
    return (
      this.hasPermission(Resource.inboxMessages, Action.readAll) ||
      this.hasPermission(Resource.inboxMessages, Action.readOwn)
    );
  }

  setMessagingSourcesEnabled(enabled: boolean) {
    this.messagingSourcesEnabled = enabled;
  }

  getAvailableSources(): ActivityKind[] {
    const sources: ActivityKind[] = [];
    if (this.hasPermission(Resource.auditLog, Action.readAll)) sources.push("audit");
    if (this.messagingSourcesEnabled && this.canReadMessagingSources())
      sources.push("message", "activity", "calendar_event");
    return sources;
  }

  setScope(scope?: ActivityScope) {
    this.scope = scope;
    this.compiledPlans.clear();
    this.contactExpansionCache.clear();
    this.accessibleAuditEntityIdsCache.clear();
    this.scopeTruncatedForQuery = false;
  }

  getSortableFields() {
    return [{ field: "at", resolvedFields: ["at"] }];
  }

  getFilterableFields() {
    return Promise.resolve(
      activityFilterableFieldsForViewer({
        canAccess: (resource) => this.canAccess(resource),
        canReadMessages: this.messagingSourcesEnabled && this.canReadMessagingSources(),
        hasPermission: (resource, action) => this.hasPermission(resource, action),
      }),
    );
  }

  validateFilters(args: { filters: Filter[] | undefined; filterableFields: FilterableField[] }) {
    return super.validateFilters({
      filters: args.filters,
      filterableFields: activityFilterableFieldsRetainedForFailClosedCompilation(),
    });
  }

  getCustomColumns() {
    const scopedTypes = scopedEntityTypes(this.scope);
    const accessibleTypes = Object.values(EntityType).filter((entityType) =>
      this.canAccess(TERMINOLOGY_ENTITY_RESOURCE[entityType]),
    );
    const entityTypes = new Set(
      scopedTypes.length ? scopedTypes.filter((type) => accessibleTypes.includes(type)) : accessibleTypes,
    );

    return getCustomColumnRepo()
      .getCustomColumns()
      .then((columns) => columns.filter((column) => entityTypes.has(column.entityType)));
  }

  async listRecordOptions(data: ActivityRecordOptionsData) {
    const refs = data.records.flatMap(({ entityType, ids }) => ids.map((id) => ({ entityType, id })));
    const labels = await this.resolveRecordLabels(refs);

    return refs.flatMap((ref) => {
      const resolved = labels.get(recordRefKey(ref.entityType, ref.id));
      return resolved === undefined ? [] : [{ ...ref, label: resolved.label, avatarUrl: resolved.avatarUrl }];
    });
  }

  async listThreadOptions(args: ActivityThreadOptionsData) {
    const connectedAccountIds = args.connectedAccountIds?.length ? args.connectedAccountIds : undefined;

    this.setScope(args.scope);
    const scope = await this.resolveScope();
    const query = interpretFilters(args.filters);
    const relationships = await this.compileRelationshipWhere(query.relationshipRules, scope.contactIds);
    if (!relationships.contactSourcesAllowed || scope.scopeTruncated) return [];

    const scopeWhere = await this.compileScopeSourceWhere(scope, relationships.scopeTargets);
    if (!scopeWhere.contactSourcesAllowed) return [];

    return this.listThreads([...scopeWhere.thread, ...relationships.thread], query, connectedAccountIds);
  }

  async getItems(params: GetQueryParams) {
    const { query, sourceWhere, fetchAudit, fetchMessages, fetchActivities, fetchCalendar } = await this.plan(params);

    const pageSize = params.pagination?.pageSize ?? params.take ?? 100;
    const page = params.pagination?.page ?? 1;
    const skip = params.skip ?? (page - 1) * pageSize;
    const fetchN = skip + pageSize;
    const direction = params.sortDescriptor?.direction === "asc" ? ("asc" as const) : ("desc" as const);

    const [auditLogs, messages, activities, calendarEvents] = await Promise.all([
      fetchAudit ? this.listAuditLogs(sourceWhere.audit, fetchN, direction) : [],
      fetchMessages
        ? this.listMessages({
            query,
            sourceWhere: sourceWhere.message,
            limit: fetchN,
            direction,
          })
        : [],
      fetchActivities
        ? this.listAccountActivities({
            query,
            sourceWhere: sourceWhere.account,
            limit: fetchN,
            direction,
          })
        : [],
      fetchCalendar
        ? this.listCalendarEvents({
            query,
            sourceWhere: sourceWhere.calendar,
            limit: fetchN,
            direction,
          })
        : [],
    ]);

    const myAccountIds = await this.listMySendingAccountIds(
      messages
        .filter(({ message }) => message.direction === "outbound")
        .map(({ message }) => message.connectedAccountId),
    );

    const identifiersByMessageId = new Map(
      messages.map(({ message, participants }) => [message.id, messageIdentifiers(message.provider, participants)]),
    );

    const merged: MergedActivityEntry[] = [
      ...auditLogs.map((log) => ({
        kind: "audit" as const,
        id: log.id,
        at: log.createdAt,
        actor: log.user,
        event: log.event,
        changes: extractAuditChanges(log.eventData),
        records: EMPTY_RECORD_CONTEXT,
        unresolvedRefs: auditRecordRefs(log.event, log.entityId),
        unresolvedIdentifiers: [],
      })),
      ...messages.map(({ message, thread }) => ({
        kind: "message" as const,
        id: message.id,
        at: message.sentAt,
        message,
        thread,
        senderIsMine: message.direction === "outbound" && myAccountIds.has(message.connectedAccountId),
        records: EMPTY_RECORD_CONTEXT,
        unresolvedRefs: messageRecordRefs(message),
        unresolvedIdentifiers: identifiersByMessageId.get(message.id) ?? [],
      })),
      ...activities.map((activity) => ({
        kind: "activity" as const,
        id: activity.id,
        at: activity.occurredAt,
        payload: activity.payload,
        records: EMPTY_RECORD_CONTEXT,
        unresolvedRefs: [],
        unresolvedIdentifiers: activity.identifier ? [{ provider: activity.provider, value: activity.identifier }] : [],
      })),
      ...calendarEvents.map((event) => ({
        kind: "calendar_event" as const,
        id: event.id,
        at: event.startsAt,
        event,
        records: EMPTY_RECORD_CONTEXT,
        unresolvedRefs: [],
        unresolvedIdentifiers: event.attendeeEmails.map((value) => ({
          provider: event.provider,
          value,
        })),
      })),
    ];

    const seen = new Set<string>();

    const pageEntries = merged
      .filter((entry) => {
        const key = `${entry.kind}:${entry.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const aKey = `${a.kind}:${a.id}`;
        const bKey = `${b.kind}:${b.id}`;
        const byAt = a.at.getTime() - b.at.getTime() || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0);
        return direction === "asc" ? byAt : -byAt;
      })
      .slice(skip, skip + pageSize);

    return this.attachRecordContext(pageEntries);
  }

  private async attachRecordContext(page: MergedActivityEntry[]): Promise<ActivityEntryDto[]> {
    const byIdentifier = await this.resolveContactsByIdentifier(page.flatMap((entry) => entry.unresolvedIdentifiers));
    const withIdentifierRefs = page.map((entry) => ({
      ...entry,
      unresolvedRefs: [
        ...entry.unresolvedRefs,
        ...entry.unresolvedIdentifiers.flatMap((identifier) => {
          const contactId = byIdentifier.get(identifierKey(identifier.provider, identifier.value));

          return contactId ? [{ entityType: EntityType.contact, id: contactId }] : [];
        }),
      ],
    }));

    const labels = await this.resolveRecordLabels(withIdentifierRefs.flatMap((entry) => entry.unresolvedRefs));

    return withIdentifierRefs.map(({ unresolvedRefs, unresolvedIdentifiers: _identifiers, ...entry }) => {
      const resolved = unresolvedRefs.flatMap((ref) => {
        const match = labels.get(recordRefKey(ref.entityType, ref.id));

        return match === undefined ? [] : [{ ...ref, label: match.label, avatarUrl: match.avatarUrl }];
      });

      return {
        ...entry,
        records: buildRecordContext(resolved),
      } as ActivityEntryDto;
    });
  }

  private async resolveContactsByIdentifier(identifiers: UnresolvedIdentifier[]): Promise<Map<string, string>> {
    const valuesByClass = new Map<string, { provider: MessagingProvider; values: Set<string> }>();
    for (const identifier of identifiers) {
      const entry = valuesByClass.get(channelClass(identifier.provider)) ?? {
        provider: identifier.provider,
        values: new Set<string>(),
      };
      entry.values.add(identifier.value);
      valuesByClass.set(channelClass(identifier.provider), entry);
    }
    if (valuesByClass.size === 0) return new Map();

    const rows = await this.prisma.contactIdentifier.findMany({
      where: {
        companyId: this.companyId,
        OR: [...valuesByClass.values()].map(({ provider, values }) => ({
          ...classWhere(provider),
          OR: [{ value: { in: [...values] } }, { messagingId: { in: [...values] } }],
        })),
      },
      select: {
        provider: true,
        value: true,
        messagingId: true,
        contactId: true,
      },
    });

    const resolved = new Map<string, string>();
    for (const row of rows) {
      resolved.set(identifierKey(row.provider, row.value), row.contactId);
      if (row.messagingId) resolved.set(identifierKey(row.provider, row.messagingId), row.contactId);
    }
    return resolved;
  }

  private async resolveRecordLabels(refs: UnresolvedRecordRef[]): Promise<Map<ActivityRecordRefKey, ResolvedRecord>> {
    const out = new Map<ActivityRecordRefKey, ResolvedRecord>();
    if (refs.length === 0) return out;

    const byType = new Map<EntityType, Set<string>>();
    for (const ref of refs) {
      const ids = byType.get(ref.entityType) ?? new Set<string>();
      ids.add(ref.id);
      byType.set(ref.entityType, ids);
    }

    const idsFor = (entityType: EntityType) => [...(byType.get(entityType) ?? [])];
    const record = (entityType: EntityType, rows: Array<{ id: string } & ResolvedRecord>) => {
      for (const row of rows) out.set(recordRefKey(entityType, row.id), { label: row.label, avatarUrl: row.avatarUrl });
    };

    const [contacts, organizations, deals, services, tasks] = await Promise.all([
      this.findContactLabels(idsFor(EntityType.contact)),
      this.findNamedLabels("organization", idsFor(EntityType.organization)),
      this.findNamedLabels("deal", idsFor(EntityType.deal)),
      this.findNamedLabels("service", idsFor(EntityType.service)),
      this.findNamedLabels("task", idsFor(EntityType.task)),
    ]);

    record(EntityType.contact, contacts);
    record(EntityType.organization, organizations);
    record(EntityType.deal, deals);
    record(EntityType.service, services);
    record(EntityType.task, tasks);

    return out;
  }

  private async findContactLabels(ids: string[]): Promise<Array<{ id: string } & ResolvedRecord>> {
    if (ids.length === 0) return [];

    const rows = await this.prisma.contact.findMany({
      where: { id: { in: ids }, ...this.accessWhere("contact") },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });

    return rows.map((row) => ({
      id: row.id,
      label: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
      avatarUrl: row.avatarUrl,
    }));
  }

  private async findNamedLabels(model: NamedModel, ids: string[]): Promise<Array<{ id: string } & ResolvedRecord>> {
    if (ids.length === 0) return [];

    const rows = await this.findNamedRows(model, ids);

    return rows.map((row) => ({ id: row.id, label: row.name ?? "", avatarUrl: null }));
  }

  private accessibleAuditEntityIds(entityType: EntityType): Promise<string[] | undefined> {
    const existing = this.accessibleAuditEntityIdsCache.get(entityType);
    if (existing) return existing;

    const resource = TERMINOLOGY_ENTITY_RESOURCE[entityType];
    const accessible = this.hasPermission(resource, Action.readAll)
      ? Promise.resolve(undefined)
      : this.findAccessibleAuditEntityIds(entityType);
    this.accessibleAuditEntityIdsCache.set(entityType, accessible);

    return accessible;
  }

  private async findAccessibleAuditEntityIds(entityType: EntityType): Promise<string[]> {
    if (entityType === EntityType.contact) {
      const rows = await this.prisma.contact.findMany({
        where: this.accessWhere("contact"),
        select: { id: true },
      });
      return rows.map(({ id }) => id);
    }

    const rows = await this.findNamedRows(entityType, undefined);
    return rows.map(({ id }) => id);
  }

  private findNamedRows(model: NamedModel, ids?: string[]) {
    const idWhere = ids === undefined ? {} : { id: { in: ids } };
    if (model === "organization") {
      return this.prisma.organization.findMany({
        where: { ...idWhere, ...this.accessWhere("organization") },
        select: { id: true, name: true },
      });
    }

    if (model === "deal") {
      return this.prisma.deal.findMany({
        where: { ...idWhere, ...this.accessWhere("deal") },
        select: { id: true, name: true },
      });
    }

    if (model === "service") {
      return this.prisma.service.findMany({
        where: { ...idWhere, ...this.accessWhere("service") },
        select: { id: true, name: true },
      });
    }

    return this.prisma.task.findMany({
      where: { ...idWhere, ...this.accessWhere("task") },
      select: { id: true, name: true },
    });
  }

  private async listMySendingAccountIds(accountIds: string[]): Promise<Set<string>> {
    if (accountIds.length === 0) return new Set();

    const rows = await this.prisma.connectedAccount.findMany({
      where: {
        id: { in: [...new Set(accountIds)] },
        companyId: this.companyId,
        userId: this.userId,
      },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }

  async getCount(params: GetQueryParams) {
    const { query, sourceWhere, fetchAudit, fetchMessages, fetchActivities, fetchCalendar } = await this.plan(params);

    const [audit, messages, activities, calendar] = await Promise.all([
      fetchAudit ? this.countAuditLogs(sourceWhere.audit) : 0,
      fetchMessages ? this.countMessages({ query, sourceWhere: sourceWhere.message }) : 0,
      fetchActivities
        ? this.countAccountActivities({
            query,
            sourceWhere: sourceWhere.account,
          })
        : 0,
      fetchCalendar ? this.countCalendarEvents({ query, sourceWhere: sourceWhere.calendar }) : 0,
    ]);

    return audit + messages + activities + calendar;
  }

  private accessibleFolderStates?: Promise<Array<{ id: string; visibleSet: string[] }>>;

  isScopeTruncated(): Promise<boolean> {
    return Promise.resolve(this.scopeTruncatedForQuery);
  }

  private async accessibleScope(scope: ActivityScope): Promise<ActivityScope> {
    const recordIds = new Map<EntityType, Set<string>>();
    for (const record of scope.records ?? []) {
      const ids = recordIds.get(record.entityType) ?? new Set<string>();
      record.ids.forEach((id) => ids.add(id));
      recordIds.set(record.entityType, ids);
    }

    const refs = [...recordIds].flatMap(([entityType, ids]) => [...ids].map((id) => ({ entityType, id })));
    const labels = await this.resolveRecordLabels(refs);
    const records = Object.values(EntityType).flatMap((entityType) => {
      const ids = [...(recordIds.get(entityType) ?? [])].filter((id) => labels.has(recordRefKey(entityType, id)));
      return ids.length ? [{ entityType, ids }] : [];
    });
    const narrowedTypes = new Set(recordIds.keys());
    const entityTypes = [...new Set(scope.entityTypes ?? [])].filter(
      (entityType) => !narrowedTypes.has(entityType) && this.canAccess(TERMINOLOGY_ENTITY_RESOURCE[entityType]),
    );

    if (entityTypes.length) return { entityTypes, ...(records.length ? { records } : {}) };

    return { records };
  }

  private async resolveScope(): Promise<ResolvedActivityScope> {
    const scope = this.scope;
    if (!scope) {
      return {
        contactIds: undefined,
        auditWhere: undefined,
        scopeTruncated: false,
      };
    }

    const accessibleScope = await this.accessibleScope(scope);

    const groups = [
      ...(accessibleScope.records ?? []).map((record) => ({
        entityType: record.entityType,
        entityIds: record.ids,
      })),
      ...(accessibleScope.entityTypes ?? []).map((entityType) => ({
        entityType,
        entityIds: undefined,
      })),
    ];

    const resolved = await Promise.all(
      groups.map((group) => this.resolveContactExpansion(group.entityType, group.entityIds)),
    );

    const contactIds = [...new Set(resolved.flat())];
    const scopeTruncated = contactIds.length > ACTIVITY_SCOPE_CONTACT_MAX;

    return {
      contactIds: scopeTruncated ? [] : contactIds,
      auditWhere: auditScopeWhere(accessibleScope),
      scopeTruncated,
    };
  }

  private async compileContactTargets(
    contactIds: string[],
    resolvedIdentifiers?: ContactIdentifierTarget[],
  ): Promise<ContactSourceTargets> {
    if (contactIds.length === 0) {
      return {
        message: EMPTY_MESSAGE_WHERE,
        messageNegative: {},
        account: EMPTY_ACCOUNT_WHERE,
        accountNegative: {},
        calendar: EMPTY_CALENDAR_WHERE,
        calendarNegative: {},
        thread: EMPTY_THREAD_WHERE,
        threadNegative: {},
      };
    }

    const identifiers =
      resolvedIdentifiers ?? (await getContactRepo().findContactIdentifierTargetsCompanyWide(contactIds));
    const byClass = new Map<
      string,
      {
        provider: MessagingProvider;
        identifierValues: Set<string>;
        providerUserIds: Set<string>;
        senderValues: Set<string>;
      }
    >();
    for (const { provider, value, messagingId } of identifiers) {
      const key = channelClass(provider);
      const entry = byClass.get(key) ?? {
        provider,
        identifierValues: new Set<string>(),
        providerUserIds: new Set<string>(),
        senderValues: new Set<string>(),
      };
      entry.identifierValues.add(value);
      entry.senderValues.add(value);
      if (messagingId) {
        entry.providerUserIds.add(messagingId);
        entry.senderValues.add(messagingId);
      }
      byClass.set(key, entry);
    }
    const identifierGroups = [...byClass.values()].map(
      ({ provider, identifierValues, providerUserIds, senderValues }) => ({
        provider,
        providerWhere: classWhere(provider),
        identifierValues: [...identifierValues],
        providerUserIds: [...providerUserIds],
        senderValues: [...senderValues],
      }),
    );
    const participantGroups = identifierGroups.map((group) => ({
      ...group.providerWhere,
      OR: [
        ...(group.identifierValues.length ? [{ identifier: { in: group.identifierValues } }] : []),
        ...(group.providerUserIds.length ? [{ providerUserId: { in: group.providerUserIds } }] : []),
      ],
    }));
    const participantThread: Prisma.MessagingThreadWhereInput = participantGroups.length
      ? {
          participants: { some: { OR: participantGroups } },
        }
      : EMPTY_THREAD_WHERE;
    const senderTargets: Prisma.MessagingMessageWhereInput[] = identifierGroups.map((group) => ({
      ...group.providerWhere,
      senderIdentifier: { in: group.senderValues },
    }));
    const message: Prisma.MessagingMessageWhereInput = identifierGroups.length
      ? { OR: [{ thread: participantThread }, ...senderTargets] }
      : EMPTY_MESSAGE_WHERE;
    const senderNegative: Prisma.MessagingMessageWhereInput = {
      OR: [{ senderIdentifier: null }, { NOT: { OR: senderTargets } }],
    };
    const messageNegative: Prisma.MessagingMessageWhereInput = identifierGroups.length
      ? {
          AND: [{ NOT: { thread: participantThread } }, senderNegative],
        }
      : {};

    const linkedInValues = [
      ...new Set(
        identifiers
          .filter((identifier) => identifier.provider === MessagingProvider.linkedin)
          .flatMap((identifier) => [identifier.value, ...(identifier.messagingId ? [identifier.messagingId] : [])]),
      ),
    ];
    const account: Prisma.AccountActivityWhereInput = linkedInValues.length
      ? { identifier: { in: linkedInValues } }
      : EMPTY_ACCOUNT_WHERE;
    const accountNegative: Prisma.AccountActivityWhereInput = linkedInValues.length
      ? { OR: [{ identifier: null }, { NOT: account }] }
      : {};

    const emailProviders = new Set<MessagingProvider>(EMAIL_PROVIDERS);
    const emails = [
      ...new Set(
        identifiers
          .filter((identifier) => emailProviders.has(identifier.provider))
          .map((identifier) => identifier.value.toLowerCase()),
      ),
    ];
    const calendar: Prisma.CalendarEventWhereInput = emails.length
      ? { attendeeEmails: { hasSome: emails } }
      : EMPTY_CALENDAR_WHERE;
    const calendarNegative: Prisma.CalendarEventWhereInput = emails.length ? { NOT: calendar } : {};
    const thread: Prisma.MessagingThreadWhereInput = identifierGroups.length
      ? { OR: [participantThread, { messages: { some: { OR: senderTargets } } }] }
      : EMPTY_THREAD_WHERE;

    return {
      message,
      messageNegative,
      account,
      accountNegative,
      calendar,
      calendarNegative,
      thread,
      threadNegative: identifierGroups.length
        ? { AND: [{ NOT: participantThread }, { messages: { some: senderNegative } }] }
        : {},
    };
  }

  private resolveContactExpansion(entityType: EntityType, entityIds?: string[]) {
    const ids = entityIds ? [...new Set(entityIds)].sort() : undefined;
    const cacheKey = `${entityType}:${ids?.join(",") ?? "*"}`;
    let expansion = this.contactExpansionCache.get(cacheKey);
    if (!expansion) {
      expansion = getContactRepo().resolveContactIdsForEntityTypeCompanyWide({
        entityType,
        entityIds: ids,
        limit: ACTIVITY_SCOPE_CONTACT_MAX + 1,
      });
      this.contactExpansionCache.set(cacheKey, expansion);
    }
    return expansion;
  }

  private async compileRelationshipWhere(
    rules: ActivityRelationshipRule[],
    scopeContactIds?: string[],
  ): Promise<CompiledRelationshipWhere> {
    const failClosed = (): CompiledRelationshipWhere => ({
      audit: [EMPTY_AUDIT_WHERE],
      message: [EMPTY_MESSAGE_WHERE],
      account: [EMPTY_ACCOUNT_WHERE],
      calendar: [EMPTY_CALENDAR_WHERE],
      thread: [EMPTY_THREAD_WHERE],
      contactSourcesAllowed: false,
      truncated: false,
    });
    const validatedRules: Array<{
      rule: ActivityRelationshipRule;
      accessibleAuditEntityIds: string[] | undefined;
    }> = [];

    for (const rule of rules) {
      if (!this.canAccess(TERMINOLOGY_ENTITY_RESOURCE[rule.entityType])) return failClosed();

      const ids = rule.ids ? [...new Set(rule.ids)] : undefined;
      if (ids) {
        const labels = await this.resolveRecordLabels(ids.map((id) => ({ entityType: rule.entityType, id })));
        if (labels.size !== ids.length) return failClosed();
      }
      const needsAccessibleAuditEntityIds = ids === undefined || !relationshipIsPositive(rule);
      const accessibleAuditEntityIds = needsAccessibleAuditEntityIds
        ? await this.accessibleAuditEntityIds(rule.entityType)
        : undefined;
      validatedRules.push({ rule: { ...rule, ids }, accessibleAuditEntityIds });
    }
    const audit = validatedRules.map(({ rule, accessibleAuditEntityIds }) =>
      auditRelationshipWhere(rule, accessibleAuditEntityIds),
    );

    const resolved: Array<{
      rule: ActivityRelationshipRule;
      contactIds: string[];
    }> = [];
    const aggregateContactIds = new Set(scopeContactIds ?? []);
    if (aggregateContactIds.size > ACTIVITY_SCOPE_CONTACT_MAX) {
      return {
        audit,
        message: [],
        account: [],
        calendar: [],
        thread: [],
        contactSourcesAllowed: false,
        truncated: true,
      };
    }

    for (const { rule } of validatedRules) {
      const ids = rule.ids;
      const contactIds = [...new Set(await this.resolveContactExpansion(rule.entityType, ids))];
      contactIds.forEach((contactId) => aggregateContactIds.add(contactId));
      if (contactIds.length > ACTIVITY_SCOPE_CONTACT_MAX || aggregateContactIds.size > ACTIVITY_SCOPE_CONTACT_MAX) {
        return {
          audit,
          message: [],
          account: [],
          calendar: [],
          thread: [],
          contactSourcesAllowed: false,
          truncated: true,
        };
      }
      resolved.push({ rule: { ...rule, ids }, contactIds });
    }

    const identifiers = aggregateContactIds.size
      ? await getContactRepo().findContactIdentifierTargetsCompanyWide([...aggregateContactIds])
      : [];
    const compiled = await Promise.all(
      resolved.map(async ({ rule, contactIds }) => {
        const selected = new Set(contactIds);
        return {
          rule,
          targets: await this.compileContactTargets(
            contactIds,
            identifiers.filter((identifier) => selected.has(identifier.contactId)),
          ),
        };
      }),
    );
    const scopeIdSet = new Set(scopeContactIds ?? []);
    const scopeTargets = scopeContactIds?.length
      ? await this.compileContactTargets(
          scopeContactIds,
          identifiers.filter((identifier) => scopeIdSet.has(identifier.contactId)),
        )
      : undefined;

    return {
      audit,
      message: compiled.map(({ rule, targets }) =>
        relationshipIsPositive(rule) ? targets.message : targets.messageNegative,
      ),
      account: compiled.map(({ rule, targets }) =>
        relationshipIsPositive(rule) ? targets.account : targets.accountNegative,
      ),
      calendar: compiled.map(({ rule, targets }) =>
        relationshipIsPositive(rule) ? targets.calendar : targets.calendarNegative,
      ),
      thread: compiled.map(({ rule, targets }) =>
        relationshipIsPositive(rule) ? targets.thread : targets.threadNegative,
      ),
      contactSourcesAllowed: true,
      truncated: false,
      scopeTargets,
    };
  }

  private async compileScopeSourceWhere(scope: ResolvedActivityScope, precompiledTargets?: ContactSourceTargets) {
    if (scope.contactIds === undefined) {
      return {
        message: [],
        account: [],
        calendar: [],
        thread: [],
        contactSourcesAllowed: true,
      };
    }
    if (scope.scopeTruncated || scope.contactIds.length === 0) {
      return {
        message: [],
        account: [],
        calendar: [],
        thread: [],
        contactSourcesAllowed: false,
      };
    }

    const targets = precompiledTargets ?? (await this.compileContactTargets(scope.contactIds));
    return {
      message: [targets.message],
      account: [targets.account],
      calendar: [targets.calendar],
      thread: [targets.thread],
      contactSourcesAllowed: true,
    };
  }

  private plan(params: GetQueryParams): Promise<CompiledActivityPlan> {
    const key = JSON.stringify(params.filters ?? []);
    const existing = this.compiledPlans.get(key);
    if (existing) return existing;

    const planned = this.computePlan(params);
    this.compiledPlans.set(key, planned);
    return planned;
  }

  private async computePlan(params: GetQueryParams): Promise<CompiledActivityPlan> {
    const canReadMessages = this.messagingSourcesEnabled && this.canReadMessagingSources();
    const canReadAudit = this.hasPermission(Resource.auditLog, Action.readAll);
    const query = interpretFilters(params.filters);
    const scope = await this.resolveScope();
    const relationships = await this.compileRelationshipWhere(query.relationshipRules, scope.contactIds);
    const scopeWhere = relationships.contactSourcesAllowed
      ? await this.compileScopeSourceWhere(scope, relationships.scopeTargets)
      : {
          message: [],
          account: [],
          calendar: [],
          thread: [],
          contactSourcesAllowed: false,
        };
    const contactSourcesAllowed = scopeWhere.contactSourcesAllowed && relationships.contactSourcesAllowed;
    const wantContactSources = canReadMessages && contactSourcesAllowed;
    const kindAllowed = (kind: ActivityKind) =>
      (!query.kindsIn || query.kindsIn.has(kind)) && (!query.kindsNotIn || !query.kindsNotIn.has(kind));

    const channelOrProviderActive = Boolean(
      query.providers !== undefined ||
        query.connectedAccountIdsIn !== undefined ||
        query.connectedAccountIdsNotIn?.size,
    );
    const threadIncluded = query.threadIdsIn !== undefined;
    const wantsContactSource =
      canReadMessages &&
      (kindAllowed("message") ||
        (kindAllowed("activity") && !threadIncluded) ||
        (kindAllowed("calendar_event") && !threadIncluded));
    this.scopeTruncatedForQuery = (scope.scopeTruncated || relationships.truncated) && wantsContactSource;

    const auditPredicates = [...(scope.auditWhere ? [scope.auditWhere] : []), ...relationships.audit];
    const auditWhere =
      auditPredicates.length === 0
        ? undefined
        : auditPredicates.length === 1
          ? auditPredicates[0]
          : { AND: auditPredicates };

    return {
      query,
      sourceWhere: {
        audit: auditWhere,
        message: [...scopeWhere.message, ...relationships.message],
        account: [...scopeWhere.account, ...relationships.account],
        calendar: [...scopeWhere.calendar, ...relationships.calendar],
      },
      fetchAudit: canReadAudit && kindAllowed("audit") && !channelOrProviderActive && !threadIncluded,
      fetchMessages: wantContactSources && kindAllowed("message"),
      fetchActivities: wantContactSources && kindAllowed("activity") && !threadIncluded,
      fetchCalendar: wantContactSources && kindAllowed("calendar_event") && !threadIncluded,
    };
  }

  private loadAccessibleFolderStates() {
    return (this.accessibleFolderStates ??= this.prisma.connectedAccount
      .findMany({
        where: {
          companyId: this.companyId,
          OR: [{ userId: this.userId }, { shared: true }, { threads: { some: { sharedToCrm: true } } }],
          foldersSyncedAt: { not: null },
        },
        select: { id: true, selectedFolderIds: true },
      })
      .then((rows) => rows.map((row) => ({ id: row.id, visibleSet: row.selectedFolderIds }))));
  }

  private async messageVisibilityWhere(): Promise<Prisma.MessagingMessageWhereInput> {
    const states = await this.loadAccessibleFolderStates();
    if (states.length === 0) return { isHidden: false };

    return {
      isHidden: false,
      OR: [
        { connectedAccountId: { notIn: states.map((state) => state.id) } },
        ...states.map((state) => ({
          connectedAccountId: state.id,
          ...folderMessageWhere(state.visibleSet),
        })),
      ],
    };
  }

  private auditLogWhere(auditWhere: Prisma.AuditLogWhereInput | undefined): Prisma.AuditLogWhereInput {
    return { companyId: this.companyId, ...(auditWhere ?? {}) };
  }

  private async messageWhere(args: {
    query: ActivityQuery;
    sourceWhere: Prisma.MessagingMessageWhereInput[];
  }): Promise<Prisma.MessagingMessageWhereInput> {
    const { query, sourceWhere } = args;
    const visibility = await this.messageVisibilityWhere();

    return {
      companyId: this.companyId,
      thread: threadAccessWhere(this.companyId, this.userId),
      ...providerWhere(query),
      ...channelWhere(query),
      ...threadWhere(query),
      AND: [...sourceWhere, visibility],
    };
  }

  private accountActivityWhere(args: {
    query: ActivityQuery;
    sourceWhere: Prisma.AccountActivityWhereInput[];
  }): Prisma.AccountActivityWhereInput {
    const { query, sourceWhere } = args;

    return {
      ...accountActivityAccessWhere(this.companyId, this.userId),
      AND: [...sourceWhere, providerRelationWhere(query), channelWhere(query)],
    };
  }

  private calendarEventWhere(args: {
    query: ActivityQuery;
    sourceWhere: Prisma.CalendarEventWhereInput[];
  }): Prisma.CalendarEventWhereInput {
    const { query, sourceWhere } = args;

    return {
      ...calendarEventAccessWhere(this.companyId, this.userId),
      AND: [...sourceWhere, providerRelationWhere(query), channelWhere(query)],
    };
  }

  private listAuditLogs(auditWhere: Prisma.AuditLogWhereInput | undefined, limit: number, direction: "asc" | "desc") {
    return this.prisma.auditLog.findMany({
      where: this.auditLogWhere(auditWhere),
      orderBy: [{ createdAt: direction }, { id: direction }],
      take: limit,
      select: {
        id: true,
        event: true,
        eventData: true,
        entityId: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
    });
  }

  private countAuditLogs(auditWhere: Prisma.AuditLogWhereInput | undefined) {
    return this.prisma.auditLog.count({
      where: this.auditLogWhere(auditWhere),
    });
  }

  private async listMessages(args: {
    query: ActivityQuery;
    sourceWhere: Prisma.MessagingMessageWhereInput[];
    limit: number;
    direction: "asc" | "desc";
  }) {
    const { query, sourceWhere, direction } = args;

    const rows = await this.prisma.messagingMessage.findMany({
      where: await this.messageWhere({ query, sourceWhere }),
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
        participants: thread.participants,
        thread: {
          id: thread.id,
          type: thread.type,
          label: this.threadLabel(thread),
        },
      };
    });
  }

  private async countMessages(args: { query: ActivityQuery; sourceWhere: Prisma.MessagingMessageWhereInput[] }) {
    return this.prisma.messagingMessage.count({
      where: await this.messageWhere(args),
    });
  }

  private async listAccountActivities(args: {
    query: ActivityQuery;
    sourceWhere: Prisma.AccountActivityWhereInput[];
    limit: number;
    direction: "asc" | "desc";
  }) {
    if (!this.canAccess(Resource.inboxMessages)) return [];

    const { query, sourceWhere, limit, direction } = args;

    const rows = await this.prisma.accountActivity.findMany({
      where: this.accountActivityWhere({ query, sourceWhere }),
      orderBy: [{ occurredAt: direction }, { id: direction }],
      take: limit,
      select: {
        id: true,
        identifier: true,
        payload: true,
        occurredAt: true,
        connectedAccount: { select: { provider: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      identifier: row.identifier,
      occurredAt: row.occurredAt,
      payload: (row.payload as unknown as Record<string, unknown> | null) ?? {},
      provider: row.connectedAccount.provider,
    }));
  }

  private async countAccountActivities(args: {
    query: ActivityQuery;
    sourceWhere: Prisma.AccountActivityWhereInput[];
  }) {
    if (!this.canAccess(Resource.inboxMessages)) return 0;

    return this.prisma.accountActivity.count({
      where: this.accountActivityWhere(args),
    });
  }

  private async listCalendarEvents(args: {
    query: ActivityQuery;
    sourceWhere: Prisma.CalendarEventWhereInput[];
    limit: number;
    direction: "asc" | "desc";
  }) {
    if (!this.canAccess(Resource.inboxMessages)) return [];

    const { query, sourceWhere, limit, direction } = args;

    const rows = await this.prisma.calendarEvent.findMany({
      where: this.calendarEventWhere({ query, sourceWhere }),
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

  private countCalendarEvents(args: { query: ActivityQuery; sourceWhere: Prisma.CalendarEventWhereInput[] }) {
    if (!this.canAccess(Resource.inboxMessages)) return 0;

    return this.prisma.calendarEvent.count({
      where: this.calendarEventWhere(args),
    });
  }

  private async listThreads(
    sourceWhere: Prisma.MessagingThreadWhereInput[],
    query: ActivityQuery,
    connectedAccountIds?: string[],
  ) {
    const configuredAccountIds = query.connectedAccountIdsIn ? [...query.connectedAccountIdsIn] : connectedAccountIds;
    const includedAccountIds =
      configuredAccountIds && connectedAccountIds
        ? configuredAccountIds.filter((id) => connectedAccountIds.includes(id))
        : configuredAccountIds;
    const accountWhere = {
      ...(includedAccountIds ? { in: includedAccountIds } : {}),
      ...(query.connectedAccountIdsNotIn?.size ? { notIn: [...query.connectedAccountIdsNotIn] } : {}),
    };
    const scoped: Prisma.MessagingThreadWhereInput = {
      ...providerWhere(query),
      ...(Object.keys(accountWhere).length ? { connectedAccountId: accountWhere } : {}),
    };
    const folderMembership = threadFolderMembershipWhere(await this.loadAccessibleFolderStates());
    const baseWhere: Prisma.MessagingThreadWhereInput = {
      ...scoped,
      ...threadAccessWhere(this.companyId, this.userId),
      AND: [...sourceWhere, threadHasActivityWhere(), ...(folderMembership ? [folderMembership] : [])],
    };
    const select = {
      id: true,
      type: true,
      provider: true,
      name: true,
      subject: true,
      participants: { select: this.participantSelect },
    } satisfies Prisma.MessagingThreadSelect;
    const rows = await this.prisma.messagingThread.findMany({
      where: baseWhere,
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      select,
    });

    const selectedIds = new Set([...(query.threadIdsIn ?? []), ...(query.threadIdsNotIn ?? [])]);
    const missingSelectedIds = [...selectedIds].filter((id) => !rows.some((thread) => thread.id === id));
    const selectedRows = missingSelectedIds.length
      ? await this.prisma.messagingThread.findMany({
          where: {
            ...threadAccessWhere(this.companyId, this.userId),
            id: { in: missingSelectedIds },
            AND: [threadHasActivityWhere(), ...(folderMembership ? [folderMembership] : [])],
          },
          take: 50,
          select,
        })
      : [];

    return [...rows, ...selectedRows].map((thread) => ({
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
