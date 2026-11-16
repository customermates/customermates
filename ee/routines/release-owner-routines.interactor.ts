import type { AutomationRuleRepo } from "@/features/automation-rules/automation-rule.repo";
import type { ReconcileRoutineRunsInteractor } from "./reconcile-routine-runs.interactor";
import type { ReleaseOwnerRoutinesRepo } from "./release-owner-routines.repo";

import { AUTOMATION_DISABLED_REASON_OWNER_INACTIVE } from "@/features/automation-rules/automation-disabled-reason";

export type ReleaseOwnerRulesRepo = Pick<AutomationRuleRepo, "disableOwnerRulesUnscoped">;

export class ReleaseOwnerRoutinesInteractor {
  constructor(
    private repo: ReleaseOwnerRoutinesRepo,
    private reconcile: ReconcileRoutineRunsInteractor,
    private rules: ReleaseOwnerRulesRepo,
  ) {}

  async invoke(args: { companyId: string; ownerUserId: string; now?: Date }): Promise<{
    blocked: number;
    disabled: number;
    rulesDisabled: number;
  }> {
    const now = args.now ?? new Date();
    const { companyId, ownerUserId } = args;

    await this.reconcile.invoke({ ownerUserId, now });

    const blocked = await this.repo.blockPendingRoutineRunsForOwnerUnscoped({ companyId, ownerUserId, now });
    const disabled = await this.repo.disableRoutinesForOwnerUnscoped({ companyId, ownerUserId, now });
    const rulesDisabled = await this.rules.disableOwnerRulesUnscoped(
      companyId,
      ownerUserId,
      AUTOMATION_DISABLED_REASON_OWNER_INACTIVE,
    );

    return { blocked, disabled, rulesDisabled };
  }
}
