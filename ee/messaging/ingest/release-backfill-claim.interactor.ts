import type { ConnectedAccount } from "@/generated/prisma";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

export abstract class ReleaseBackfillClaimRepo {
  abstract findAccountByIdUnscoped(id: string): Promise<ConnectedAccount | null>;
  abstract releaseBackfillClaimUnscoped(unipileAccountId: string, token: string): Promise<void>;
}

const Schema = z.object({
  connectedAccountId: z.uuid(),
  token: z.string(),
});
type ReleaseBackfillClaimPayload = z.infer<typeof Schema>;

@SystemInteractor
export class ReleaseBackfillClaimInteractor {
  constructor(private repo: ReleaseBackfillClaimRepo) {}

  @Enforce(Schema)
  async invoke(payload: ReleaseBackfillClaimPayload): Promise<void> {
    const account = await this.repo.findAccountByIdUnscoped(payload.connectedAccountId);
    if (!account) return;

    await this.repo.releaseBackfillClaimUnscoped(account.unipileAccountId, payload.token);
  }
}
