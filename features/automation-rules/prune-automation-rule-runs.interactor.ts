import type { AutomationRuleRepo } from "./automation-rule.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pruneInBatches } from "@/core/utils/prune-in-batches";

import { AUTOMATION_RUN_RETENTION_DAYS } from "./automation-rule.schema";

@SystemInteractor
export class PruneAutomationRuleRunsInteractor {
  constructor(private readonly repo: Pick<AutomationRuleRepo, "deleteRunsBeforeUnscoped">) {}

  async invoke(args: { now?: Date } = {}): Promise<{ pruned: number }> {
    const now = args.now ?? new Date();
    const before = new Date(now.getTime() - AUTOMATION_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return { pruned: await pruneInBatches((limit) => this.repo.deleteRunsBeforeUnscoped(before, limit)) };
  }
}
