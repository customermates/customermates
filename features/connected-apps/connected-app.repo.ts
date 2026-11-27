export type ConnectedAppGrant = {
  clientId: string;
  name: string;
  device: string | null;
  accountWide: boolean;
  connectedAt: Date;
  lastActiveAt: Date;
  refreshableUntil: Date;
};

export abstract class ConnectedAppRepo {
  abstract findGrantsOfLogin(authUserId: string): Promise<ConnectedAppGrant[]>;
}
