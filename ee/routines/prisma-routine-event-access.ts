import { roleReadScope } from "@/core/base/permission.service";
import type { Filter } from "@/core/base/base-get.schema";
import { Resource, Status } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import {
  accessibleConnectedAccountWhere,
  inboxThreadVisibilityWhere,
  messageVisibilityWhere,
  threadAccessWhere,
} from "@/ee/messaging/messaging-access";
import { RecordDeliveryEnvelopeSchema } from "@/features/records/record-delivery.schema";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import type {
  CurrentRoutineTrigger,
  RoutineEventAccess,
  RoutineEventAccessArgs,
  RoutineEventUser,
} from "./routine-event-access";
import { MESSAGE_EVENTS, CHAT_EVENTS } from "./routine-event-access";

export class PrismaRoutineEventAccess extends TenantRepository implements RoutineEventAccess {
  constructor(private readonly records: RecordRecipientReader) {
    super();
  }

  async matchesCurrentUser(args: RoutineEventAccessArgs & { filters: Filter[] }): Promise<boolean> {
    return (await this.currentUserTrigger(args)) !== null;
  }

  async currentUserTrigger(
    args: RoutineEventAccessArgs & { filters: Filter[] },
  ): Promise<CurrentRoutineTrigger | null> {
    if (args.event.startsWith("record.")) {
      const envelope = await this.readRecordEvent(args, this.companyId, this.userId);
      return envelope ? { payload: envelope } : null;
    }
    return args.filters.length === 0 && (await this.canUserAccess(this.user, args))
      ? { payload: args.triggerPayload }
      : null;
  }

  @BypassTenantGuard
  async matchesUserUnscoped(
    args: RoutineEventAccessArgs & {
      companyId: string;
      userId: string;
      filters: Filter[];
    },
  ): Promise<boolean> {
    if (args.event.startsWith("record.")) return this.matchesRecordEvent(args, args.companyId, args.userId);
    const user = await this.findActiveEventUser(args.companyId, args.userId);
    if (!user) return false;
    return args.filters.length === 0 && this.canUserAccess(user, args);
  }

  @BypassTenantGuard
  async canUserAccessUnscoped(args: RoutineEventAccessArgs & { companyId: string; userId: string }): Promise<boolean> {
    if (args.event.startsWith("record.")) return this.matchesRecordEvent(args, args.companyId, args.userId);
    const user = await this.findActiveEventUser(args.companyId, args.userId);

    return user ? this.canUserAccess(user, args) : false;
  }

  private async matchesRecordEvent(args: RoutineEventAccessArgs, companyId: string, userId: string) {
    return (await this.readRecordEvent(args, companyId, userId)) !== null;
  }

  private async readRecordEvent(args: RoutineEventAccessArgs, companyId: string, userId: string) {
    const parsed = RecordDeliveryEnvelopeSchema.safeParse(args.triggerPayload);
    if (
      !parsed.success ||
      parsed.data.companyId !== companyId ||
      parsed.data.event !== args.event ||
      parsed.data.record.ref.recordId !== args.entityId
    )
      return null;
    return this.records.readEvent({
      companyId,
      userId,
      eventId: parsed.data.id,
      query: args.recordQuery,
      subscriptionId: args.subscriptionId,
      recheckSubscriptionSources: true,
    });
  }

  private async canUserAccess(user: RoutineEventUser, args: RoutineEventAccessArgs): Promise<boolean> {
    if (args.event.startsWith("messaging.")) return this.canAccessMessagingEvent(user, args);

    return false;
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
        where: {
          id: connectedAccountId,
          ...accessibleConnectedAccountWhere(user.companyId, user.id),
        },
      })) > 0
    );
  }

  private readAccess(user: RoutineEventUser, resource: Resource): "all" | "own" | null {
    const scope = roleReadScope(user.role, resource);
    return scope === "none" ? null : scope;
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

  private stringProperty(value: Record<string, unknown>, key: string): string | null {
    const property = value[key];
    return typeof property === "string" ? property : null;
  }

  private async findActiveEventUser(companyId: string, userId: string): Promise<RoutineEventUser | null> {
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId,
        status: Status.active,
        role: { companyId },
      },
      select: {
        id: true,
        companyId: true,
        role: {
          select: {
            isSystemRole: true,
            permissions: {
              where: { companyId },
              select: { resource: true, action: true },
            },
          },
        },
      },
    });
  }
}
