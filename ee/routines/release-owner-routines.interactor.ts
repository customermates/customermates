import type { ReconcileRoutineRunsInteractor } from "./reconcile-routine-runs.interactor";

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

export class ReleaseOwnerRoutinesInteractor {
  constructor(
    private repo: ReleaseOwnerRoutinesRepo,
    private reconcile: ReconcileRoutineRunsInteractor,
  ) {}

  async invoke(args: { companyId: string; ownerUserId: string; now?: Date }): Promise<{
    blocked: number;
    disabled: number;
  }> {
    const now = args.now ?? new Date();
    const { companyId, ownerUserId } = args;

    await this.reconcile.invoke({ ownerUserId, now });

    const blocked = await this.repo.blockPendingRoutineRunsForOwnerUnscoped({ companyId, ownerUserId, now });
    const disabled = await this.repo.disableRoutinesForOwnerUnscoped({ companyId, ownerUserId, now });

    return { blocked, disabled };
  }
}
