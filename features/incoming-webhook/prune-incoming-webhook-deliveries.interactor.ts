import type { IncomingWebhookRepo } from "./incoming-webhook.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pruneInBatches } from "@/core/utils/prune-in-batches";

import { INCOMING_WEBHOOK_LIMITS } from "./incoming-webhook.schema";

@SystemInteractor
export class PruneIncomingWebhookDeliveriesInteractor {
  constructor(private repo: Pick<IncomingWebhookRepo, "deleteDeliveriesBeforeUnscoped">) {}

  async invoke(args: { now?: Date } = {}): Promise<{ pruned: number }> {
    const now = args.now ?? new Date();
    const before = new Date(now.getTime() - INCOMING_WEBHOOK_LIMITS.retentionDays * 24 * 60 * 60 * 1000);
    return { pruned: await pruneInBatches((limit) => this.repo.deleteDeliveriesBeforeUnscoped(before, limit)) };
  }
}
