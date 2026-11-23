import type { MessagingService } from "../messaging.service";
import type { EventService } from "@/features/event/event.service";
import type { AccountRemovalReason } from "./account-removal-reason";
import type { DeleteAccountForBillingRepo } from "./delete-account-for-billing.repo";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";

export class DeleteAccountForBillingService {
  constructor(
    private repo: DeleteAccountForBillingRepo,
    private messagingService: MessagingService,
    private eventService: EventService,
  ) {}

  async deleteForBillingOrThrow(connectedAccountId: string, removalReason: AccountRemovalReason): Promise<void> {
    const account = await this.repo.findAccountByIdOrThrowUnscoped(connectedAccountId);
    if (account.status === ConnectedAccountStatus.deleted) return;

    if (!(await this.repo.countOtherLiveAccountsForUnipileIdUnscoped(account.unipileAccountId, account.id)))
      await this.messagingService.deleteAccount({ accountId: account.unipileAccountId });

    await this.repo.markAccountDeletedUnscoped(connectedAccountId);

    await this.eventService.publish(
      DomainEvent.CONNECTED_ACCOUNT_DELETED,
      {
        entityId: account.id,
        payload: {
          provider: account.provider,
          displayName: account.displayName,
          emailAddress: account.emailAddress,
          removalReason,
        },
      },
      { systemCompanyId: account.companyId, systemUserId: account.userId },
    );
  }
}
