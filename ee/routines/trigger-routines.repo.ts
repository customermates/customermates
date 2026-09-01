export type EventRoutineCandidate = { id: string; ownerUserId: string };

export type AdmittedRoutineRun = { id: string; routineId: string; ownerUserId: string };

export abstract class TriggerRoutinesRepo {
  abstract findEventRoutinesUnscoped(companyId: string, event: string): Promise<EventRoutineCandidate[]>;
  abstract countSuppressedRoutineEventsUnscoped(routineIds: string[]): Promise<void>;
  abstract admitEventRoutineRunsUnscoped(args: {
    companyId: string;
    event: string;
    entityId: string | null;
    routineIds: string[];
    now: Date;
  }): Promise<AdmittedRoutineRun[]>;
}
