import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { AccountWebhookRepo } from "./account-webhook.repo";

const Schema = z.object({
  type: z.enum(["account.initial_sync.running", "account.initial_sync.failed"]),
  account_id: z.string(),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessProviderSyncWebhookInteractor {
  constructor(private accountRepo: AccountWebhookRepo) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(envelope.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    const providerSyncing = envelope.type === "account.initial_sync.running";

    await this.accountRepo.updateAccountUnscoped({ unipileAccountId: account.unipileAccountId, providerSyncing });
  }
}
