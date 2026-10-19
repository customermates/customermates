import type { CompleteOnboardingSetupStepRepo } from "./complete-onboarding-setup-step.repo";
import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Redirect } from "@/features/auth/auth-outcome";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";

@SystemInteractor
export class CompleteOnboardingSetupStepInteractor {
  constructor(
    private repo: CompleteOnboardingSetupStepRepo,
    private routeGuardService: RouteGuardService,
  ) {}

  async invoke(): Promise<{ ok: true; data: { completed: true } } | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    const user = resolution.user;
    if (!user) return redirectTo("/auth/signin");
    if (!user.role?.isSystemRole) return redirectTo("/");

    return runWithTenant(user, async () => {
      await this.repo.markOnboardingSetupStepCompleted({ userId: user.id });
      return { ok: true as const, data: { completed: true as const } };
    });
  }
}
