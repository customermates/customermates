import type { PruneDraftSendsRepo } from "./prune-draft-sends.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { DRAFT_SEND_PRUNE_BATCH_LIMIT, DRAFT_SEND_PRUNE_MAX_BATCHES, DRAFT_SEND_RETENTION_DAYS } from "../draft-send";

@SystemInteractor
export class PruneDraftSendsInteractor {
  constructor(private readonly repo: PruneDraftSendsRepo) {}

  async invoke(args: { now?: Date } = {}): Promise<{ pruned: number }> {
    const now = args.now ?? new Date();
    const before = new Date(now.getTime() - DRAFT_SEND_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let pruned = 0;
    let after: string | null = null;

    for (let batch = 0; batch < DRAFT_SEND_PRUNE_MAX_BATCHES; batch++) {
      const page: { pruned: number; next: string | null } = await this.repo.pruneDraftSendsUnscoped({
        before,
        after,
        limit: DRAFT_SEND_PRUNE_BATCH_LIMIT,
      });
      pruned += page.pruned;
      after = page.next;
      if (!after) break;
    }

    return { pruned };
  }
}
