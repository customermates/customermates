import type { OnboardingFunnelRepo, OnboardingTemplateChoice } from "@/features/onboarding-funnel/onboarding-funnel.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";

@TenantInteractor()
export class GetOnboardingTemplateChoiceInteractor {
  constructor(private readonly repo: Pick<OnboardingFunnelRepo, "findOnboardingTemplateChoice">) {}

  async invoke(): Promise<{ ok: true; data: OnboardingTemplateChoice }> {
    return { ok: true as const, data: await this.repo.findOnboardingTemplateChoice() };
  }
}
