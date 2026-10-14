import type { RoutineDto } from "./routine.schema";

export abstract class DeleteRoutineRepo {
  abstract isActiveSystemAdministrator(userId: string): Promise<boolean>;
  abstract trashRoutineOrThrow(id: string, now: Date): Promise<RoutineDto | null>;
}
