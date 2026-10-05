import { ConnectedAccountStatus } from "@/generated/prisma";

const RECONNECT_REQUIRED = new Set<ConnectedAccountStatus>([
  ConnectedAccountStatus.credentials,
  ConnectedAccountStatus.permissions,
]);

export function accountNeedsReconnect(account: { status: ConnectedAccountStatus }): boolean {
  return RECONNECT_REQUIRED.has(account.status);
}
