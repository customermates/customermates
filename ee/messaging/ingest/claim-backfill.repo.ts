import type { ConnectedAccount } from "@/generated/prisma";

export abstract class ClaimBackfillRepo {
  abstract findAccountByIdUnscoped(id: string): Promise<ConnectedAccount | null>;
  abstract claimBackfillUnscoped(connectedAccountId: string): Promise<string | null>;
  abstract markAccountSyncingUnscoped(args: { connectedAccountId: string; syncing: boolean }): Promise<void>;
}
