import type { MessagingService } from "@/ee/messaging/messaging.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DELETIONS_PER_RUN = 20;

export abstract class DeleteOrphanedUnipileAccountsRepo {
  abstract findActiveUnipileAccountIdsUnscoped(): Promise<string[]>;
}

@SystemInteractor
export class DeleteOrphanedUnipileAccountsInteractor {
  constructor(
    private repo: DeleteOrphanedUnipileAccountsRepo,
    private messagingService: MessagingService,
  ) {}

  async invoke(): Promise<void> {
    const unipileAccounts = await this.messagingService.listAccounts();
    const referencedIds = new Set(await this.repo.findActiveUnipileAccountIdsUnscoped());

    const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
    const orphans = unipileAccounts.filter(
      (account) => !referencedIds.has(account.id) && account.createdAt.getTime() < cutoff,
    );
    if (orphans.length === 0) return;
    if (orphans.length > MAX_DELETIONS_PER_RUN) {
      throw new Error(
        `Orphaned Unipile account sweep aborted: ${orphans.length} orphans exceed the per-run limit of ${MAX_DELETIONS_PER_RUN}`,
      );
    }

    for (const orphan of orphans) await this.messagingService.deleteAccount({ accountId: orphan.id });
  }
}
