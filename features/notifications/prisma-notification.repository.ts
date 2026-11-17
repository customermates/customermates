import type { NotificationEmailMode, NotificationKind } from "@/generated/prisma";
import type {
  DigestSelection,
  DigestUserPage,
  EmailDelivery,
  InboxCursor,
  InstantEmailCount,
  NotificationCursor,
  NotificationInsert,
  NotificationPreferenceRow,
  NotificationRecipient,
  NotificationRepo,
  PendingEmailNotification,
  StoredNotification,
} from "./notification.repo";

import { Prisma, Status } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

import {
  DEFAULT_NOTIFICATION_EMAIL_MODES,
  NOTIFICATION_DIGEST_LIMIT,
  NOTIFICATION_KINDS,
} from "./notification.schema";
import { preferenceVersionOf } from "./notification-unsubscribe-token";

const NOTIFICATION_SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  href: true,
  readAt: true,
  createdAt: true,
} as const;

const PENDING_SELECT = { ...NOTIFICATION_SELECT, companyId: true, userId: true, sourceRuleId: true } as const;

export class PrismaNotificationRepo extends TenantRepository implements NotificationRepo {
  private ownedWhere(): Prisma.NotificationWhereInput {
    return { companyId: this.companyId, userId: this.userId };
  }

  findInbox(args: { limit: number; unreadOnly: boolean; before: InboxCursor | null }): Promise<StoredNotification[]> {
    const { before } = args;
    const olderThan: Prisma.NotificationWhereInput = before
      ? before.id === null
        ? { createdAt: { lt: before.createdAt } }
        : { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { gt: before.id } }] }
      : {};
    return this.prisma.notification.findMany({
      where: {
        ...this.ownedWhere(),
        ...(args.unreadOnly ? { readAt: null } : {}),
        ...olderThan,
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
        update: { companyId: this.companyId, emailMode: preference.emailMode },
      });
    }
  }

  private async withRuleNames(
    companyId: string,
    rows: (StoredNotification & { companyId: string; userId: string; sourceRuleId: string | null })[],
  ): Promise<PendingEmailNotification[]> {
    const ruleIds = [...new Set(rows.flatMap((row) => (row.sourceRuleId ? [row.sourceRuleId] : [])))];
    const rules =
      ruleIds.length === 0
        ? []
        : await this.prisma.automationRule.findMany({
            where: { companyId, id: { in: ruleIds } },
            select: { id: true, name: true },
          });
    const names = new Map(rules.map((rule) => [rule.id, rule.name]));
    return rows.map((row) => ({
      ...row,
      sourceRuleName: row.sourceRuleId ? (names.get(row.sourceRuleId) ?? null) : null,
    }));
  }

  @BypassTenantGuard
  async saveEmailModeUnscoped(
    companyId: string,
    userId: string,
    kind: NotificationKind,
    emailMode: NotificationEmailMode,
  ): Promise<void> {
    await this.prisma.notificationPreference.upsert({
      where: { companyId_userId_kind: { companyId, userId, kind } },
      create: { companyId, userId, kind, emailMode },
      update: { emailMode },
    });
  }

  @BypassTenantGuard
  async insertManyUnscoped(companyId: string, rows: NotificationInsert[]): Promise<string[]> {
    const own = rows.filter((row) => row.companyId === companyId);
    if (own.length === 0) return [];
    await this.prisma.notification.createMany({ data: own, skipDuplicates: true });
    const stored = await this.prisma.notification.findMany({
      where: { companyId, id: { in: own.map((row) => row.id) } },
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
        company: { select: { slug: true, name: true } },
      },
    });
    return users.map(({ company, ...user }) => ({
      ...user,
      workspaceSlug: company.slug,
      workspaceName: company.name?.trim() || company.slug,
    }));
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
  async findPreferenceVersionsUnscoped(companyId: string, userId: string): Promise<Map<NotificationKind, number>> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { companyId, userId },
      select: { kind: true, updatedAt: true },
    });
    return new Map(rows.map((row) => [row.kind, preferenceVersionOf(row.updatedAt)]));
  }

  @BypassTenantGuard
  async findNotificationsUnscoped(companyId: string, ids: string[]): Promise<PendingEmailNotification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { companyId, id: { in: ids } },
      select: PENDING_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return this.withRuleNames(companyId, rows);
  }

  @BypassTenantGuard
  async markEmailedUnscoped(companyId: string, ids: string[], now: Date, delivery: EmailDelivery): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.notification.updateMany({
      where: { companyId, id: { in: ids } },
      data: { emailedAt: now, emailedInstantly: delivery === "instant" },
    });
  }

  @BypassTenantGuard
  async countInstantEmailsSinceUnscoped(
    companyId: string,
    userIds: string[],
    since: Date,
  ): Promise<InstantEmailCount[]> {
    if (userIds.length === 0) return [];
    const groups = await this.prisma.notification.groupBy({
      by: ["userId"],
      where: { companyId, userId: { in: userIds }, emailedInstantly: true, emailedAt: { gte: since } },
      _count: { _all: true },
    });
    return groups.map((group) => ({ userId: group.userId, count: group._count._all }));
  }

  @BypassTenantGuard
  async findDigestUsersUnscoped(args: {
    since: Date;
    limit: number;
    after: NotificationCursor | null;
  }): Promise<DigestUserPage> {
    const { after } = args;
    const rows = await this.prisma.notification.findMany({
      where: {
        emailedAt: null,
        readAt: null,
        createdAt: { gte: args.since },
        ...(after
          ? { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] }
          : {}),
      },
      select: { id: true, companyId: true, userId: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: args.limit,
    });
    const users = new Map(rows.map((row) => [`${row.companyId}:${row.userId}`, row]));
    const last = rows.at(-1);
    return {
      users: [...users.values()].map(({ companyId, userId }) => ({ companyId, userId })),
      next: rows.length === args.limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  @BypassTenantGuard
  async findInstantFallbackUsersUnscoped(args: {
    since: Date;
    before: Date;
    now: Date;
    limit: number;
  }): Promise<{ companyId: string; userId: string }[]> {
    const instantByDefault = NOTIFICATION_KINDS.filter((kind) => DEFAULT_NOTIFICATION_EMAIL_MODES[kind] === "instant");
    const rows = await this.prisma.$queryRaw<Array<{ companyId: string; userId: string }>>(Prisma.sql`
      SELECT n."companyId", n."userId"
      FROM "Notification" n
      LEFT JOIN "NotificationPreference" p
        ON p."companyId" = n."companyId" AND p."userId" = n."userId" AND p."kind" = n."kind"
      LEFT JOIN "NotificationPause" z
        ON z."companyId" = n."companyId" AND z."userId" = n."userId"
      WHERE n."emailedAt" IS NULL
        AND n."readAt" IS NULL
        AND n."createdAt" >= ${args.since}
        AND n."createdAt" <= ${args.before}
        AND (z."until" IS NULL OR z."until" <= ${args.now})
        AND COALESCE(
          p."emailMode"::text,
          CASE WHEN n."kind"::text = ANY(${instantByDefault}::text[]) THEN 'instant' ELSE 'digest' END
        ) = 'instant'
      GROUP BY n."companyId", n."userId"
      ORDER BY MIN(n."createdAt") ASC, n."companyId" ASC, n."userId" ASC
      LIMIT ${args.limit}
    `);
    return rows.map(({ companyId, userId }) => ({ companyId, userId }));
  }

  @BypassTenantGuard
  async findUnemailedUnscoped(
    companyId: string,
    userId: string,
    selection: DigestSelection,
  ): Promise<PendingEmailNotification[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        companyId,
        userId,
        emailedAt: null,
        readAt: null,
        createdAt: { gte: selection.since },
        OR: [
          { kind: { in: selection.digestKinds } },
          { kind: { in: selection.instantKinds }, createdAt: { lte: selection.instantBefore } },
        ],
      },
      select: PENDING_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: NOTIFICATION_DIGEST_LIMIT,
    });
    return this.withRuleNames(companyId, rows);
  }

  @BypassTenantGuard
  async pruneUnscoped(before: Date, limit: number): Promise<number> {
    const expired = await this.prisma.notification.findMany({
      where: { createdAt: { lt: before } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    const result = await this.prisma.notification.deleteMany({ where: { id: { in: expired.map((row) => row.id) } } });
    return result.count;
  }
}
