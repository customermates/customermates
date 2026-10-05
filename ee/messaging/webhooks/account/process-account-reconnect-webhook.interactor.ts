import { z } from "zod";
import * as Sentry from "@sentry/node";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import type { MessagingService } from "../../messaging.service";

import { mapUnipileStatus } from "../../unipile.mappers";
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

    let status: ConnectedAccountStatus = ConnectedAccountStatus.ok;
    let confirmed = false;
    try {
      const snapshot = await this.messagingService.getAccount(account.unipileAccountId);
      status = mapUnipileStatus(snapshot.status);
      confirmed = true;
    } catch (err) {
      if (!(err instanceof z.ZodError)) throw err;

      Sentry.captureException(err, { tags: { unipileAccountId: account.unipileAccountId } });
    }

    await this.accountRepo.updateAccountUnscoped({
      unipileAccountId: account.unipileAccountId,
      status,
    });

    await this.backgroundTaskService.dispatch("backfill-connected-account", { connectedAccountId: account.id });

    if (confirmed && status === ConnectedAccountStatus.ok) {
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
