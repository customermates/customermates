import type { ConnectedAccount } from "@/generated/prisma";
import type { AccountConnectionUpdate } from "../account-connection";

export abstract class RefreshConnectedAccountStatusesRepo {
  abstract findAccountsNeedingStatusRefreshUnscoped(
    before: Date,
  ): Promise<Array<{ unipileAccountId: string; connectionDetails: unknown }>>;
  abstract updateAccountUnscoped(
    args: AccountConnectionUpdate & { unipileAccountId: string; syncing?: boolean },
  ): Promise<ConnectedAccount | null>;
}
