import type { RoutineDto } from "./routine.schema";

export abstract class GetOwnerRoutinesRepo {
  abstract getRoutinesForOwner(ownerUserId: string): Promise<RoutineDto[]>;
}
