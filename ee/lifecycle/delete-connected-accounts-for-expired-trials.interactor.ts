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

    const accountIds = new Set([...expiredTrialAccountIds, ...lapsedSubscriptionAccountIds]);

    for (const accountId of accountIds) await this.deleteService.deleteForBillingOrThrow(accountId);
  }
}
