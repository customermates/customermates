import type { ConnectedAppGrant, ConnectedAppRepo } from "../connected-app.repo";

import { getTenantUser } from "@/core/decorators/tenant-context";

export type FakeOauthToken = {
  userId: string;
  companyId: string | null;
  clientId: string;
  createdAt: Date;
  updatedAt: Date;
  refreshTokenExpiresAt: Date;
};

export class FakeConnectedAppRepo implements ConnectedAppRepo {
  readonly askedFor: string[] = [];

  constructor(
    private readonly tokens: FakeOauthToken[],
    private readonly names: Record<string, string>,
  ) {}

  findGrantsOfLogin(authUserId: string): Promise<ConnectedAppGrant[]> {
    this.askedFor.push(authUserId);
    getTenantUser();
    const grants = new Map<string, ConnectedAppGrant>();
    for (const token of this.tokens) {
      if (token.userId !== authUserId) continue;

      const grant = grants.get(token.clientId);
      grants.set(token.clientId, {
        clientId: token.clientId,
        name: this.names[token.clientId] ?? token.clientId,
        device: null,
        connectedAt: grant && grant.connectedAt < token.createdAt ? grant.connectedAt : token.createdAt,
        lastActiveAt: grant && grant.lastActiveAt > token.updatedAt ? grant.lastActiveAt : token.updatedAt,
        refreshableUntil:
          grant && grant.refreshableUntil > token.refreshTokenExpiresAt
            ? grant.refreshableUntil
            : token.refreshTokenExpiresAt,
      });
    }

    return Promise.resolve([...grants.values()]);
  }
}
