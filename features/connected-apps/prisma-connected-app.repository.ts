import type { ConnectedAppGrant, ConnectedAppRepo } from "./connected-app.repo";

import { TenantRepository } from "@/core/base/tenant-repository";

export class PrismaConnectedAppRepo extends TenantRepository implements ConnectedAppRepo {
  async findGrantsOfLogin(authUserId: string): Promise<ConnectedAppGrant[]> {
    const groups = await this.prisma.oauthAccessToken.groupBy({
      by: ["clientId"],
      where: { userId: authUserId, companyId: this.companyId },
      _min: { createdAt: true },
      _max: { updatedAt: true, refreshTokenExpiresAt: true },
    });
    if (!groups.length) return [];

    const applications = await this.prisma.oauthApplication.findMany({
      where: { clientId: { in: groups.map((group) => group.clientId) } },
      select: { clientId: true, name: true },
    });
    const names = new Map(applications.map((application) => [application.clientId, application.name]));

    return groups.flatMap((group) => {
      const name = names.get(group.clientId);
      const connectedAt = group._min.createdAt;
      const lastActiveAt = group._max.updatedAt;
      const refreshableUntil = group._max.refreshTokenExpiresAt;
      if (name === undefined || !connectedAt || !lastActiveAt || !refreshableUntil) return [];

      return [{ clientId: group.clientId, name, connectedAt, lastActiveAt, refreshableUntil }];
    });
  }
}
