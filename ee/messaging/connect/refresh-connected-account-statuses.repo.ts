import type { ConnectedAccount } from "@/generated/prisma";
import type { AccountConnectionUpdate } from "../account-connection";

export abstract class RefreshConnectedAccountStatusesRepo {
  abstract findAccountsNeedingStatusRefreshUnscoped(
    before: Date,
    limit: number,
  ): Promise<Array<{ unipileAccountId: string; connectionDetails: unknown }>>;
  abstract markStatusRefreshAttemptedUnscoped(unipileAccountId: string, attemptedAt: Date): Promise<void>;
  abstract updateAccountUnscoped(
    args: AccountConnectionUpdate & { unipileAccountId: string; syncing?: boolean },
  ): Promise<ConnectedAccount | null>;
}
