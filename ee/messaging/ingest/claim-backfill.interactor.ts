import type { ConnectedAccount } from "@/generated/prisma";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

export abstract class ClaimBackfillRepo {
  abstract findAccountByIdUnscoped(id: string): Promise<ConnectedAccount | null>;
  abstract claimBackfillUnscoped(unipileAccountId: string): Promise<string | null>;
  abstract markAccountSyncingUnscoped(args: { unipileAccountId: string; syncing: boolean }): Promise<void>;
}

const Schema = z.object({ connectedAccountId: z.uuid() });
type ClaimBackfillPayload = z.infer<typeof Schema>;

@SystemInteractor
export class ClaimBackfillInteractor {
  constructor(private repo: ClaimBackfillRepo) {}

  @Enforce(Schema)
  async invoke(payload: ClaimBackfillPayload): Promise<string | null> {
    const account = await this.repo.findAccountByIdUnscoped(payload.connectedAccountId);
    if (!account) return null;

    const token = await this.repo.claimBackfillUnscoped(account.unipileAccountId);
    if (!token) return null;

    await this.repo.markAccountSyncingUnscoped({ unipileAccountId: account.unipileAccountId, syncing: true });

    return token;
  }
}
