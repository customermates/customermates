import type { Filter } from "@/core/base/base-get.schema";

export type EventRoutineCandidate = {
  id: string;
  ownerUserId: string;
  changedFields: string[];
  triggerFilters: Filter[];
  updatedAt: Date;
};

export type AdmittedRoutineRun = {
  id: string;
  routineId: string;
  executedByUserId: string;
};

export abstract class TriggerRoutinesRepo {
  abstract findEventRoutinesUnscoped(companyId: string, event: string): Promise<EventRoutineCandidate[]>;
  abstract countSuppressedRoutineEventsUnscoped(routineIds: string[]): Promise<void>;
  abstract admitEventRoutineRunsUnscoped(args: {
    companyId: string;
    event: string;
    entityId: string | null;
    triggerPayload: unknown;
    routines: { id: string; ownerUserId: string; updatedAt: Date }[];
    now: Date;
  }): Promise<AdmittedRoutineRun[]>;
}
