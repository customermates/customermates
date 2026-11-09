import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { Validated } from "@/core/validation/validation.utils";
import type { CompleteOnboardingSetupStepRepo } from "@/features/onboarding-wizard/complete-onboarding-setup-step.repo";
import type { OnboardingFunnelRepo } from "./onboarding-funnel.repo";
import type { OnboardingJob } from "./onboarding-job";

import { z } from "zod";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";
import { OnboardingJobSchema } from "./onboarding-job";

const Schema = z.strictObject({ job: OnboardingJobSchema });
export type SelectOnboardingJobData = z.infer<typeof Schema>;

export type SelectOnboardingJobResult =
  | { job: "workspace"; next: "setup" }
  | { job: "agent"; next: "ai" }
  | { job: "followup"; next: "playbook" };

@SystemInteractor
export class SelectOnboardingJobInteractor {
  constructor(
    private funnel: OnboardingFunnelRepo,
    private setupStep: CompleteOnboardingSetupStepRepo,
    private routeGuardService: RouteGuardService,
  ) {}

  @Validate(Schema)
  async invoke(data: SelectOnboardingJobData): Promise<Awaited<Validated<SelectOnboardingJobResult>> | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    const user = resolution.user;
    if (!user) return redirectTo("/auth/signin");
    if (!user.role?.isSystemRole) return redirectTo("/");
    const job: OnboardingJob = data.job;

    return runWithTenant(user, async () => {
      await this.funnel.recordFunnelEvent({ type: "jobSelected", occurredAt: new Date(), job });
      if (job === "workspace") return { ok: true as const, data: { job, next: "setup" as const } };
      if (job === "followup") return { ok: true as const, data: { job, next: "playbook" as const } };

      await this.setupStep.markOnboardingSetupStepCompleted({ userId: user.id });
      return { ok: true as const, data: { job, next: "ai" as const } };
    });
  }
}
