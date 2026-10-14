import type { RoutineDto } from "./routine.schema";

export abstract class PauseRoutineRepo {
  abstract isActiveSystemAdministrator(userId: string): Promise<boolean>;
  abstract getRoutineByIdOrThrow(id: string): Promise<RoutineDto>;
  abstract pauseRoutineOrThrow(routineId: string, now: Date): Promise<RoutineDto>;
}
