import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { ROUTINE_RUN_PRUNE_BATCH_LIMIT, ROUTINE_RUN_RETENTION_DAYS } from "./routine-run-limits";

export abstract class PruneRoutineRunsRepo {
  abstract findExpiredRoutineRunsUnscoped(
    before: Date,
    limit: number,
  ): Promise<{ id: string; conversationId: string | null }[]>;
  abstract deleteRoutineRunsUnscoped(runIds: string[]): Promise<number>;
}

@SystemInteractor
export class PruneRoutineRunsInteractor {
  constructor(private repo: PruneRoutineRunsRepo) {}

  async invoke(args: { now?: Date } = {}): Promise<{ pruned: number }> {
    const now = args.now ?? new Date();
    const before = new Date(now.getTime() - ROUTINE_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const expired = await this.repo.findExpiredRoutineRunsUnscoped(before, ROUTINE_RUN_PRUNE_BATCH_LIMIT);
    if (expired.length === 0) return { pruned: 0 };

    const pruned = await this.repo.deleteRoutineRunsUnscoped(expired.map((run) => run.id));

    return { pruned };
  }
}
