import type { Redirect } from "@/features/auth/auth-outcome";
import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { OnboardingAgentStatus, OnboardingAgentStatusRepo } from "./onboarding-agent.repo";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";

@SystemInteractor
export class GetOnboardingAgentStatusInteractor {
  constructor(
    private readonly repo: OnboardingAgentStatusRepo,
    private readonly routeGuardService: RouteGuardService,
  ) {}

  async invoke(): Promise<{ ok: true; data: OnboardingAgentStatus } | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    const user = resolution.user;
    if (!user) return redirectTo("/auth/signin");
    if (!user.role?.isSystemRole) return redirectTo("/");

    return runWithTenant(user, async () => ({
      ok: true as const,
      data: await this.repo.findOnboardingAgentStatus(),
    }));
  }
}
