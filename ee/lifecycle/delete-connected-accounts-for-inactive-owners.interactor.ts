import type { DeleteAccountForBillingService } from "@/ee/messaging/connect/delete-account-for-billing.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export abstract class DeleteConnectedAccountsForInactiveOwnersRepo {
  abstract findConnectedAccountIdsForInactiveOwnersUnscoped(): Promise<string[]>;
}

@SystemInteractor
export class DeleteConnectedAccountsForInactiveOwnersInteractor {
  constructor(
    private repo: DeleteConnectedAccountsForInactiveOwnersRepo,
    private deleteService: DeleteAccountForBillingService,
  ) {}

  async invoke(): Promise<void> {
    const accountIds = await this.repo.findConnectedAccountIdsForInactiveOwnersUnscoped();

    for (const accountId of accountIds) await this.deleteService.deleteForBillingOrThrow(accountId);
  }
}
