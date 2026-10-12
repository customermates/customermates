import type { RoutineDto } from "./routine.schema";

export abstract class GetRoutineByIdRepo {
  abstract getRoutineByIdOrThrow(id: string): Promise<RoutineDto>;
}
