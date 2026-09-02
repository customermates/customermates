import type { RouteGuardService } from "@/features/auth/route-guard.service";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { env } from "@/env";

export abstract class WithdrawAdAttributionRepo {
  abstract clearAdAttributionForUser(args: { userId: string }): Promise<boolean>;
}

@SystemInteractor
export class WithdrawAdAttributionInteractor {
  constructor(
    private readonly routeGuardService: RouteGuardService,
    private readonly repo: WithdrawAdAttributionRepo,
  ) {}

  async invoke(): Promise<boolean> {
    if (env.APP_MODE !== "cloud") return false;
    const { user } = await this.routeGuardService.resolveAccountState();
    if (!user) return false;
    return runWithTenant(user, () => this.repo.clearAdAttributionForUser({ userId: user.id }));
  }
}
