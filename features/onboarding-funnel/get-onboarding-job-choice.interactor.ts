import type { OnboardingFunnelRepo } from "./onboarding-funnel.repo";
import type { OnboardingJob } from "./onboarding-job";
import type { OnboardingPlaybook } from "./onboarding-playbook";
import type { TeamSize } from "./team-size";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { preselectedOnboardingJob } from "./onboarding-job";
import { suggestedOnboardingPlaybook } from "./onboarding-playbook";

export type OnboardingJobChoiceView = {
  selectedJob: OnboardingJob | null;
  signupJob: OnboardingJob | null;
  preselectedJob: OnboardingJob;
  suggestedPlaybook: OnboardingPlaybook | null;
  discoveryResolved: boolean;
  teamSize: TeamSize | null;
};

@TenantInteractor()
export class GetOnboardingJobChoiceInteractor {
  constructor(private readonly repo: OnboardingFunnelRepo) {}

  async invoke(): Promise<{ ok: true; data: OnboardingJobChoiceView }> {
    const { signupLandingPath, ...choice } = await this.repo.findOnboardingJobChoice();
    return {
      ok: true as const,
      data: {
        ...choice,
        preselectedJob: preselectedOnboardingJob(choice),
        suggestedPlaybook: suggestedOnboardingPlaybook(signupLandingPath),
      },
    };
  }
}
