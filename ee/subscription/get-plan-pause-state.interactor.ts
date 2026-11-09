import type { FreePlanMemberRepo } from "./free-plan-member.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export type PlanPauseState = { paused: false } | { paused: true; ownerName: string | null };

@SystemInteractor
export class GetPlanPauseStateInteractor {
  constructor(
    private readonly repo: Pick<FreePlanMemberRepo, "findMemberPauseUnscoped" | "findActiveKeeperNameUnscoped">,
  ) {}

  async invoke(userId: string): Promise<PlanPauseState> {
    const member = await this.repo.findMemberPauseUnscoped(userId);
    if (!member?.pausedByPlanAt) return { paused: false };
    return { paused: true, ownerName: await this.repo.findActiveKeeperNameUnscoped(member.companyId) };
  }
}
