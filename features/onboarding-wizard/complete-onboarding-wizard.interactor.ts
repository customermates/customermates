import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Redirect } from "@/features/auth/auth-outcome";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";

export abstract class CompleteOnboardingWizardRepo {
  abstract markOnboardingWizardCompleted(args: { userId: string }): Promise<void>;
}

@SystemInteractor
export class CompleteOnboardingWizardInteractor {
  constructor(
    private repo: CompleteOnboardingWizardRepo,
    private routeGuardService: RouteGuardService,
  ) {}

  async invoke(): Promise<{ ok: true; data: { redirectTo: "/" } } | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    const user = resolution.user;
    if (!user) return redirectTo("/auth/signin");

    return runWithTenant(user, async () => {
      await this.repo.markOnboardingWizardCompleted({ userId: user.id });
      return { ok: true as const, data: { redirectTo: "/" as const } };
    });
  }
}
