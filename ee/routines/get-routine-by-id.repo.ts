import type { RoutineDto } from "./routine.schema";

export abstract class GetRoutineByIdRepo {
  abstract findReadableRoutineById(id: string): Promise<RoutineDto | null>;
}
