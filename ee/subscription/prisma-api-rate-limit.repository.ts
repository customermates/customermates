import type { ApiRateLimitCount, ApiRateLimitRepo, ApiRateLimitWindowKind } from "./api-rate-limit.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaApiRateLimitRepo extends TenantRepository implements ApiRateLimitRepo {
  @BypassTenantGuard
  async incrementWindowsUnscoped(
    companyId: string,
    windows: Array<{ window: ApiRateLimitWindowKind; windowStart: Date }>,
  ): Promise<ApiRateLimitCount[]> {
    return Promise.all(
      windows.map(async ({ window, windowStart }) => {
        const row = await this.prisma.apiRateLimitWindow.upsert({
          where: { companyId_window_windowStart: { companyId, window, windowStart } },
          create: { companyId, window, windowStart, count: 1 },
          update: { count: { increment: 1 } },
          select: { count: true },
        });
        return { window, count: row.count };
      }),
    );
  }

  @BypassTenantGuard
  async pruneWindowsUnscoped(companyId: string, before: Date): Promise<void> {
    await this.prisma.apiRateLimitWindow.deleteMany({ where: { companyId, windowStart: { lt: before } } });
  }
}
