import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { AuthService } from "@/features/auth/auth.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { Validated } from "@/core/validation/validation.utils";
import type { OnboardingWizardProgress } from "./onboarding-wizard-progress.schema";

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

export abstract class SaveOnboardingWizardProgressRepo {
  abstract saveOnboardingWizardProgress(progress: OnboardingWizardProgress): Promise<boolean>;
}

@SystemInteractor
export class SaveOnboardingWizardProgressInteractor {
  constructor(
    private repo: SaveOnboardingWizardProgressRepo,
    private routeGuardService: RouteGuardService,
    private authService: AuthService,
  ) {}

  @Validate(Schema)
  async invoke(
    data: SaveOnboardingWizardProgressData,
  ): Promise<Awaited<Validated<OnboardingWizardProgress>> | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    if (!resolution.user) return redirectTo("/auth/signin");
    if (resolution.user.id !== data.userId) return failAuthorization(CustomErrorCode.permissionDenied);

    return runWithTenant(resolution.user, async () => {
      const ids = Object.values(data.progress.ai.apiKeyIds);
      if (ids.length) {
        const keys = await this.authService.listApiKeys();
        const validIds = new Set(
          keys
            .filter((key) => key.enabled !== false && (!key.expiresAt || key.expiresAt.getTime() > Date.now()))
            .map((key) => key.id),
        );
        if (ids.some((id) => !validIds.has(id)))
          return failAuthorization(CustomErrorCode.permissionDenied, ["progress", "ai", "apiKeyIds"]);
      }

      const saved = await this.repo.saveOnboardingWizardProgress(data.progress);
      if (!saved) return redirectTo("/");
      return { ok: true as const, data: data.progress };
    });
  }
}
