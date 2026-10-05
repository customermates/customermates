import type { OnboardingWizardProgress } from "./onboarding-wizard-progress.schema";

export abstract class SaveOnboardingWizardProgressRepo {
  abstract saveOnboardingWizardProgress(progress: OnboardingWizardProgress): Promise<boolean>;
}
