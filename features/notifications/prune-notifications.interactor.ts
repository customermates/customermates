import type { NotificationRepo } from "./notification.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pruneInBatches } from "@/core/utils/prune-in-batches";

import { NOTIFICATION_RETENTION_DAYS } from "./notification.schema";

@SystemInteractor
export class PruneNotificationsInteractor {
  constructor(private readonly repo: Pick<NotificationRepo, "pruneUnscoped">) {}

  async invoke(args: { now?: Date } = {}): Promise<{ pruned: number }> {
    const now = args.now ?? new Date();
    const before = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return { pruned: await pruneInBatches((limit) => this.repo.pruneUnscoped(before, limit)) };
  }
}
