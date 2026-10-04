import type { RoutineDto } from "./routine.schema";
import type { RoutineRunStatus as RoutineRunStatusType } from "@/generated/prisma";

export abstract class StartRoutineRunRepo {
  abstract findRoutineRunForStartUnscoped(routineRunId: string): Promise<{
    id: string;
    companyId: string;
    executedByUserId: string;
    status: RoutineRunStatusType;
    triggerEvent: string | null;
    triggerEntityId: string | null;
    triggerPayload: unknown;
    routine: RoutineDto;
  } | null>;
  abstract claimQueuedRoutineRunForOwnerUnscoped(args: {
    routineRunId: string;
    executedByUserId: string;
    now: Date;
  }): Promise<{ routine: RoutineDto } | "runNotQueued" | "triggerChanged">;
  abstract countRecentRoutineRunsUnscoped(routineId: string, since: Date): Promise<number>;
  abstract findCustomColumnLabelsUnscoped(companyId: string, columnIds: string[]): Promise<Record<string, string>>;
  abstract settleRoutineRunUnscoped(args: {
    routineRunId: string;
    routineId: string;
    expectedStatus: RoutineRunStatusType;
    status: RoutineRunStatusType;
    error?: string | null;
    now: Date;
  }): Promise<boolean>;
}
