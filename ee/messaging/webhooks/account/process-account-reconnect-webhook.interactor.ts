import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import type { MessagingService } from "../../messaging.service";

import { deriveAccountConnection } from "../../account-connection";
import { AccountConnectionDetailsSchema } from "../../account-connection.schema";
import type { AccountWebhookRepo } from "./account-webhook.repo";
import type { EventService } from "@/features/event/event.service";
import { DomainEvent } from "@/features/event/domain-events";

const Schema = z.object({
  type: z.literal("account.reconnect"),
  account_id: z.string(),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessAccountReconnectWebhookInteractor {
  constructor(
    private messagingService: MessagingService,
    private accountRepo: AccountWebhookRepo,
    private backgroundTaskService: BackgroundTaskService,
    private eventService: EventService,
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
    });
    if (updated === null) return;

    await this.backgroundTaskService.dispatch("backfill-connected-account", { connectedAccountId: account.id });

    if (connection.status === ConnectedAccountStatus.ok) {
      await this.eventService.publish(
        DomainEvent.CONNECTED_ACCOUNT_RECONNECTED,
        {
          entityId: account.id,
          payload: { provider: account.provider, displayName: account.displayName, emailAddress: account.emailAddress },
        },
        { systemCompanyId: account.companyId, systemUserId: account.userId },
      );
    }
  }
}
