import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import type { AccountWebhookRepo } from "./account-webhook.repo";

const Schema = z.object({
  type: z.literal("account.initial_sync.completed"),
  account_id: z.string(),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessAccountReadyWebhookInteractor {
  constructor(
    private accountRepo: AccountWebhookRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdUnscoped(envelope.account_id);
    if (!account || account.status === ConnectedAccountStatus.deleted) return;

    await this.accountRepo.updateAccountUnscoped({
      unipileAccountId: account.unipileAccountId,
      status: ConnectedAccountStatus.ok,
      syncing: true,
    });

    await this.backgroundTaskService.dispatch("backfill-connected-account", { connectedAccountId: account.id });
  }
}
