import type { MessagingService } from "../messaging.service";
import type { RefreshConnectedAccountStatusesRepo } from "./refresh-connected-account-statuses.repo";

import * as ErrorReporter from "@/core/observability/server";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { deriveAccountConnection } from "../account-connection";
import { isUnipileRateLimit } from "../messaging.service";

const STATUS_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

@SystemInteractor
export class RefreshConnectedAccountStatusesInteractor {
  constructor(
    private repo: RefreshConnectedAccountStatusesRepo,
    private messagingService: MessagingService,
  ) {}

  async invoke(): Promise<{ refreshed: number; failed: number }> {
    const accounts = await this.repo.findAccountsNeedingStatusRefreshUnscoped(
      new Date(Date.now() - STATUS_REFRESH_INTERVAL_MS),
    );
    let refreshed = 0;
    let failed = 0;

    for (const account of accounts) {
      try {
        const checkedAt = new Date();
        const snapshot = await this.messagingService.getAccount(account.unipileAccountId);
        const connection = deriveAccountConnection(snapshot, undefined, account.connectionDetails, checkedAt);
        const stalled = connection.status !== "ok" && connection.status !== "connecting";
        await this.repo.updateAccountUnscoped({
          unipileAccountId: account.unipileAccountId,
          ...connection,
          ...(stalled && { syncing: false }),
        });
        refreshed += 1;
      } catch (error) {
        failed += 1;
        ErrorReporter.captureException(error, { tags: { unipileAccountId: account.unipileAccountId } });
        if (isUnipileRateLimit(error)) break;
      }
    }

    return { refreshed, failed };
  }
}
