import type { ConnectedAccount } from "@/generated/prisma";
import type { MessagingService } from "../messaging.service";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { DomainEvent } from "@/features/event/domain-events";

const Schema = z.object({ id: z.uuid() });
type ResyncConnectedAccountData = Data<typeof Schema>;

export abstract class ResyncConnectedAccountRepo {
  abstract findAccountByIdOrThrow(id: string): Promise<ConnectedAccount>;
  abstract resetBackfillCheckpointUnscoped(unipileAccountId: string): Promise<void>;
  abstract markAccountSyncingUnscoped(args: { unipileAccountId: string; syncing: boolean }): Promise<void>;
  abstract claimBackfillUnscoped(unipileAccountId: string): Promise<string | null>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class ResyncConnectedAccountInteractor extends AuthenticatedInteractor<ResyncConnectedAccountData, null> {
  constructor(
    private repo: ResyncConnectedAccountRepo,
    private messagingService: MessagingService,
    private backgroundTaskService: BackgroundTaskService,
    private eventService: EventService,
  ) {
    super();
  }

  @Enforce(Schema)
  async invoke(data: ResyncConnectedAccountData): Promise<{ ok: true; data: null }> {
    const account = await this.repo.findAccountByIdOrThrow(data.id);

    await this.messagingService.triggerHistoryResync({
      accountId: account.unipileAccountId,
      provider: account.provider,
    });

    await this.repo.resetBackfillCheckpointUnscoped(account.unipileAccountId);

    await this.repo.markAccountSyncingUnscoped({ unipileAccountId: account.unipileAccountId, syncing: true });

    const backfillToken = await this.repo.claimBackfillUnscoped(account.unipileAccountId);
    if (backfillToken) {
      await this.backgroundTaskService.dispatch("backfill-connected-account", {
        connectedAccountId: account.id,
        token: backfillToken,
      });
    }

    await this.eventService.publish(DomainEvent.CONNECTED_ACCOUNT_RESYNCED, {
      entityId: account.id,
      payload: {
        provider: account.provider,
        displayName: account.displayName,
        emailAddress: account.emailAddress,
      },
    });

    return { ok: true as const, data: null };
  }
}
