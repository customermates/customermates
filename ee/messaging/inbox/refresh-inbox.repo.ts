import type { ConnectedAccountStatus } from "@/generated/prisma";

export abstract class RefreshInboxRepo {
  abstract listAccountsForRefresh(): Promise<
    { id: string; userId: string; unipileAccountId: string; status: ConnectedAccountStatus }[]
  >;
  abstract claimBackfillUnscoped(unipileAccountId: string): Promise<string | null>;
  abstract releaseBackfillClaimUnscoped(unipileAccountId: string, token: string, complete: boolean): Promise<void>;
}
