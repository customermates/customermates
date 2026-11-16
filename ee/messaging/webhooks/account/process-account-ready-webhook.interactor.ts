import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import type { AccountWebhookRepo } from "./account-webhook.repo";
import type { MessagingService } from "../../messaging.service";
import { deriveAccountConnection } from "../../account-connection";
import { AccountConnectionDetailsSchema } from "../../account-connection.schema";

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
    private messagingService: MessagingService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdUnscoped(envelope.account_id);
    if (!account || account.status === ConnectedAccountStatus.deleted) return;

    const checkedAt = new Date();
    const snapshot = await this.messagingService.getAccount(account.unipileAccountId);
    const connection = deriveAccountConnection(
      snapshot,
      undefined,
      AccountConnectionDetailsSchema.nullable().catch(null).parse(account.connectionDetails),
      checkedAt,
    );
    const updated = await this.accountRepo.updateAccountUnscoped({
      unipileAccountId: account.unipileAccountId,
      ...connection,
      syncing: connection.status === ConnectedAccountStatus.ok,
    });
    if (updated === null) return;

    if (connection.status === ConnectedAccountStatus.ok)
      await this.backgroundTaskService.dispatch("backfill-connected-account", { connectedAccountId: account.id });
  }
}
