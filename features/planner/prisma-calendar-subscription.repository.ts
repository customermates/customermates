import type { CalendarSubscriptionRepo, CalendarSubscription } from "./planner.repo";
import type { PlannerConfig } from "./planner.schema";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { PlannerConfigSchema } from "./planner.schema";

export class PrismaCalendarSubscriptionRepo extends TenantRepository implements CalendarSubscriptionRepo {
  async create(tokenHash: string, config: PlannerConfig, includePersonalEvents: boolean) {
    const row = await this.prisma.calendarSubscription.create({
      data: { companyId: this.companyId, userId: this.userId, tokenHash, config, includePersonalEvents },
    });
    return { ...row, config };
  }
  list() {
    return this.prisma.calendarSubscription.findMany({
      where: { companyId: this.companyId, userId: this.userId },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }
  async revoke(id: string) {
    await this.prisma.calendarSubscription.deleteMany({
      where: { id, companyId: this.companyId, userId: this.userId },
    });
  }
  @BypassTenantGuard
  async findByTokenHashUnscoped(tokenHash: string): Promise<CalendarSubscription | null> {
    const row = await this.prisma.calendarSubscription.findUnique({ where: { tokenHash } });
    const parsed = PlannerConfigSchema.safeParse(row?.config);
    return row && parsed.success ? { ...row, config: parsed.data } : null;
  }
}
