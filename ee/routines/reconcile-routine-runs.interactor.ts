import type { ReconcileRoutineRunsRepo } from "./reconcile-routine-runs.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { ROUTINE_CONSECUTIVE_FAILURE_LIMIT, ROUTINE_DISABLED_REASON_REPEATED_FAILURES } from "./routine-run-limits";

const RECONCILE_BATCH_LIMIT = 200;
const ORPHANED_RUN_GRACE_MS = 10 * 60 * 1000;

@SystemInteractor
export class ReconcileRoutineRunsInteractor {
  constructor(private repo: ReconcileRoutineRunsRepo) {}

  async invoke(args: { ownerUserId?: string; now?: Date } = {}): Promise<{ settled: number }> {
    const now = args.now ?? new Date();
    const running = await this.repo.findRunningRoutineRunsUnscoped(RECONCILE_BATCH_LIMIT, args.ownerUserId);

    let settled = 0;
    for (const run of running) {
      if (!run.turnRequestId) continue;

      const outcome = await this.repo.readTurnOutcomeUnscoped(run.turnRequestId);
      if (!outcome || !outcome.settled) continue;

      const didSettle = await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: run.routineId,
        expectedStatus: "running",
        status: outcome.status,
        summary: outcome.summary,
        chargedMicrocents: outcome.chargedMicrocents,
        terminalCode: outcome.terminalCode,
        now,
      });
      if (!didSettle) continue;
      settled += 1;

      if (outcome.status === "failed") await this.disableIfFailingRepeatedly(run.routineId, run.executedByUserId);
    }

    if (args.ownerUserId) return { settled };

    const orphaned = await this.repo.findOrphanedRunningRoutineRunsUnscoped(
      new Date(now.getTime() - ORPHANED_RUN_GRACE_MS),
      RECONCILE_BATCH_LIMIT,
    );

    for (const run of orphaned) {
      const didSettle = await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: run.routineId,
        expectedStatus: "running",
        expectedTurnRequestId: null,
        status: "failed",
        error: "startAbandoned",
        now,
      });
      if (!didSettle) continue;
      settled += 1;

      await this.disableIfFailingRepeatedly(run.routineId, run.executedByUserId);
    }

    return { settled };
  }

  private async disableIfFailingRepeatedly(routineId: string, executedByUserId: string): Promise<void> {
    const recent = await this.repo.readRecentRoutineRunOutcomesUnscoped(
      routineId,
      executedByUserId,
      ROUTINE_CONSECUTIVE_FAILURE_LIMIT,
    );
    if (recent.length < ROUTINE_CONSECUTIVE_FAILURE_LIMIT) return;
    if (!recent.every((status) => status === "failed")) return;

    await this.repo.disableRoutineUnscoped(routineId, ROUTINE_DISABLED_REASON_REPEATED_FAILURES, executedByUserId);
  }
}
