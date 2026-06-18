import type { ConnectedAccount } from "../messaging.schema";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { UnipileAccountStatusWebhookSchema, type UnipileAccountStatusWebhook } from "../unipile.schema";
import { mapUnipileStatus } from "../unipile.mappers";
import { FindAccountByUnipileIdUnscopedRepo } from "../persistence/find-account-by-unipile-id-unscoped.repo";

export abstract class ProcessAccountStatusWebhookRepo extends FindAccountByUnipileIdUnscopedRepo {
  abstract updateAccount(args: {
    unipileAccountId: string;
    status: ConnectedAccountStatus;
    syncing?: boolean;
  }): Promise<ConnectedAccount | null>;
  abstract resetBackfillCheckpoint(unipileAccountId: string): Promise<void>;
  abstract claimBackfill(unipileAccountId: string): Promise<string | null>;
}

const BACKFILL_TRIGGERS = new Set(["SYNC_SUCCESS", "CREATION_SUCCESS", "RECONNECTED"]);
const CHECKPOINT_RESET_STATUSES = new Set(["SYNC_SUCCESS", "RECONNECTED"]);
const SYNC_STARTED_STATUSES = new Set(["RECONNECTED"]);
const SYNC_SETTLED_STATUSES = new Set([
  "SYNC_SUCCESS",
  "CREATION_FAIL",
  "CREDENTIALS",
  "PERMISSIONS",
  "ERROR",
  "STOPPED",
  "DELETED",
]);

@SystemInteractor
export class ProcessAccountStatusWebhookInteractor {
  constructor(
    private repo: ProcessAccountStatusWebhookRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {}

  @Enforce(UnipileAccountStatusWebhookSchema)
  async invoke(payload: UnipileAccountStatusWebhook): Promise<void> {
    const { account_id: accountId, message: statusRaw } = payload.AccountStatus;

    const existing = await this.repo.findAccountByUnipileIdOrThrowUnscoped(accountId);

    if (existing.status === ConnectedAccountStatus.deleted) return;

    const dbStatus = mapUnipileStatus(statusRaw);
    const syncing = SYNC_STARTED_STATUSES.has(statusRaw)
      ? true
      : SYNC_SETTLED_STATUSES.has(statusRaw)
        ? false
        : undefined;
    await this.repo.updateAccount({
      unipileAccountId: accountId,
      status: dbStatus,
      syncing,
    });

    const isRedundantSyncSuccess =
      statusRaw === "SYNC_SUCCESS" && existing.status === ConnectedAccountStatus.ok && !existing.syncing;

    if (BACKFILL_TRIGGERS.has(statusRaw) && !isRedundantSyncSuccess) {
      const backfillToken = await this.repo.claimBackfill(accountId);
      if (backfillToken) {
        if (CHECKPOINT_RESET_STATUSES.has(statusRaw)) await this.repo.resetBackfillCheckpoint(accountId);
        await this.backgroundTaskService.dispatch("backfill-connected-account", {
          connectedAccountId: existing.id,
          token: backfillToken,
        });
      }
    }
  }
}
