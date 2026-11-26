import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { OnboardingWizardProgress } from "./onboarding-wizard-progress.schema";
import type { GetOnboardingWizardProgressRepo } from "./get-onboarding-wizard-progress.repo";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";
import { readOnboardingWizardProgress } from "./onboarding-wizard-progress.schema";

@AllowInDemoMode
@SystemInteractor
export class GetOnboardingWizardProgressInteractor {
  constructor(
    private repo: GetOnboardingWizardProgressRepo,
    private routeGuardService: RouteGuardService,
  ) {}

  async invoke(): Promise<{ ok: true; data: OnboardingWizardProgress } | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    if (!resolution.user || !resolution.sessionUser) return redirectTo("/auth/signin");

    return runWithTenant(resolution.user, async () => ({
      ok: true as const,
      data: readOnboardingWizardProgress(await this.repo.findOnboardingWizardProgressOrThrow()),
    }));
  }
}
