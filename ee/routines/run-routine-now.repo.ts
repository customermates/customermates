import type { RoutineDto } from "./routine.schema";

export abstract class RunRoutineNowRepo {
  abstract getRoutineByIdOrThrow(id: string): Promise<RoutineDto>;
  abstract createManualRoutineRunOrThrow(
    routineId: string,
    executedByUserId: string,
    now: Date,
  ): Promise<{ id: string; companyId: string; executedByUserId: string }>;
}
