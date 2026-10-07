import type { RoutineDto } from "./routine.schema";

export abstract class DeleteRoutineRepo {
  abstract isActiveSystemAdministrator(userId: string): Promise<boolean>;
  abstract deleteRoutineOrThrow(id: string): Promise<RoutineDto | null>;
}
