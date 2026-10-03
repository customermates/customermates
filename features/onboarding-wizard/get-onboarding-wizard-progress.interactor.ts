import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { AuthService } from "@/features/auth/auth.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { OnboardingWizardProgress } from "./onboarding-wizard-progress.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";
import { readOnboardingWizardProgress } from "./onboarding-wizard-progress.schema";

export abstract class GetOnboardingWizardProgressRepo {
  abstract findOnboardingWizardProgressOrThrow(): Promise<unknown>;
}

@AllowInDemoMode
@SystemInteractor
export class GetOnboardingWizardProgressInteractor {
  constructor(
    private repo: GetOnboardingWizardProgressRepo,
    private routeGuardService: RouteGuardService,
    private authService: AuthService,
  ) {}

  async invoke(): Promise<{ ok: true; data: OnboardingWizardProgress } | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    if (!resolution.user) return redirectTo("/auth/signin");

    return runWithTenant(resolution.user, async () => {
      const progress = readOnboardingWizardProgress(await this.repo.findOnboardingWizardProgressOrThrow());
      const references = Object.entries(progress.ai.apiKeyIds);
      const { active } = await this.authService.resolveApiKeyReferences(references.map(([, id]) => id));
      progress.ai.apiKeyIds = Object.fromEntries(references.filter(([, id]) => active.has(id)));
      return { ok: true as const, data: progress };
    });
  }
}
