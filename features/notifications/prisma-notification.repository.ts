import type { NotificationEmailMode, NotificationKind, Prisma } from "@/generated/prisma";
import type {
  NotificationInsert,
  NotificationPreferenceRow,
  NotificationRecipient,
  NotificationRepo,
  PendingEmailNotification,
  StoredNotification,
} from "./notification.repo";

import { Status } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

const NOTIFICATION_SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  href: true,
  readAt: true,
  createdAt: true,
} as const;

const PENDING_SELECT = { ...NOTIFICATION_SELECT, companyId: true, userId: true } as const;

export class PrismaNotificationRepo extends TenantRepository implements NotificationRepo {
  private ownedWhere(): Prisma.NotificationWhereInput {
    return { companyId: this.companyId, userId: this.userId };
  }

  findInbox(args: { limit: number; unreadOnly: boolean; before: Date | null }): Promise<StoredNotification[]> {
    return this.prisma.notification.findMany({
      where: {
        ...this.ownedWhere(),
        ...(args.unreadOnly ? { readAt: null } : {}),
        ...(args.before ? { createdAt: { lt: args.before } } : {}),
      },
      select: NOTIFICATION_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: args.limit,
    });
  }

  countUnread(): Promise<number> {
    return this.prisma.notification.count({ where: { ...this.ownedWhere(), readAt: null } });
  }

  async markRead(ids: string[], now: Date): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { companyId: this.companyId, userId: this.userId, id: { in: ids }, readAt: null },
      data: { readAt: now },
    });
    return result.count;
  }

  async markAllRead(now: Date): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { companyId: this.companyId, userId: this.userId, readAt: null },
      data: { readAt: now },
    });
    return result.count;
  }

  findPreferences(): Promise<NotificationPreferenceRow[]> {
    return this.prisma.notificationPreference.findMany({
      where: { companyId: this.companyId, userId: this.userId },
      select: { kind: true, emailMode: true },
    });
  }

  async savePreferences(preferences: NotificationPreferenceRow[]): Promise<void> {
    for (const preference of preferences) {
      await this.prisma.notificationPreference.upsert({
        where: {
          companyId_userId_kind: { companyId: this.companyId, userId: this.userId, kind: preference.kind },
        },
        create: { companyId: this.companyId, userId: this.userId, ...preference },
        update: { emailMode: preference.emailMode },
      });
    }
  }

  @BypassTenantGuard
  async insertManyUnscoped(rows: NotificationInsert[]): Promise<string[]> {
    if (rows.length === 0) return [];
    await this.prisma.notification.createMany({ data: rows, skipDuplicates: true });
    const stored = await this.prisma.notification.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      select: { id: true },
    });
    return stored.map((row) => row.id);
  }

  @BypassTenantGuard
  async findRecipientsUnscoped(companyId: string, userIds: string[]): Promise<NotificationRecipient[]> {
    const users = await this.prisma.user.findMany({
      where: { companyId, id: { in: userIds }, status: Status.active },
      select: {
        id: true,
        email: true,
        firstName: true,
        displayLanguage: true,
        company: { select: { slug: true } },
      },
    });
    return users.map(({ company, ...user }) => ({ ...user, workspaceSlug: company.slug }));
  }

  @BypassTenantGuard
  async findPreferencesUnscoped(companyId: string, userIds: string[]) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { companyId, userId: { in: userIds } },
      select: { userId: true, kind: true, emailMode: true },
    });
    const byUser = new Map<string, Map<NotificationKind, NotificationEmailMode>>();
    for (const row of rows) {
      const modes = byUser.get(row.userId) ?? new Map<NotificationKind, NotificationEmailMode>();
      modes.set(row.kind, row.emailMode);
      byUser.set(row.userId, modes);
    }
    return byUser;
  }

  @BypassTenantGuard
  findNotificationsUnscoped(companyId: string, ids: string[]): Promise<PendingEmailNotification[]> {
    return this.prisma.notification.findMany({
      where: { companyId, id: { in: ids } },
      select: PENDING_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  @BypassTenantGuard
  async markEmailedUnscoped(ids: string[], now: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.notification.updateMany({ where: { id: { in: ids } }, data: { emailedAt: now } });
  }

  @BypassTenantGuard
  async findDigestUsersUnscoped(since: Date, limit: number) {
    const groups = await this.prisma.notification.groupBy({
      by: ["companyId", "userId"],
      where: { emailedAt: null, readAt: null, createdAt: { gte: since } },
      orderBy: [{ companyId: "asc" }, { userId: "asc" }],
      take: limit,
    });
    return groups.map((group) => ({ companyId: group.companyId, userId: group.userId }));
  }

  @BypassTenantGuard
  findUnemailedUnscoped(companyId: string, userId: string, since: Date): Promise<PendingEmailNotification[]> {
    return this.prisma.notification.findMany({
      where: { companyId, userId, emailedAt: null, readAt: null, createdAt: { gte: since } },
      select: PENDING_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
  }

  @BypassTenantGuard
  async pruneUnscoped(before: Date): Promise<number> {
    const result = await this.prisma.notification.deleteMany({ where: { createdAt: { lt: before } } });
    return result.count;
  }
}
