import type { RoutineRunStatus as RoutineRunStatusType } from "@/generated/prisma";

import { RoutineRunStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export abstract class FailRoutineRunRepo {
  abstract findRoutineRunForStartUnscoped(routineRunId: string): Promise<{
    id: string;
    executedByUserId: string;
    status: RoutineRunStatusType;
    routine: { id: string };
  } | null>;
  abstract settleRoutineRunUnscoped(args: {
    routineRunId: string;
    routineId: string;
    expectedStatus: RoutineRunStatusType;
    expectedTurnRequestId?: string | null;
    status: RoutineRunStatusType;
    error?: string | null;
    now: Date;
  }): Promise<boolean>;
}

@SystemInteractor
export class FailRoutineRunInteractor {
  constructor(private repo: FailRoutineRunRepo) {}

  async invoke(args: { routineRunId: string; expectedExecutorUserId: string; reason: string }): Promise<void> {
    const run = await this.repo.findRoutineRunForStartUnscoped(args.routineRunId);
    if (!run) return;
    if (run.executedByUserId !== args.expectedExecutorUserId) return;
    if (run.status !== RoutineRunStatus.queued && run.status !== RoutineRunStatus.running) return;

    await this.repo.settleRoutineRunUnscoped({
      routineRunId: run.id,
      routineId: run.routine.id,
      expectedStatus: run.status,
      expectedTurnRequestId: null,
      status: RoutineRunStatus.blocked,
      error: args.reason,
      now: new Date(),
    });
  }
}
