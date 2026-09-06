import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { RoutineFilterMatcher } from "./routine-filter-matcher";

import { Action, EntityType, Resource, Status } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { CUSTOM_COLUMN_DEFAULT_OPERATORS, FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import {
  accessibleConnectedAccountWhere,
  inboxThreadVisibilityWhere,
  messageVisibilityWhere,
  threadAccessWhere,
} from "@/ee/messaging/messaging-access";
import { DomainEvent } from "@/features/event/domain-events";

import { entityTypeForEvent, isRecordRemovalEvent } from "./routine-event-filter";

type RoutineEventAccessArgs = {
  event: string;
  entityId: string | null;
  triggerPayload: unknown;
};

type RoutineEventUser = {
  id: string;
  companyId: string;
  role: {
    isSystemRole: boolean;
    permissions: { resource: Resource; action: Action }[];
  } | null;
};

const RELATED_FILTER_FIELDS: Record<EntityType, Array<{ field: FilterFieldKey; resource: Resource }>> = {
  [EntityType.contact]: [
    { field: FilterFieldKey.organizationIds, resource: Resource.organizations },
    { field: FilterFieldKey.dealIds, resource: Resource.deals },
    { field: FilterFieldKey.taskIds, resource: Resource.tasks },
  ],
  [EntityType.organization]: [
    { field: FilterFieldKey.contactIds, resource: Resource.contacts },
    { field: FilterFieldKey.dealIds, resource: Resource.deals },
    { field: FilterFieldKey.taskIds, resource: Resource.tasks },
  ],
  [EntityType.deal]: [
    { field: FilterFieldKey.contactIds, resource: Resource.contacts },
    { field: FilterFieldKey.organizationIds, resource: Resource.organizations },
    { field: FilterFieldKey.serviceIds, resource: Resource.services },
    { field: FilterFieldKey.taskIds, resource: Resource.tasks },
  ],
  [EntityType.service]: [
    { field: FilterFieldKey.dealIds, resource: Resource.deals },
    { field: FilterFieldKey.taskIds, resource: Resource.tasks },
  ],
  [EntityType.task]: [
    { field: FilterFieldKey.contactIds, resource: Resource.contacts },
    { field: FilterFieldKey.organizationIds, resource: Resource.organizations },
    { field: FilterFieldKey.dealIds, resource: Resource.deals },
    { field: FilterFieldKey.serviceIds, resource: Resource.services },
  ],
};

const MESSAGE_EVENTS = new Set<string>([
  DomainEvent.MESSAGING_MESSAGE_RECEIVED,
  DomainEvent.MESSAGING_MESSAGE_UPDATED,
  DomainEvent.MESSAGING_MESSAGE_DELETED,
  DomainEvent.MESSAGING_MESSAGE_REACTION,
  DomainEvent.MESSAGING_EMAIL_RECEIVED,
  DomainEvent.MESSAGING_EMAIL_DELETED,
]);
const CHAT_EVENTS = new Set<string>([DomainEvent.MESSAGING_CHAT_UPDATED, DomainEvent.MESSAGING_CHAT_DELETED]);

export abstract class RoutineEventAccess {
  abstract matchesCurrentUser(args: RoutineEventAccessArgs & { filters: Filter[] }): Promise<boolean>;
  abstract matchesUserUnscoped(
    args: RoutineEventAccessArgs & { companyId: string; userId: string; filters: Filter[] },
  ): Promise<boolean>;
  abstract canUserAccessUnscoped(
    args: RoutineEventAccessArgs & { companyId: string; userId: string },
  ): Promise<boolean>;
}

export class PrismaRoutineEventAccess extends BaseRepository implements RoutineEventAccess {
  constructor(private readonly filterMatcher?: RoutineFilterMatcher) {
    super();
  }

  async matchesCurrentUser(args: RoutineEventAccessArgs & { filters: Filter[] }): Promise<boolean> {
    if (!(await this.canUserAccess(this.user, args))) return false;
    if (args.filters.length === 0 || isRecordRemovalEvent(args.event)) return true;

    const entityType = entityTypeForEvent(args.event);
    if (!entityType || !args.entityId || !this.filterMatcher) return false;

    return this.filterMatcher.matches(entityType, args.entityId, args.filters);
  }

  @BypassTenantGuard
  async matchesUserUnscoped(
    args: RoutineEventAccessArgs & { companyId: string; userId: string; filters: Filter[] },
  ): Promise<boolean> {
    const user = await this.findActiveEventUser(args.companyId, args.userId);
    if (!user) return false;
    if (!(await this.canUserAccess(user, args))) return false;
    if (args.filters.length === 0 || isRecordRemovalEvent(args.event)) return true;

    const entityType = entityTypeForEvent(args.event);
    if (!entityType || !args.entityId || !this.filterMatcher) return false;

    const scope = await this.filterScope(user, entityType);
    return this.filterMatcher.matchesUnscoped(entityType, args.entityId, args.filters, scope);
  }

  @BypassTenantGuard
  async canUserAccessUnscoped(args: RoutineEventAccessArgs & { companyId: string; userId: string }): Promise<boolean> {
    const user = await this.findActiveEventUser(args.companyId, args.userId);

    return user ? this.canUserAccess(user, args) : false;
  }

  private async filterScope(user: RoutineEventUser, entityType: EntityType) {
    const customColumns = (await this.prisma.customColumn.findMany({
      where: { companyId: user.companyId, entityType },
      select: { id: true, label: true, type: true, entityType: true, options: true },
    })) as unknown as CustomColumnDto[];
    const relationFields = RELATED_FILTER_FIELDS[entityType]
      .filter(({ resource }) => this.readAccess(user, resource))
      .map(({ field }) => ({ field, operators: FILTER_FIELD_DEFAULT_OPERATORS[field] }));
    const filterableFields = [
      ...relationFields,
      ...customColumns.map((column) => ({
        field: column.id,
        operators: CUSTOM_COLUMN_DEFAULT_OPERATORS[column.type],
        label: column.label,
      })),
      {
        field: FilterFieldKey.userIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.userIds],
      },
      {
        field: FilterFieldKey.updatedAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt],
      },
      {
        field: FilterFieldKey.createdAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt],
      },
    ];
    const access = this.readAccess(user, this.resourceFor(entityType));
    const readOwnUserId = access === "all" ? null : user.id;

    return { companyId: user.companyId, readOwnUserId, filterableFields, customColumns };
  }

  private async canUserAccess(user: RoutineEventUser, args: RoutineEventAccessArgs): Promise<boolean> {
    const entityType = entityTypeForEvent(args.event);
    if (entityType) return this.canAccessRecord(user, entityType, args);

    if (args.event.startsWith("messaging.")) return this.canAccessMessagingEvent(user, args);

    return false;
  }

  private async canAccessRecord(
    user: RoutineEventUser,
    entityType: EntityType,
    args: RoutineEventAccessArgs,
  ): Promise<boolean> {
    const resource = this.resourceFor(entityType);
    const access = this.readAccess(user, resource);
    if (!access || !args.entityId) return false;

    if (isRecordRemovalEvent(args.event)) {
      const envelope = this.objectValue(args.triggerPayload);
      if (envelope?.companyId !== user.companyId) return false;

      const record = this.eventBody(args.triggerPayload);
      if (!record || this.stringProperty(record, "id") !== args.entityId) return false;
      if (access === "all") return true;

      const users = record.users;
      return Array.isArray(users) && users.some((candidate) => this.referenceId(candidate) === user.id);
    }

    const own = access === "own" ? { users: { some: { userId: user.id } } } : {};
    const where = { id: args.entityId, companyId: user.companyId, ...own };

    if (entityType === EntityType.contact) return (await this.prisma.contact.count({ where })) > 0;
    if (entityType === EntityType.organization) return (await this.prisma.organization.count({ where })) > 0;
    if (entityType === EntityType.deal) return (await this.prisma.deal.count({ where })) > 0;
    if (entityType === EntityType.service) return (await this.prisma.service.count({ where })) > 0;

    return (await this.prisma.task.count({ where })) > 0;
  }

  private async canAccessMessagingEvent(user: RoutineEventUser, args: RoutineEventAccessArgs): Promise<boolean> {
    if (!this.readAccess(user, Resource.inboxMessages)) return false;

    const payload = this.eventBody(args.triggerPayload);
    const connectedAccountId = payload && this.stringProperty(payload, "connectedAccountId");
    if (!connectedAccountId) return false;

    if (MESSAGE_EVENTS.has(args.event)) return this.canAccessMessagingMessage(user, args, payload, connectedAccountId);
    if (CHAT_EVENTS.has(args.event)) return this.canAccessMessagingThread(user, args, connectedAccountId);

    return this.canAccessConnectedAccount(user, connectedAccountId);
  }

  private async canAccessMessagingMessage(
    user: RoutineEventUser,
    args: RoutineEventAccessArgs,
    payload: Record<string, unknown>,
    connectedAccountId: string,
  ): Promise<boolean> {
    const threadId = this.stringProperty(payload, "threadId");
    if (!args.entityId || !threadId) return false;

    const folderStates = await this.folderVisibilityStates(user.companyId, connectedAccountId);
    if (!folderStates) return false;

    return (
      (await this.prisma.messagingMessage.count({
        where: {
          id: args.entityId,
          companyId: user.companyId,
          connectedAccountId,
          messagingThreadId: threadId,
          thread: threadAccessWhere(user.companyId, user.id),
          ...messageVisibilityWhere(folderStates),
        },
      })) > 0
    );
  }

  private async canAccessMessagingThread(
    user: RoutineEventUser,
    args: RoutineEventAccessArgs,
    connectedAccountId: string,
  ): Promise<boolean> {
    if (!args.entityId) return false;

    const folderStates = await this.folderVisibilityStates(user.companyId, connectedAccountId);
    if (!folderStates) return false;

    return (
      (await this.prisma.messagingThread.count({
        where: {
          id: args.entityId,
          connectedAccountId,
          ...inboxThreadVisibilityWhere(user.companyId, user.id, folderStates),
        },
      })) > 0
    );
  }

  private async folderVisibilityStates(companyId: string, connectedAccountId: string) {
    const account = await this.prisma.connectedAccount.findFirst({
      where: { id: connectedAccountId, companyId },
      select: { id: true, selectedFolderIds: true, foldersSyncedAt: true },
    });
    if (!account) return null;

    return account.foldersSyncedAt === null ? [] : [{ id: account.id, visibleSet: account.selectedFolderIds }];
  }

  private async canAccessConnectedAccount(user: RoutineEventUser, connectedAccountId: string): Promise<boolean> {
    return (
      (await this.prisma.connectedAccount.count({
        where: { id: connectedAccountId, ...accessibleConnectedAccountWhere(user.companyId, user.id) },
      })) > 0
    );
  }

  private readAccess(user: RoutineEventUser, resource: Resource): "all" | "own" | null {
    if (!user.role) return null;
    if (user.role.isSystemRole) return "all";
    if (
      user.role.permissions.some(
        (permission) => permission.resource === resource && permission.action === Action.readAll,
      )
    )
      return "all";
    if (
      user.role.permissions.some(
        (permission) => permission.resource === resource && permission.action === Action.readOwn,
      )
    )
      return "own";

    return null;
  }

  private resourceFor(entityType: EntityType): Resource {
    if (entityType === EntityType.contact) return Resource.contacts;
    if (entityType === EntityType.organization) return Resource.organizations;
    if (entityType === EntityType.deal) return Resource.deals;
    if (entityType === EntityType.service) return Resource.services;

    return Resource.tasks;
  }

  private eventBody(triggerPayload: unknown): Record<string, unknown> | null {
    const envelope = this.objectValue(triggerPayload);
    const payload = envelope?.payload;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  }

  private objectValue(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  }

  private referenceId(value: unknown): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }

  private stringProperty(value: Record<string, unknown>, key: string): string | null {
    const property = value[key];
    return typeof property === "string" ? property : null;
  }

  private async findActiveEventUser(companyId: string, userId: string): Promise<RoutineEventUser | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, companyId, status: Status.active, role: { companyId } },
      select: {
        id: true,
        companyId: true,
        role: {
          select: {
            isSystemRole: true,
            permissions: { where: { companyId }, select: { resource: true, action: true } },
          },
        },
      },
    });
  }
}
