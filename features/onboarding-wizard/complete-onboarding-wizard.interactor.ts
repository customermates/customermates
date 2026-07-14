import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";

export abstract class CompleteOnboardingWizardRepo {
  abstract markOnboardingWizardCompleted(args: { userId: string }): Promise<void>;
}

@TenantInteractor()
export class CompleteOnboardingWizardInteractor extends AuthenticatedInteractor<void, null> {
  constructor(private repo: CompleteOnboardingWizardRepo) {
    super();
  }

  async invoke(): Promise<{ ok: true; data: null }> {
    const { id } = getTenantUser();
    await this.repo.markOnboardingWizardCompleted({ userId: id });
    return { ok: true as const, data: null };
  }
}
