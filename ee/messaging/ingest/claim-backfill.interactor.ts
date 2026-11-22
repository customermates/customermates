import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import type { ClaimBackfillRepo } from "./claim-backfill.repo";

const Schema = z.object({ connectedAccountId: z.uuid() });
type ClaimBackfillPayload = z.infer<typeof Schema>;

@SystemInteractor
export class ClaimBackfillInteractor {
  constructor(private repo: ClaimBackfillRepo) {}

  @Enforce(Schema)
  async invoke(payload: ClaimBackfillPayload): Promise<string | null> {
    const account = await this.repo.findAccountByIdUnscoped(payload.connectedAccountId);
    if (!account) return null;

    const token = await this.repo.claimBackfillUnscoped(account.id);
    if (!token) return null;

    await this.repo.markAccountSyncingUnscoped({ connectedAccountId: account.id, syncing: true });

    return token;
  }
}
