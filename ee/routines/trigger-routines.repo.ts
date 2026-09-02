export type EventRoutineCandidate = { id: string; ownerUserId: string; changedFields: string[] };

export type AdmittedRoutineRun = { id: string; routineId: string; ownerUserId: string };

export abstract class TriggerRoutinesRepo {
  abstract findEventRoutinesUnscoped(companyId: string, event: string): Promise<EventRoutineCandidate[]>;
  abstract countSuppressedRoutineEventsUnscoped(routineIds: string[]): Promise<void>;
  abstract pruneRoutineFiltersForFieldUnscoped(companyId: string, field: string): Promise<number>;
  abstract admitEventRoutineRunsUnscoped(args: {
    companyId: string;
    event: string;
    entityId: string | null;
    triggerPayload: unknown;
    routineIds: string[];
    now: Date;
  }): Promise<AdmittedRoutineRun[]>;
}
