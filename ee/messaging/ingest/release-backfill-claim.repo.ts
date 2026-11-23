import type { ConnectedAccount } from "@/generated/prisma";

export abstract class ReleaseBackfillClaimRepo {
  abstract findAccountByIdUnscoped(id: string): Promise<ConnectedAccount | null>;
  abstract releaseBackfillClaimUnscoped(connectedAccountId: string, token: string, complete: boolean): Promise<void>;
}
