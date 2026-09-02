import type { AgentTurnTerminalCode, RoutineRunStatus as RoutineRunStatusType } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { ROUTINE_CONSECUTIVE_FAILURE_LIMIT, ROUTINE_DISABLED_REASON_REPEATED_FAILURES } from "./routine-run-limits";

const RECONCILE_BATCH_LIMIT = 200;
const ORPHANED_RUN_GRACE_MS = 10 * 60 * 1000;

export abstract class ReconcileRoutineRunsRepo {
  abstract findRunningRoutineRunsUnscoped(
    limit: number,
    ownerUserId?: string,
  ): Promise<
    {
      id: string;
      routineId: string;
      turnRequestId: string | null;
      conversationId: string | null;
    }[]
  >;
  abstract findOrphanedRunningRoutineRunsUnscoped(
    before: Date,
    limit: number,
  ): Promise<{ id: string; routineId: string }[]>;
  abstract readTurnOutcomeUnscoped(turnRequestId: string): Promise<{
    status: RoutineRunStatusType;
    terminalCode: AgentTurnTerminalCode | null;
    settled: boolean;
    chargedCredits: number;
    summary: string | null;
  } | null>;
  abstract readRecentRoutineRunOutcomesUnscoped(routineId: string, limit: number): Promise<RoutineRunStatusType[]>;
  abstract disableRoutineUnscoped(routineId: string, reason: string): Promise<unknown>;
  abstract settleRoutineRunUnscoped(args: {
    routineRunId: string;
    routineId: string;
    status: RoutineRunStatusType;
    error?: string | null;
    summary?: string | null;
    chargedCredits?: number;
    terminalCode?: AgentTurnTerminalCode | null;
    now: Date;
  }): Promise<void>;
}

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

      await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: run.routineId,
        status: outcome.status,
        summary: outcome.summary,
        chargedCredits: outcome.chargedCredits,
        terminalCode: outcome.terminalCode,
        now,
      });
      settled += 1;

      if (outcome.status === "failed") await this.disableIfFailingRepeatedly(run.routineId);
    }

    const orphaned = await this.repo.findOrphanedRunningRoutineRunsUnscoped(
      new Date(now.getTime() - ORPHANED_RUN_GRACE_MS),
      RECONCILE_BATCH_LIMIT,
    );

    for (const run of orphaned) {
      await this.repo.settleRoutineRunUnscoped({
        routineRunId: run.id,
        routineId: run.routineId,
        status: "failed",
        error: "startAbandoned",
        now,
      });
      settled += 1;

      await this.disableIfFailingRepeatedly(run.routineId);
    }

    return { settled };
  }

  private async disableIfFailingRepeatedly(routineId: string): Promise<void> {
    const recent = await this.repo.readRecentRoutineRunOutcomesUnscoped(routineId, ROUTINE_CONSECUTIVE_FAILURE_LIMIT);
    if (recent.length < ROUTINE_CONSECUTIVE_FAILURE_LIMIT) return;
    if (!recent.every((status) => status === "failed")) return;

    await this.repo.disableRoutineUnscoped(routineId, ROUTINE_DISABLED_REASON_REPEATED_FAILURES);
  }
}
