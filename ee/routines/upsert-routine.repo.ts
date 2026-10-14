import type { RoutineDto, UpsertRoutineData } from "./routine.schema";
import { type RoutineCountLimit } from "./routine-run-limits";

export abstract class UpsertRoutineRepo {
  abstract upsertRoutineOrThrow(args: UpsertRoutineData, routineLimit?: RoutineCountLimit): Promise<RoutineDto>;
  abstract getRoutineByIdOrThrow(id: string): Promise<RoutineDto>;
  abstract isEligibleRoutineOwner(userId: string): Promise<boolean>;
}
