import type { DeleteAccountForBillingService } from "@/ee/messaging/connect/delete-account-for-billing.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export abstract class DeleteConnectedAccountsForExpiredTrialsRepo {
  abstract findConnectedAccountIdsForExpiredTrialsUnscoped(): Promise<string[]>;
  abstract findConnectedAccountIdsForLapsedSubscriptionsUnscoped(): Promise<string[]>;
}

@SystemInteractor
export class DeleteConnectedAccountsForExpiredTrialsInteractor {
  constructor(
    private repo: DeleteConnectedAccountsForExpiredTrialsRepo,
    private deleteService: DeleteAccountForBillingService,
  ) {}

  async invoke(): Promise<void> {
    const expiredTrialAccountIds = await this.repo.findConnectedAccountIdsForExpiredTrialsUnscoped();
    const lapsedSubscriptionAccountIds = await this.repo.findConnectedAccountIdsForLapsedSubscriptionsUnscoped();

    const groups = [
      { accountIds: expiredTrialAccountIds, reason: "trialExpired" },
      { accountIds: lapsedSubscriptionAccountIds, reason: "subscriptionLapsed" },
    ] as const;
    const deleted = new Set<string>();

    for (const { accountIds, reason } of groups) {
      for (const accountId of accountIds) {
        if (deleted.has(accountId)) continue;
        deleted.add(accountId);

        await this.deleteService.deleteForBillingOrThrow(accountId, reason);
      }
    }
  }
}
