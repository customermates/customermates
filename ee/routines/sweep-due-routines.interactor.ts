import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { RoutineTriggerKind } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const DUE_BATCH_LIMIT = 200;
const STALE_QUEUED_BATCH_LIMIT = 100;
const STALE_QUEUED_MIN_AGE_MS = 2 * 60 * 1000;

export abstract class SweepDueRoutinesRepo {
  abstract findDueRoutinesUnscoped(
    now: Date,
    limit: number,
  ): Promise<
    { id: string; companyId: string; ownerUserId: string; nextRunAt: Date | null; triggerKind: RoutineTriggerKind }[]
  >;
  abstract claimDueRoutineUnscoped(args: {
    routineId: string;
    expectedNextRunAt: Date;
    now: Date;
  }): Promise<{ id: string; companyId: string } | null>;
  abstract findStaleQueuedRoutineRunsUnscoped(
    before: Date,
    limit: number,
  ): Promise<{ id: string; companyId: string; routine: { ownerUserId: string } }[]>;
  abstract findOwnersWithRunningRunsUnscoped(limit: number): Promise<string[]>;
}

@SystemInteractor
export class SweepDueRoutinesInteractor {
  constructor(
    private repo: SweepDueRoutinesRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {}

  async invoke(now = new Date()): Promise<{ claimed: number; redispatched: number; reconciling: number }> {
    const due = await this.repo.findDueRoutinesUnscoped(now, DUE_BATCH_LIMIT);

    let claimed = 0;
    for (const routine of due) {
      if (!routine.nextRunAt) continue;

      const run = await this.repo.claimDueRoutineUnscoped({
        routineId: routine.id,
        expectedNextRunAt: routine.nextRunAt,
        now,
      });
      if (!run) continue;

      claimed += 1;
      await this.backgroundTaskService.dispatch("run-routine", {
        routineRunId: run.id,
        companyId: run.companyId,
        ownerUserId: routine.ownerUserId,
      });
    }

    const stale = await this.repo.findStaleQueuedRoutineRunsUnscoped(
      new Date(now.getTime() - STALE_QUEUED_MIN_AGE_MS),
      STALE_QUEUED_BATCH_LIMIT,
    );

    for (const run of stale) {
      await this.backgroundTaskService.dispatch("run-routine", {
        routineRunId: run.id,
        companyId: run.companyId,
        ownerUserId: run.routine.ownerUserId,
      });
    }

    const owners = await this.repo.findOwnersWithRunningRunsUnscoped(DUE_BATCH_LIMIT);
    for (const ownerUserId of owners)
      await this.backgroundTaskService.dispatch("reconcile-routine-runs", { ownerUserId });

    return { claimed, redispatched: stale.length, reconciling: owners.length };
  }
}
