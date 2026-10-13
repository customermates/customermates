import type { RoutineRunPage } from "./routine-history";
import type { RoutineRunCursor } from "./routine-run-cursor";

export abstract class GetRoutineRunsRepo {
  abstract assertReadableRoutineOrThrow(routineId: string): Promise<void>;
  abstract getRoutineRuns(routineId: string, limit: number, cursor: RoutineRunCursor | null): Promise<RoutineRunPage>;
}
