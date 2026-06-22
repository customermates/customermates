import type { ConnectedAccount } from "@/generated/prisma";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

export abstract class ReleaseBackfillClaimRepo {
  abstract findAccountByIdOrThrowUnscoped(id: string): Promise<ConnectedAccount>;
  abstract releaseBackfillClaimUnscoped(unipileAccountId: string, token: string): Promise<void>;
}

const ReleaseBackfillClaimPayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  token: z.string(),
});
export type ReleaseBackfillClaimPayload = z.infer<typeof ReleaseBackfillClaimPayloadSchema>;

@SystemInteractor
export class ReleaseBackfillClaimInteractor {
  constructor(private repo: ReleaseBackfillClaimRepo) {}

  @Enforce(ReleaseBackfillClaimPayloadSchema)
  async invoke(payload: ReleaseBackfillClaimPayload): Promise<void> {
    const account = await this.repo.findAccountByIdOrThrowUnscoped(payload.connectedAccountId);
    await this.repo.releaseBackfillClaimUnscoped(account.unipileAccountId, payload.token);
  }
}
