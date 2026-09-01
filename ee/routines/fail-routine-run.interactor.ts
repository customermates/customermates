import type { RoutineRunStatus as RoutineRunStatusType } from "@/generated/prisma";

import { RoutineRunStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export abstract class FailRoutineRunRepo {
  abstract findRoutineRunForStartUnscoped(routineRunId: string): Promise<{
    id: string;
    status: RoutineRunStatusType;
    routine: { id: string };
  } | null>;
  abstract settleRoutineRunUnscoped(args: {
    routineRunId: string;
    routineId: string;
    status: RoutineRunStatusType;
    error?: string | null;
    now: Date;
  }): Promise<void>;
}

@SystemInteractor
export class FailRoutineRunInteractor {
  constructor(private repo: FailRoutineRunRepo) {}

  async invoke(args: { routineRunId: string; reason: string }): Promise<void> {
    const run = await this.repo.findRoutineRunForStartUnscoped(args.routineRunId);
    if (!run) return;
    if (run.status !== RoutineRunStatus.queued && run.status !== RoutineRunStatus.running) return;

    await this.repo.settleRoutineRunUnscoped({
      routineRunId: run.id,
      routineId: run.routine.id,
      status: RoutineRunStatus.blocked,
      error: args.reason,
      now: new Date(),
    });
  }
}
