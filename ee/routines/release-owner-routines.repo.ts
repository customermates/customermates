export abstract class ReleaseOwnerRoutinesRepo {
  abstract blockPendingRoutineRunsForOwnerUnscoped(args: {
    companyId: string;
    ownerUserId: string;
    now: Date;
  }): Promise<number>;
  abstract disableRoutinesForOwnerUnscoped(args: {
    companyId: string;
    ownerUserId: string;
    now: Date;
  }): Promise<number>;
}
