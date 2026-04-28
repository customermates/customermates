import { z } from "zod";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { getTenantUser } from "@/core/decorators/tenant-context";

export abstract class CompleteOnboardingWizardRepo {
  abstract markOnboardingWizardCompleted(args: { userId: string }): Promise<void>;
}

@TentantInteractor()
export class CompleteOnboardingWizardInteractor extends BaseInteractor<void, null> {
  constructor(private repo: CompleteOnboardingWizardRepo) {
    super();
  }

  @ValidateOutput(z.null())
  async invoke(): Promise<{ ok: true; data: null }> {
    const { id } = getTenantUser();
    await this.repo.markOnboardingWizardCompleted({ userId: id });
    return { ok: true as const, data: null };
  }
}
