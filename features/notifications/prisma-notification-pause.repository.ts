import type { NotificationPauseRepo } from "./notification-pause.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaNotificationPauseRepo extends TenantRepository implements NotificationPauseRepo {
  async find(): Promise<Date | null> {
    const row = await this.prisma.notificationPause.findFirst({
      where: { companyId: this.companyId, userId: this.userId },
      select: { until: true },
    });
    return row?.until ?? null;
  }

  async save(until: Date): Promise<void> {
    await this.prisma.notificationPause.upsert({
      where: { companyId_userId: { companyId: this.companyId, userId: this.userId } },
      create: { companyId: this.companyId, userId: this.userId, until },
      update: { companyId: this.companyId, until },
    });
  }

  async clear(): Promise<void> {
    await this.prisma.notificationPause.deleteMany({ where: { companyId: this.companyId, userId: this.userId } });
  }

  @BypassTenantGuard
  async findUnscoped(companyId: string, userIds: string[]): Promise<Map<string, Date>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.notificationPause.findMany({
      where: { companyId, userId: { in: userIds } },
      select: { userId: true, until: true },
    });
    return new Map(rows.map((row) => [row.userId, row.until]));
  }
}
