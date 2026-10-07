import type { RoutineRunPage } from "./routine-history";

export abstract class GetRoutineRunsRepo {
  abstract getRoutineRuns(routineId: string, limit: number, cursor?: string | null): Promise<RoutineRunPage>;
}
