import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { Validated } from "@/core/validation/validation.utils";
import type { OnboardingWizardProgress } from "./onboarding-wizard-progress.schema";
import type { SaveOnboardingWizardProgressRepo } from "./save-onboarding-wizard-progress.repo";

import { z } from "zod";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";
import { OnboardingWizardProgressSchema } from "./onboarding-wizard-progress.schema";

const Schema = z.strictObject({
  userId: z.string().min(1),
  progress: OnboardingWizardProgressSchema,
});
export type SaveOnboardingWizardProgressData = z.infer<typeof Schema>;

@SystemInteractor
export class SaveOnboardingWizardProgressInteractor {
  constructor(
    private repo: SaveOnboardingWizardProgressRepo,
    private routeGuardService: RouteGuardService,
  ) {}

  @Validate(Schema)
  async invoke(
    data: SaveOnboardingWizardProgressData,
  ): Promise<Awaited<Validated<OnboardingWizardProgress>> | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    if (!resolution.user || !resolution.sessionUser) return redirectTo("/auth/signin");
    if (resolution.user.id !== data.userId) return failAuthorization(CustomErrorCode.permissionDenied);

    return runWithTenant(resolution.user, async () => {
      const saved = await this.repo.saveOnboardingWizardProgress(data.progress);
      if (!saved) return redirectTo("/");
      return { ok: true as const, data: data.progress };
    });
  }
}
