import type { ConnectedAccount } from "@/generated/prisma";
import type { MessagingService } from "../messaging.service";

import { ConnectedAccountStatus } from "@/generated/prisma";

export abstract class DeleteAccountForBillingRepo {
  abstract findAccountByIdOrThrowUnscoped(id: string): Promise<ConnectedAccount>;
  abstract markAccountDeletedUnscoped(id: string): Promise<void>;
}

export class DeleteAccountForBillingService {
  constructor(
    private repo: DeleteAccountForBillingRepo,
    private messagingService: MessagingService,
  ) {}

  async deleteForBillingOrThrow(connectedAccountId: string): Promise<void> {
    const account = await this.repo.findAccountByIdOrThrowUnscoped(connectedAccountId);
    if (account.status === ConnectedAccountStatus.deleted) return;

    await this.messagingService.deleteAccount({ accountId: account.unipileAccountId });

    await this.repo.markAccountDeletedUnscoped(connectedAccountId);
  }
}
