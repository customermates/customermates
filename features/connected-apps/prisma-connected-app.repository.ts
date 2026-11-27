import type { ConnectedAppGrant, ConnectedAppRepo } from "./connected-app.repo";

import { TenantRepository } from "@/core/base/tenant-repository";

const DEVICE_MAX_LENGTH = 80;

function deviceOf(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (!parsed || typeof parsed !== "object" || !("device" in parsed)) return null;
    const device = parsed.device;
    return typeof device === "string" && device.trim() ? device.trim().slice(0, DEVICE_MAX_LENGTH) : null;
  } catch {
    return null;
  }
}

export class PrismaConnectedAppRepo extends TenantRepository implements ConnectedAppRepo {
  async findGrantsOfLogin(authUserId: string): Promise<ConnectedAppGrant[]> {
    const groups = await this.prisma.oauthAccessToken.groupBy({
      by: ["clientId"],
      where: { userId: authUserId },
      _min: { createdAt: true },
      _max: { updatedAt: true, refreshTokenExpiresAt: true },
    });
    if (!groups.length) return [];

    const [applications, accountWideTokens] = await Promise.all([
      this.prisma.oauthApplication.findMany({
        where: { clientId: { in: groups.map((group) => group.clientId) } },
        select: { clientId: true, name: true, metadata: true },
      }),
      this.prisma.oauthAccessToken.findMany({
        where: { userId: authUserId, companyId: null },
        distinct: ["clientId"],
        select: { clientId: true },
      }),
    ]);
    const names = new Map(applications.map((application) => [application.clientId, application.name]));
    const devices = new Map(applications.map((application) => [application.clientId, deviceOf(application.metadata)]));
    const accountWide = new Set(accountWideTokens.map((token) => token.clientId));

    return groups.flatMap((group) => {
      const name = names.get(group.clientId);
      const connectedAt = group._min.createdAt;
      const lastActiveAt = group._max.updatedAt;
      const refreshableUntil = group._max.refreshTokenExpiresAt;
      if (name === undefined || !connectedAt || !lastActiveAt || !refreshableUntil) return [];

      const device = devices.get(group.clientId) ?? null;

      return [
        {
          clientId: group.clientId,
          name,
          device,
          accountWide: accountWide.has(group.clientId),
          connectedAt,
          lastActiveAt,
          refreshableUntil,
        },
      ];
    });
  }
}
